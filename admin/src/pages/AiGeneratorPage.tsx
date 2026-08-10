import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const DEFAULTS = {
  monster: "lobo ancião de gelo da floresta, nível 12, que usa mordida congelante",
};

const TITLES = {
  monster: "Gerar Monstro",
};

const DESCRIPTIONS = {
  monster: "Cria um monstro completo: stats, skills e drops (com taxa de drop) via Gemini/Groq.",
};

interface Result {
  provider: string;
  data: any;
}

export default function AiGeneratorPage() {
  const [kind, setKind] = useState<"monster">("monster");
  const [prompt, setPrompt] = useState(DEFAULTS.monster);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return toast.error("Descreva o que a IA deve criar");
    setBusy(true);
    setResult(null);
    try {
      const res = await adminApi.ai.generateMonster(prompt.trim());
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
          <h1 className="text-2xl font-bold">Gerador de Monstros por IA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gemini (primeiro) com fallback Groq. Gera e já salva no banco. Raids e PvP são configurados manualmente.
          </p>
        </div>
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
            placeholder="Descreva o monstro que a IA deve criar..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPrompt(DEFAULTS.monster)}
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
