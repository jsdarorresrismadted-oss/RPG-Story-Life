import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

type Kind = "monster" | "raid" | "pvp";

const DEFAULTS: Record<Kind, string> = {
  monster: "lobo ancião de gelo da floresta, nível 12, que usa mordida congelante",
  raid: "raid de 10 ondas de cultistas do abismo em um templo corrompido, com boss dracolich",
  pvp: "temporada 2 da arena — recompensas generosas por win streak de 3, 5 e 10 vitórias",
};

const TITLES: Record<Kind, string> = {
  monster: "Gerar Monstro",
  raid: "Gerar Raid",
  pvp: "Gerar Config de PvP (Arena)",
};

const DESCRIPTIONS: Record<Kind, string> = {
  monster: "Cria um monstro completo: stats, skills e drops (com taxa de drop) via Gemini/Groq.",
  raid: "Cria um mapa de raid completo: config (ondas, dificuldade, tentativas) + monstros das ondas + boss com drops.",
  pvp: "Gera a configuração da arena (recompensas, cooldown, matchmaking, regras de fuga) e salva em SystemConfig.",
};

interface Result {
  provider: string;
  data: any;
}

export default function AiGeneratorPage() {
  const [kind, setKind] = useState<Kind>("monster");
  const [prompt, setPrompt] = useState(DEFAULTS.monster);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const switchKind = (k: Kind) => {
    setKind(k);
    setPrompt(DEFAULTS[k]);
    setResult(null);
  };

  const generate = async () => {
    if (!prompt.trim()) return toast.error("Descreva o que a IA deve criar");
    setBusy(true);
    setResult(null);
    try {
      let res;
      if (kind === "monster") res = await adminApi.ai.generateMonster(prompt.trim());
      else if (kind === "raid") res = await adminApi.ai.generateRaid(prompt.trim());
      else res = await adminApi.ai.generatePvp(prompt.trim());
      setResult({ provider: (res.data.providers || []).join(", "), data: res.data.data });
      toast.success("Gerado e salvo no banco!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao gerar");
    } finally {
      setBusy(false);
    }
  };

  const data = result?.data;
  const warnings = data?.warnings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerador de Conteúdo por IA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gemini (primeiro) com fallback Groq. Gera e já salva no banco.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(Object.keys(TITLES) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => switchKind(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              kind === k ? "bg-accent-600 text-white" : "bg-dark-700 text-gray-300 hover:bg-dark-600"
            }`}
          >
            {TITLES[k]}
          </button>
        ))}
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-medium text-white">{TITLES[kind]}</h2>
          <p className="text-xs text-gray-500">{DESCRIPTIONS[kind]}</p>
        </div>
        <div>
          <label className={labelClass}>Prompt para a IA</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Descreva o que a IA deve criar..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPrompt(DEFAULTS[kind])}
            className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            Exemplo
          </button>
          <button
            onClick={generate}
            disabled={busy}
            className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy ? "Gerando (pode levar ~1min)..." : "Gerar e salvar"}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">Resultado salvo</h3>
              {result.provider && <p className="text-xs text-gray-500">Providers: {result.provider}</p>}
            </div>
            <button onClick={() => setResult(null)} className="text-xs text-gray-400 hover:text-white">
              Fechar
            </button>
          </div>
          <pre className="p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
          {Array.isArray(warnings) && warnings.length > 0 && (
            <div className="px-4 py-3 border-t border-dark-600">
              <p className="text-[11px] text-amber-400 mb-1">Avisos:</p>
              <ul className="text-xs text-amber-300/80 space-y-0.5">
                {warnings.map((w: string, i: number) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
