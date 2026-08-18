import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Sparkles, Wand2, Loader2, RefreshCw, CheckCircle2, Layers } from "lucide-react";
import { adminApi } from "../api";

interface GeneratedItemResult {
  plan: ItemPlan;
  plans?: ItemPlan[];
  providers?: string[];
}

interface ItemPlan {
  name: string;
  description: string;
  subtype: string;
  icon?: string | null;
  stats: Record<string, number>;
  attackSpeedMs?: number;
  dps?: number;
  buyPrice: number;
  sellPrice: number;
}

const TYPE_OPTIONS = [
  { value: "weapon", label: "Arma" },
  { value: "helm", label: "Elmo" },
  { value: "armor", label: "Armadura" },
  { value: "cape", label: "Capa" },
  { value: "material", label: "Material (drop de mobs)" },
];

const SUBTYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  weapon: [
    { value: "auto", label: "Automático (IA escolhe)" },
    { value: "sword", label: "Espada" },
    { value: "dagger", label: "Adaga" },
    { value: "longsword", label: "Espada Longa" },
    { value: "axe", label: "Machado" },
    { value: "mace", label: "Martelo" },
    { value: "spear", label: "Lança" },
    { value: "bow", label: "Arco" },
    { value: "staff", label: "Cajado" },
  ],
  helm: [
    { value: "auto", label: "Automático (IA escolhe)" },
    { value: "cap", label: "Gorro" },
    { value: "helmet", label: "Capacete" },
    { value: "crown", label: "Coroa" },
    { value: "hood", label: "Capuz" },
  ],
  armor: [
    { value: "auto", label: "Automático (IA escolhe)" },
    { value: "light", label: "Leve" },
    { value: "heavy", label: "Pesada" },
    { value: "robe", label: "Túnica" },
  ],
  cape: [{ value: "auto", label: "Automático (IA escolhe)" }],
};

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
  const [level, setLevel] = useState(1);
  const [subtype, setSubtype] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GeneratedItemResult | null>(null);
  const [seed, setSeed] = useState(1);
  const [prompt, setPrompt] = useState("");

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
        subtype: type !== "material" && subtype !== "auto" ? subtype : undefined,
        seed,
        prompt: prompt.trim() || undefined,
      });
      setResult(data);
      setSeed((s) => s + 1);
      toast.success((data.plans?.length || 1) > 1 ? `${data.plans.length} itens gerados! Revise e salve.` : "Item gerado! Revise e salve.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao gerar item");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (plan: ItemPlan) => {
    setSaving(true);
    try {
      const isMaterial = type === "material";
      await adminApi.items.create({
        name: plan.name,
        description: plan.description,
        icon: plan.icon || undefined,
        type: isMaterial ? "consumable" : type,
        subtype: isMaterial ? "material" : plan.subtype || undefined,
        rarity,
        level,
        rank: 1,
        buyPrice: plan.buyPrice,
        sellPrice: plan.sellPrice,
        isActive: false,
        isTradable: true,
        isSellable: true,
        isStackable: isMaterial,
        maxStack: isMaterial ? 99 : 1,
      });
      toast.success(`Item "${plan.name}" salvo (rascunho)!`);
      setOpen(false);
      setResult(null);
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao salvar item");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async (plans: ItemPlan[]) => {
    setSaving(true);
    let saved = 0;
    try {
      for (const plan of plans) {
        const isMaterial = type === "material";
        await adminApi.items.create({
          name: plan.name,
          description: plan.description,
          icon: plan.icon || undefined,
          type: isMaterial ? "consumable" : type,
          subtype: isMaterial ? "material" : plan.subtype || undefined,
          rarity,
          level,
          rank: 1,
          buyPrice: plan.buyPrice,
          sellPrice: plan.sellPrice,
          isActive: false,
          isTradable: true,
          isSellable: true,
          isStackable: isMaterial,
          maxStack: isMaterial ? 99 : 1,
        });
        saved++;
      }
      toast.success(`${saved} itens salvos (rascunho)!`);
      setOpen(false);
      setResult(null);
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao salvar itens");
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
              A IA planeja o item (nome, descrição, preços) sem depender de serviços externos. Escolha o{" "}
              <span className="text-cyan-300">subtipo</span> (ex.: cajado, adaga) ou deixe "Automático". Equipamentos
              (arma, elmo, armadura, capa) nascem sem DPS/velocidade — armas são cascas (só o{" "}
              <span className="text-purple-300">encantamento</span> dá DPS), e elmos, armaduras e capas ganham{" "}
              <span className="text-green-300">atributos calculados</span> por nível e raridade.
              O tipo <span className="text-cyan-300">Material</span> gera matéria-prima empilhável com nome de criatura
              do mundo (pronta para usar como drop de mobs). O item nasce como{" "}
              <span className="text-yellow-400">rascunho (inativo)</span>.
            </p>

            <label className="text-xs text-gray-400 block">
              Prompt livre (opcional)
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder='Ex.: "5 cajados de gelo nível 20, temática inverno"'
                className={inputClass + " mt-1 resize-y"}
              />
              <span className="block text-[10px] text-gray-500 mt-0.5">
                Entende: quantidade de itens, nível, subtipo (cajado, adaga...) e tema.
              </span>
            </label>

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
              {type !== "material" && (
                <label className="text-xs text-gray-400">
                  Subtipo
                  <select
                    value={subtype}
                    onChange={(e) => setSubtype(e.target.value)}
                    className={inputClass + " mt-1"}
                    disabled={!SUBTYPE_OPTIONS[type]}
                  >
                    {(SUBTYPE_OPTIONS[type] || SUBTYPE_OPTIONS.weapon).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-xs text-gray-400">
                Nível
                <input type="number" min={1} max={150} value={level} onChange={(e) => setLevel(parseInt(e.target.value) || 1)} className={inputClass + " mt-1"} />
                <span className="block text-[10px] text-gray-500 mt-0.5">Padrão: 1 (nível do item)</span>
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
              <div className="mt-5 space-y-4">
                {result.plans && result.plans.length > 1 && (
                  <p className="text-xs text-gray-400">
                    <span className="text-cyan-300">{result.plans.length} itens gerados</span> — revise e salve cada um
                    individualmente.
                  </p>
                )}
                {(result.plans && result.plans.length > 0 ? result.plans : [result.plan]).map((plan, idx) => (
                  <div key={idx} className="bg-dark-900/60 border border-dark-600 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      {plan.icon && (
                        <img
                          src={plan.icon}
                          alt={plan.name}
                          className="w-12 h-12 rounded-lg bg-dark-800 border border-dark-600 object-contain p-1"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white">{plan.name}</p>
                          {plan.subtype && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">{plan.subtype}</span>}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300">{RARITY_OPTIONS.find((r) => r.value === rarity)?.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">Nv. {level}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{plan.description}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {type !== "material" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300">
                          {type === "weapon"
                            ? "Arma casca — DPS só via encantamento"
                            : "Atributos calculados por nível + raridade"}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">Compra: {Number(plan.buyPrice).toLocaleString()}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">Venda: {Number(plan.sellPrice).toLocaleString()}</span>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      {(result.plans?.length || 1) > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-800 text-gray-500 self-center">{idx + 1}/{result.plans!.length}</span>
                      )}
                      <button
                        onClick={() => handleSave(plan)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        {saving ? "Salvando..." : "Salvar item (rascunho)"}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end">
                  {result.plans && result.plans.length > 1 && (
                    <button
                      onClick={() => handleSaveAll(result.plans!)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                      {saving ? "Salvando..." : `Salvar todos (${result.plans.length})`}
                    </button>
                  )}
                  <button
                    onClick={handleGenerate}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Gerar de novo
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
