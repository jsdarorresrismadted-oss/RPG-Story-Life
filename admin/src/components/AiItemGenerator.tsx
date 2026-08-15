import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Sparkles, Wand2, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { adminApi } from "../api";

interface GeneratedItemResult {
  plan: {
    name: string;
    description: string;
    subtype: string;
    icon?: string | null;
    stats: Record<string, number>;
    attackSpeedMs?: number;
    dps?: number;
    buyPrice: number;
    sellPrice: number;
  };
}

const TYPE_OPTIONS = [
  { value: "weapon", label: "Arma" },
  { value: "helm", label: "Elmo" },
  { value: "armor", label: "Armadura" },
  { value: "cape", label: "Capa" },
  { value: "material", label: "Material" },
];

const RARITY_OPTIONS = [
  { value: "common", label: "Comum" },
  { value: "uncommon", label: "Incomum" },
  { value: "rare", label: "Raro" },
  { value: "epic", label: "Épico" },
  { value: "legendary", label: "Lendário" },
  { value: "mythic", label: "Mítico" },
];

const STAT_LABELS: Record<string, string> = {
  strength: "Força",
  intellect: "Intelecto",
  endurance: "Resistência",
  dexterity: "Destreza",
  wisdom: "Sabedoria",
  luck: "Sorte",
};

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none";

export default function AiItemGenerator({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<{ gemini: boolean; groq: boolean } | null>(null);
  const [type, setType] = useState("weapon");
  const [rarity, setRarity] = useState("rare");
  const [level, setLevel] = useState(6);
  const [theme, setTheme] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedItemResult | null>(null);
  const [seed, setSeed] = useState(1);
  const [variants, setVariants] = useState(3);

  useEffect(() => {
    adminApi.classes
      .aiConfig()
      .then(({ data }) => setProviders(data))
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await adminApi.items.generate({
        type,
        rarity,
        level,
        theme: theme.trim() || undefined,
        material: material.trim() || undefined,
        color: color.trim() || undefined,
        seed,
        variants,
      });
      setResult(data);
      setSeed((s) => s + 1);
      toast.success("Item gerado! Revise e salve.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao gerar item");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const isMaterial = type === "material";
      const zeroStats = { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 };
      await adminApi.items.create({
        name: result.plan.name,
        description: result.plan.description,
        icon: result.plan.icon || undefined,
        type: isMaterial ? "consumable" : type,
        subtype: isMaterial ? "material" : result.plan.subtype || undefined,
        rarity,
        level,
        rank: 1,
        buyPrice: result.plan.buyPrice,
        sellPrice: result.plan.sellPrice,
        isActive: false,
        isTradable: true,
        isSellable: true,
        isStackable: isMaterial ? true : false,
        maxStack: isMaterial ? 99 : 1,
        attackSpeedMs: isMaterial ? 0 : result.plan.attackSpeedMs || 0,
        dps: isMaterial ? 0 : result.plan.dps || 0,
        strength: isMaterial ? 0 : result.plan.stats.strength || 0,
        intellect: isMaterial ? 0 : result.plan.stats.intellect || 0,
        endurance: isMaterial ? 0 : result.plan.stats.endurance || 0,
        dexterity: isMaterial ? 0 : result.plan.stats.dexterity || 0,
        wisdom: isMaterial ? 0 : result.plan.stats.wisdom || 0,
        luck: isMaterial ? 0 : result.plan.stats.luck || 0,
      });
      toast.success(`Item "${result.plan.name}" salvo (rascunho)!`);
      setOpen(false);
      setResult(null);
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao salvar item");
    } finally {
      setSaving(false);
    }
  };

  if (providers && !providers.groq) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Wand2 size={16} /> Gerar item com IA local
        </button>
        <p className="text-[10px] text-gray-500">Sem GROQ_API_KEY: plano 100% local (nome, atributos, preços).</p>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Wand2 size={16} /> Gerar item com IA
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !busy && !saving && setOpen(false)}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles size={18} className="text-fuchsia-400" /> Gerar item com IA
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              A IA planeja o item (nome, atributos, preços) sem depender de serviços externos. Deixe Tema/Material/Cor vazios
              para a IA escolher tudo. O tipo <span className="text-cyan-300">Material</span> gera matéria-prima empilhável
              (usada em craft e quests de coleta). O item nasce como <span className="text-yellow-400">rascunho (inativo)</span>.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="text-xs text-gray-400">
                Tipo
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass + " mt-1"}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-400">
                Raridade
                <select value={rarity} onChange={(e) => setRarity(e.target.value)} className={inputClass + " mt-1"}>
                  {RARITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-400">
                Nível
                <input type="number" min={1} max={100} value={level} onChange={(e) => setLevel(parseInt(e.target.value) || 1)} className={inputClass + " mt-1"} />
              </label>
              <label className="text-xs text-gray-400">
                Tema (opcional)
                <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="ex.: dragão de gelo" className={inputClass + " mt-1"} />
              </label>
              <label className="text-xs text-gray-400">
                Material (opcional)
                <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="ex.: aço negro" className={inputClass + " mt-1"} />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {busy ? "Gerando..." : "Gerar item"}
              </button>
            </div>

            {result && (
              <div className="mt-5 bg-dark-900/60 border border-dark-600 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  {result.plan.icon && (
                    <img
                      src={result.plan.icon}
                      alt={result.plan.name}
                      className="w-12 h-12 rounded-lg bg-dark-800 border border-dark-600 object-contain p-1"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{result.plan.name}</p>
                      {result.plan.subtype && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">{result.plan.subtype}</span>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300">{RARITY_OPTIONS.find((r) => r.value === rarity)?.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">Nv. {level}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{result.plan.description}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(result.plan.stats).map(([k, v]) =>
                    v > 0 ? (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-800 text-gray-300">
                        {STAT_LABELS[k] || k}: <span className="text-white font-medium">{v}</span>
                      </span>
                    ) : null
                  )}
                  {type === "weapon" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-300">
                      DPS: {Number(result.plan.dps || 0).toLocaleString()} · Velocidade: {(Number(result.plan.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">Compra: {Number(result.plan.buyPrice).toLocaleString()}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">Venda: {Number(result.plan.sellPrice).toLocaleString()}</span>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Gerar de novo
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    {saving ? "Salvando..." : "Salvar item (rascunho)"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
