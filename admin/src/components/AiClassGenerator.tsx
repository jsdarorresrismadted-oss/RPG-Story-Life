import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Sparkles, Wand2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { adminApi } from "../api";

interface GeneratedClassResult {
  id: string;
  name: string;
  slug: string;
  role: string;
  combatType: string;
  requiredLevel: number;
  price: number;
  skills: number;
  passives: number;
  effects: string[];
  coreStats: Record<string, number>;
  preview: Record<string, number>;
  warnings?: string[];
}

export default function AiClassGenerator({ onGenerated }: { onGenerated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ gemini: boolean; groq: boolean } | null>(null);
  const [results, setResults] = useState<GeneratedClassResult[]>([]);
  const [activating, setActivating] = useState<string | null>(null);
  const [activatingAll, setActivatingAll] = useState(false);

  useEffect(() => {
    adminApi.classes
      .aiConfig()
      .then(({ data }) => setProviders(data))
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Descreva a classe primeiro (ex.: 'tanque de gelo com skill que reflete dano')");
      return;
    }
    setBusy(true);
    setResults([]);
    try {
      const { data } = await adminApi.classes.generate({ prompt: prompt.trim(), count });
      const list = Array.isArray(data.data) ? data.data : [];
      setResults(list);
      const provider = Array.isArray(data.providers) ? data.providers.join(" + ") : "";
      toast.success(`${list.length} classe(s) gerada(s)${provider ? ` (${provider})` : ""}!`);
      onGenerated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao gerar classe");
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      await adminApi.classes.activate(id);
      const name = results.find((r) => r.id === id)?.name || "";
      setResults((prev) => prev.filter((r) => r.id !== id));
      toast.success(`Classe "${name}" ativada!`);
      onGenerated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao ativar classe");
    } finally {
      setActivating(null);
    }
  };

  const handleActivateAll = async () => {
    setActivatingAll(true);
    try {
      for (const r of results) {
        await adminApi.classes.activate(r.id);
      }
      toast.success(`${results.length} classe(s) ativada(s)!`);
      setResults([]);
      onGenerated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao ativar classes");
    } finally {
      setActivatingAll(false);
    }
  };

  const handleActivateAllHeader = async () => {
    setActivatingAll(true);
    try {
      const { data } = await adminApi.classes.activateAll();
      const n = Number(data?.activated || 0);
      toast.success(n > 0 ? `${n} classe(s) rascunho ativada(s)!` : "Nenhum rascunho para ativar");
      onGenerated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Falha ao ativar classes");
    } finally {
      setActivatingAll(false);
    }
  };

  const coreLabel: Record<string, string> = {
    strength: "Força",
    intellect: "Intelecto",
    endurance: "Vigor",
    dexterity: "Destreza",
    wisdom: "Sabedoria",
    luck: "Sorte",
  };

  const previewLabel: Record<string, string> = {
    hp: "HP",
    mana: "Mana",
    attackPower: "Atk Pwr",
    spellPower: "Mag Pwr",
    hitChance: "Hit",
    critChance: "Crit",
    critDamage: "Crit Dmg",
    dodge: "Dodge",
    manaRegenPerTick: "Mana/tick",
    cooldownReduction: "CDR",
  };

  if (!providers?.gemini && !providers?.groq) {
    return (
      <button
        title="Defina GEMINI_API_KEY ou GROQ_API_KEY nas variáveis do Railway para ativar"
        className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed"
        disabled
      >
        <Wand2 size={16} /> IA indisponível
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleActivateAllHeader}
        disabled={activatingAll}
        className="flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/40 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        title="Ativa todas as classes que estão como rascunho (isActive: false)"
      >
        {activatingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {activatingAll ? "Ativando..." : "Ativar todas"}
      </button>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Wand2 size={16} /> Gerar com IA
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !busy && setOpen(false)}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles size={18} className="text-fuchsia-400" /> Gerar classe com IA
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Modelos: Gemini {providers?.gemini ? "✓" : "✗"} · Groq {providers?.groq ? "✓" : "✗"} — Gemini primeiro, Groq de fallback.
              A classe nasce como <span className="text-yellow-400">rascunho (inativa)</span>: revise e clique em Confirmar para ativar, ou edite no editor de Classes.
            </p>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder='Ex.: "classe tanque de gelo com skill que reflete dano e passivas defensivas"'
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none resize-y"
            />
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                Quantidade:
                <select
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-2 py-1.5 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {busy ? "Gerando..." : "Gerar"}
              </button>
            </div>

            {results.length > 0 && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    {results.length} rascunho(s) — revise e confirme para ativar
                  </p>
                  <button
                    onClick={handleActivateAll}
                    disabled={activatingAll || activating !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {activatingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    {activatingAll ? "Ativando..." : "Ativar todas"}
                  </button>
                </div>
                {results.map((r) => (
                  <div key={r.id} className="bg-dark-900/60 border border-dark-600 rounded-xl p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <p className="font-semibold text-white">{r.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300 font-mono">{r.slug}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">{r.role}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300">{r.combatType}</span>
                      {r.price > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">{r.price} gold</span>}
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">rascunho</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                      {Object.entries(r.coreStats || {}).map(([k, v]) => (
                        <span key={k} className="text-gray-400">
                          {coreLabel[k] || k}: <span className="text-white font-medium">{v}</span>
                        </span>
                      ))}
                    </div>
                    {r.preview && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(previewLabel).map(([k, label]) => {
                          const v = r.preview[k];
                          if (v === undefined) return null;
                          return (
                            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-800 text-gray-300">
                              {label} {typeof v === "number" ? Math.round(v * 10) / 10 : v}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                      <span>Skills: {r.skills} + auto</span>
                      <span>Passivas: {r.passives}</span>
                      {r.effects.length > 0 && <span>Efeitos: {r.effects.join(", ")}</span>}
                    </div>
                    {r.warnings && r.warnings.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {r.warnings.map((w, i) => (
                          <p key={i} className="text-[11px] text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={11} /> {w}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleActivate(r.id)}
                        disabled={activating !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {activating === r.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        {activating === r.id ? "Ativando..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
