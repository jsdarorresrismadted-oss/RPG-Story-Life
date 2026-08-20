import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, RefreshCw, ScrollText, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { adminApi } from "../api";
import EntityFormFields, { EntityField } from "../components/EntityFormFields";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const QUEST_TYPES = ["main", "side", "event"];
const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
const PERIODS = ["", "daily", "weekly", "monthly"];

const QUEST_FIELDS: EntityField[] = [
  { name: "title", label: "Título", type: "text", required: true },
  { name: "description", label: "Descrição", type: "textarea", required: true },
  {
    name: "type",
    label: "Tipo",
    type: "select",
    options: QUEST_TYPES,
    required: true,
    hint: "main = história • side = lateral • event = evento (main/side/event geradas pela IA)",
  },
  {
    name: "period",
    label: "Período (quest de passe)",
    type: "select",
    options: PERIODS,
    defaultValue: "",
    hint: "daily/weekly/monthly = pool rotativo do Season Pass. Deixe vazio para quest normal.",
  },
  { name: "difficulty", label: "Dificuldade", type: "select", options: DIFFICULTIES, defaultValue: "easy" },
  { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 1 },
  { name: "xpReward", label: "Recompensa de XP", type: "number", defaultValue: 0 },
  { name: "goldReward", label: "Recompensa de ouro", type: "number", defaultValue: 0 },
  {
    name: "objectives",
    label: "Objetivos",
    type: "json",
    jsonSchema: {
      mode: "object-array",
      addLabel: "Adicionar objetivo",
      fields: [
        { name: "type", label: "Tipo", type: "select", options: ["kill", "collect", "talk", "reach", "use", "escort", "defeat_boss"] },
        { name: "monsterName", label: "Alvo (nome ou ID)", type: "text", placeholder: "ex: Rato da Floresta" },
        { name: "itemName", label: "Item (collect)", type: "item-select" },
        { name: "amount", label: "Quantidade", type: "number" },
      ],
    },
    hint: "kill = matar monstro por NOME • collect = coletar item selecionado da lista. O progresso é contado pelo nome exato.",
  },
  {
    name: "itemRewards",
    label: "Recompensas de item",
    type: "json",
    jsonSchema: {
      mode: "object-array",
      addLabel: "Adicionar recompensa",
      fields: [
        { name: "itemName", label: "Item", type: "item-select" },
        { name: "quantity", label: "Quantidade", type: "number" },
      ],
    },
    hint: "Escolha o item da lista — assim o nome sempre bate com o item do jogo.",
  },
  { name: "isRepeatable", label: "Repetível", type: "boolean", defaultValue: false },
  { name: "isActive", label: "Ativa (aparece no jogo)", type: "boolean", defaultValue: true },
  { name: "sortOrder", label: "Ordem", type: "number", defaultValue: 0 },
];

const DEFAULT_AI_PROMPT = "3 quests de caçada na floresta para jogadores nível 5 a 10, uma quest de história sobre um artefato roubado e uma quest lateral de coleta de ervas";

function questDefaults(): Record<string, any> {
  const d: Record<string, any> = {};
  for (const f of QUEST_FIELDS) {
    d[f.name] = f.type === "boolean" ? !!f.defaultValue : f.defaultValue ?? (f.type === "json" ? [] : "");
  }
  d.giverNpcId = "";
  return d;
}

function fillFromQuest(q: any): Record<string, any> {
  const values = questDefaults();
  for (const f of QUEST_FIELDS) {
    values[f.name] = q[f.name] ?? values[f.name];
  }
  try {
    values.objectives = JSON.parse(q.objectives || "[]");
  } catch {
    values.objectives = [];
  }
  try {
    values.itemRewards = JSON.parse(q.itemRewards || "[]");
  } catch {
    values.itemRewards = [];
  }
  values.giverNpcId = q.giverNpcId || "";
  return values;
}

export default function QuestsPage() {
  const [quests, setQuests] = useState<any[]>([]);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState<Record<string, any>>(questDefaults());
  const [saving, setSaving] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiBusy, setAiBusy] = useState(false);

  const load = async (keepSelection = true) => {
    setLoading(true);
    try {
      const [qRes, nRes] = await Promise.all([adminApi.quests.list(), adminApi.npcs.list()]);
      setQuests(Array.isArray(qRes.data) ? qRes.data : []);
      setNpcs(Array.isArray(nRes.data) ? nRes.data : []);
      if (!keepSelection) setSelectedId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(() => quests.find((q) => q.id === selectedId) || null, [quests, selectedId]);

  const filteredQuests = useMemo(() => {
    if (!filter.trim()) return quests;
    const q = filter.toLowerCase();
    return quests.filter((x) => x.title.toLowerCase().includes(q) || String(x.type).toLowerCase().includes(q));
  }, [quests, filter]);

  const selectQuest = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    const q = quests.find((x) => x.id === id);
    if (q) setForm(fillFromQuest(q));
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setForm(questDefaults());
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.title || "").trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of QUEST_FIELDS) {
        const v = form[f.name];
        if (f.type === "boolean") payload[f.name] = !!v;
        else if (f.type === "json") payload[f.name] = v;
        else payload[f.name] = v;
      }
      if (!Array.isArray(payload.objectives) || payload.objectives.length === 0) {
        toast.error("Adicione pelo menos um objetivo (matar/coletar)");
        return;
      }
      payload.giverNpcId = String(form.giverNpcId || "").trim() || null;
      let saved;
      if (creating) {
        saved = (await adminApi.quests.create(payload)).data;
        toast.success(`Quest "${payload.title}" criada!`);
      } else {
        if (!selectedId) return;
        saved = (await adminApi.quests.update(selectedId, payload)).data;
        toast.success("Quest atualizada!");
      }
      setQuests((prev) => (creating ? [saved, ...prev] : prev.map((x) => (x.id === saved.id ? saved : x))));
      setSelectedId(saved.id);
      setCreating(false);
      setForm(fillFromQuest(saved));
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: any) => {
    if (!window.confirm(`Excluir a quest "${q.title}"?`)) return;
    try {
      await adminApi.quests.delete(q.id);
      toast.success("Quest excluída");
      await load(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Descreva as quests que a IA deve criar");
      return;
    }
    setAiBusy(true);
    try {
      const res = await adminApi.quests.generate(aiPrompt.trim());
      const saved = res.data?.data;
      const created = saved?.quests ?? [];
      if (created.length > 0) {
        toast.success(`${created.length} quest(s) gerada(s): ${created.map((q: any) => q.title).join(", ")}`);
      } else {
        toast.success("Quest gerada e salva no banco!");
      }
      setAiOpen(false);
      await load(false);
      const first = created?.[0] ?? saved;
      if (first?.id) {
        setSelectedId(first.id);
        setCreating(false);
        setForm(fillFromQuest(first));
      }
      (saved?.warnings ?? []).forEach((w: string) => toast(w, { icon: "⚠️" }));
      (saved?.errors ?? []).forEach((er: string) => toast(er, { icon: "⚠️" }));
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Falha ao gerar");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Missões com objetivos de matar/coletar — ou use o gerador de IA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Wand2 size={16} /> Gerar com IA
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nova Quest
          </button>
          <button onClick={() => load()} className="p-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors" title="Recarregar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Lista */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit">
          <div className="p-4 border-b border-dark-600">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar quest..." className={inputClass} />
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {loading && <p className="text-center text-gray-500 py-8">Carregando...</p>}
            {!loading && filteredQuests.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhuma quest — crie uma ou use o gerador de IA</p>
            )}
            {filteredQuests.map((q) => (
              <button
                key={q.id}
                onClick={() => selectQuest(q.id)}
                className={`w-full text-left px-4 py-3 border-b border-dark-700 transition-colors flex items-center gap-3 ${
                  selectedId === q.id ? "bg-accent-600/20 border-l-2 border-l-accent-500" : "hover:bg-dark-700/50"
                }`}
              >
                <span className="w-9 h-9 rounded bg-dark-700 flex items-center justify-center text-gray-600 shrink-0">
                  <ScrollText size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-white block truncate">{q.title}</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-dark-700 text-gray-400">{q.type}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-dark-700 text-gray-400">{q.difficulty}</span>
                    <span>Nv {q.requiredLevel}</span>
                    {q.giverNpc?.name && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-fuchsia-500/15 text-fuchsia-300">📜 {q.giverNpc.name}</span>}
                    {q.period && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-yellow-500/15 text-yellow-400">{q.period}</span>}
                  </span>
                </span>
                {!q.isActive && <span className="text-[10px] text-gray-600">inativa</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Detalhe */}
        <div className="space-y-4">
          {selected || creating ? (
            <form onSubmit={handleSave} className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{creating ? "Nova Quest" : selected?.title}</h3>
                {!creating && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selected!)}
                    className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                  >
                    <Trash2 size={15} /> Excluir
                  </button>
                )}
              </div>
              <EntityFormFields fields={QUEST_FIELDS} form={form} onChange={setForm} />
              <div>
                <label className={labelClass}>NPC que entrega a quest</label>
                <select
                  value={form.giverNpcId ?? ""}
                  onChange={(e) => setForm((f: any) => ({ ...f, giverNpcId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Nenhum NPC (quest sem entregador)</option>
                  {npcs
                    .filter((n) => n.type === "quest_giver" || n.type === "quest")
                    .map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                </select>
                <p className="text-[11px] text-gray-600 mt-1">
                  Cada NPC entrega suas próprias quests — uma quest pertence a UM único NPC (sem duplicidade).
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                {creating && (
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setSelectedId(quests[0]?.id ?? null); }}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={saving} className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? "Salvando..." : creating ? "Criar Quest" : "Salvar alterações"}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col items-center justify-center p-16 space-y-3">
              <Sparkles className="text-gray-600" size={28} />
              <p className="text-gray-500">Selecione uma quest, crie uma nova ou use o gerador de IA</p>
              <button
                onClick={() => setAiOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Wand2 size={16} /> Gerar Quest com IA
              </button>
            </div>
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !aiBusy && setAiOpen(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Wand2 size={18} className="text-fuchsia-400" /> Gerar Quests com IA
              </h2>
              <button onClick={() => setAiOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none" disabled={aiBusy}>
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Gemini (ou Groq como fallback) cria quests com objetivos de matar/coletar, vinculados por nome aos
              monstros/itens existentes — o progresso no jogo é contado pelo nome exato. Você pode pedir várias de uma
              vez (ex.: "5 quests da vila de pedra, níveis 5 a 15").
            </p>
            <label className={labelClass}>Prompt para a IA</label>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} className={inputClass} placeholder='Descreva as quests... ex.: "2 quests de história sobre um artefato roubado e 3 de caçada na floresta"' />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAiPrompt(DEFAULT_AI_PROMPT)} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                Exemplo
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiBusy}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {aiBusy ? "Gerando (pode levar ~1min)..." : "Gerar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
