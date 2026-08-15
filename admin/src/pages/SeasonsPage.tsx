import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Plus, Trash2, Sparkles, Save, X, ChevronDown, ChevronUp, Crown, Users, Layers } from "lucide-react";

const PASS_LEVELS = 50;

interface Season {
  id: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  tiers: { id: string; level: number; freeRewards: string; premiumRewards: string }[];
  _count?: { passes: number };
}

interface Reward {
  type: "gold" | "experience" | "item" | "classXp";
  value: string;
  itemName: string;
  quantity: string;
}

interface SeasonPassRow {
  id: string;
  level: number;
  isPremium: boolean;
  experience: string | number;
  purchasedAt: string;
  user: { username: string };
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";
const btnPrimary =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent-600 hover:bg-accent-700 text-white transition-colors disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-dark-600 text-gray-300 hover:text-white hover:border-dark-400 transition-colors";

function parseRewards(raw: string | any[]): Reward[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any) => ({
      type: ["gold", "experience", "item", "classXp"].includes(r?.type) ? r.type : "gold",
      value: String(r?.value ?? ""),
      itemName: r?.itemName ?? r?.slug ?? "",
      quantity: String(r?.quantity ?? "1"),
    }));
  } catch {
    return [];
  }
}

function RewardEditor({
  rewards,
  onChange,
  items,
}: {
  rewards: Reward[];
  onChange: (r: Reward[]) => void;
  items: { id: string; name: string }[];
}) {
  const update = (i: number, patch: Partial<Reward>) => {
    const next = rewards.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rewards.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select value={r.type} onChange={(e) => update(i, { type: e.target.value as Reward["type"] })} className={`${inputClass} !w-32`}>
            <option value="gold">Ouro</option>
            <option value="experience">XP</option>
            <option value="item">Item</option>
            <option value="classXp">XP de Classe</option>
          </select>
          {r.type === "item" ? (
            <select
              value={r.itemName}
              onChange={(e) => update(i, { itemName: e.target.value })}
              className={inputClass}
            >
              <option value="">— escolher item —</option>
              {items.map((it) => (
                <option key={it.id} value={it.name}>
                  {it.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min={0}
              placeholder="valor"
              value={r.value}
              onChange={(e) => update(i, { value: e.target.value })}
              className={inputClass}
            />
          )}
          {r.type === "item" && (
            <input
              type="number"
              min={1}
              placeholder="qtd"
              value={r.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              className={`${inputClass} !w-20`}
            />
          )}
          <button type="button" onClick={() => onChange(rewards.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rewards, { type: "gold", value: "", itemName: "", quantity: "1" }])}
        className="text-xs text-accent-400 hover:text-accent-300"
      >
        + Adicionar recompensa
      </button>
    </div>
  );
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [form, setForm] = useState({ name: "", description: "", startsAt: "", endsAt: "", isActive: true });
  const [saving, setSaving] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiTheme, setAiTheme] = useState("");
  const [aiStartsAt, setAiStartsAt] = useState("");
  const [aiEndsAt, setAiEndsAt] = useState("");
  const [aiRunning, setAiRunning] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tierDraft, setTierDraft] = useState<{ id: string; level: number; free: Reward[]; premium: Reward[] } | null>(null);
  const [tierSaving, setTierSaving] = useState(false);

  const [passes, setPasses] = useState<SeasonPassRow[]>([]);
  const [passesOpen, setPassesOpen] = useState(false);
  const [passesLoading, setPassesLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.seasons.list();
      setSeasons(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load seasons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    adminApi.items
      .list()
      .then(({ data }) => setItems((Array.isArray(data) ? data : []).map((i: any) => ({ id: i.id, name: i.name }))))
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", startsAt: "", endsAt: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (s: Season) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description,
      startsAt: s.startsAt ? s.startsAt.slice(0, 16) : "",
      endsAt: s.endsAt ? s.endsAt.slice(0, 16) : "",
      isActive: s.isActive,
    });
    setModalOpen(true);
  };

  const saveSeason = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await adminApi.seasons.update(editing.id, form);
        toast.success("Temporada atualizada");
      } else {
        const { data } = await adminApi.seasons.create(form);
        toast.success(`Temporada criada com ${data?.tiersCreated ?? PASS_LEVELS} níveis`);
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save season");
    } finally {
      setSaving(false);
    }
  };

  const deleteSeason = async (s: Season) => {
    if (!window.confirm(`Excluir a temporada "${s.name}"? Os passes e tiers de todos os jogadores serão removidos.`)) return;
    try {
      await adminApi.seasons.delete(s.id);
      toast.success("Temporada excluída");
      if (expandedId === s.id) setExpandedId(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete season");
    }
  };

  const toggleExpand = (s: Season) => {
    const next = expandedId === s.id ? null : s.id;
    setExpandedId(next);
    if (next) {
      setPasses([]);
      setPassesOpen(false);
    }
  };

  const openTier = (t: Season["tiers"][number]) => {
    setTierDraft({
      id: t.id,
      level: t.level,
      free: parseRewards(t.freeRewards),
      premium: parseRewards(t.premiumRewards),
    });
  };

  const saveTier = async () => {
    if (!tierDraft || !expandedId) return;
    setTierSaving(true);
    try {
      await adminApi.seasons.updateTier(expandedId, tierDraft.id, {
        freeRewards: tierDraft.free,
        premiumRewards: tierDraft.premium,
      });
      toast.success(`Nível ${tierDraft.level} salvo`);
      setTierDraft(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save tier");
    } finally {
      setTierSaving(false);
    }
  };

  const loadPasses = async (seasonId: string) => {
    setPassesLoading(true);
    try {
      const { data } = await adminApi.seasons.passes(seasonId);
      setPasses(Array.isArray(data) ? data : []);
      setPassesOpen(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load passes");
    } finally {
      setPassesLoading(false);
    }
  };

  const deletePass = async (p: SeasonPassRow) => {
    if (!window.confirm(`Remover o passe de "${p.user.username}" (nível ${p.level})?`)) return;
    try {
      await adminApi.seasons.deletePass(p.id);
      toast.success("Passe removido");
      if (expandedId) loadPasses(expandedId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete pass");
    }
  };

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setAiRunning(true);
    try {
      const { data } = await adminApi.seasons.generate({
        theme: aiTheme,
        startsAt: aiStartsAt || undefined,
        endsAt: aiEndsAt || undefined,
      });
      toast.success(`${data?.season?.name} criada — ${data?.tiersWithRewards} níveis com recompensas, ${data?.quests?.daily?.length ?? 0} diárias, ${data?.quests?.weekly?.length ?? 0} semanais, ${data?.quests?.monthly?.length ?? 0} mensais (pool)`);
      setAiOpen(false);
      setAiTheme("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to generate season");
    } finally {
      setAiRunning(false);
    }
  };

  const milestone = (level: number) => level % 5 === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Season Pass (Temporadas)</h1>
          <p className="text-sm text-gray-500">
            Passe de {PASS_LEVELS} níveis com trilha free e premium. Quest diária/semanal/mensal dão o XP inteiro para o passe.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`${btnPrimary} !bg-purple-600 hover:!bg-purple-700`} onClick={() => setAiOpen(true)}>
            <Sparkles size={16} /> IA: gerar temporada
          </button>
          <button className={btnPrimary} onClick={openCreate}>
            <Plus size={16} /> Nova temporada
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : seasons.length === 0 ? (
        <div className="border border-dashed border-dark-600 rounded-xl p-10 text-center text-gray-500">
          Nenhuma temporada. Crie uma manualmente ou deixe a IA gerar.
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map((s) => (
            <div key={s.id} className="border border-dark-600 rounded-xl overflow-hidden bg-dark-800/50">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{s.name}</span>
                    {s.isActive ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-green-500/20 text-green-400">ativa</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-dark-600 text-gray-400">rascunho</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {new Date(s.startsAt).toLocaleDateString()} → {new Date(s.endsAt).toLocaleDateString()} • {s._count?.passes ?? 0} passe(s) de jogadores
                  </p>
                  {s.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{s.description}</p>}
                </div>
                <button className={btnGhost} onClick={() => openEdit(s)}>
                  Editar
                </button>
                <button className={btnGhost} onClick={() => deleteSeason(s)}>
                  <Trash2 size={14} className="text-red-400" /> Excluir
                </button>
                <button className={btnGhost} onClick={() => toggleExpand(s)}>
                  <Layers size={14} /> Níveis
                  {expandedId === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {expandedId === s.id && (
                <div className="border-t border-dark-600 px-4 py-3">
                  <div className="grid grid-cols-10 gap-2 max-h-64 overflow-y-auto pr-1">
                    {s.tiers.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => openTier(t)}
                        className={`text-xs py-2 rounded-md border transition-colors ${
                          milestone(t.level)
                            ? "border-accent-500/60 bg-accent-600/20 text-accent-300 hover:bg-accent-600/40"
                            : "border-dark-600 bg-dark-900 text-gray-300 hover:border-dark-400"
                        }`}
                      >
                        {t.level}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button className={btnGhost} onClick={() => loadPasses(s.id)}>
                      <Users size={14} /> Passes dos jogadores ({s._count?.passes ?? 0})
                    </button>
                    {passesOpen && (
                      <button
                        className={btnGhost}
                        onClick={async () => {
                          if (!window.confirm(`Remover TODOS os passes desta temporada (${passes.length})?`)) return;
                          try {
                            const { data } = await adminApi.seasons.deleteAllPasses(s.id);
                            toast.success(data?.message || "Passes removidos");
                            setPasses([]);
                            setPassesOpen(false);
                            load();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message || "Failed");
                          }
                        }}
                      >
                        <Trash2 size={14} className="text-red-400" /> Excluir todos
                      </button>
                    )}
                  </div>
                  {passesOpen && (
                    <div className="mt-3 space-y-1">
                      {passesLoading ? (
                        <p className="text-xs text-gray-500">Carregando...</p>
                      ) : passes.length === 0 ? (
                        <p className="text-xs text-gray-500">Nenhum jogador comprou o passe ainda.</p>
                      ) : (
                        passes.map((p) => (
                          <div key={p.id} className="flex items-center gap-2 text-xs bg-dark-900 border border-dark-600 rounded-md px-3 py-1.5">
                            <Crown size={14} className={p.isPremium ? "text-yellow-400" : "text-gray-500"} />
                            <span className="text-white">{p.user.username}</span>
                            <span className="text-gray-400">
                              {p.isPremium ? "premium" : "free"} • nível {p.level} • {Number(p.experience).toLocaleString()} XP
                            </span>
                            <span className="flex-1" />
                            <button onClick={() => deletePass(p)} className="text-red-400 hover:text-red-300">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar temporada */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <form onSubmit={saveSeason} className="bg-dark-800 border border-dark-600 rounded-xl p-5 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">{editing ? "Editar temporada" : "Nova temporada"}</h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nome</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Descrição</label>
              <textarea
                className={`${inputClass} resize-y`}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Início</label>
                <input type="datetime-local" className={inputClass} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fim</label>
                <input type="datetime-local" className={inputClass} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-accent-600" />
              Ativa (aparece para os jogadores)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal nível do passe */}
      {tierDraft && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 w-full max-w-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">
              Nível {tierDraft.level} {milestone(tierDraft.level) && <span className="text-accent-400 text-sm">(marco)</span>}
            </h2>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                <span className="text-emerald-400">●</span> Trilha FREE (todos os jogadores)
              </label>
              <RewardEditor rewards={tierDraft.free} onChange={(free) => setTierDraft({ ...tierDraft, free })} items={items} />
            </div>
            <div className="border-t border-dark-600 pt-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                <span className="text-yellow-400">●</span> Trilha PREMIUM (passe pago)
              </label>
              <RewardEditor rewards={tierDraft.premium} onChange={(premium) => setTierDraft({ ...tierDraft, premium })} items={items} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className={btnGhost} onClick={() => setTierDraft(null)}>
                Cancelar
              </button>
              <button className={btnPrimary} onClick={saveTier} disabled={tierSaving}>
                <Save size={14} /> {tierSaving ? "Salvando..." : "Salvar nível"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal IA */}
      {aiOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <form onSubmit={generate} className="bg-dark-800 border border-dark-600 rounded-xl p-5 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles size={18} className="text-purple-400" /> Gerar temporada com IA
            </h2>
            <p className="text-xs text-gray-500">
              A IA cria: nome, descrição, os {PASS_LEVELS} níveis com recompensas free/premium (itens, ouro, XP) e o pool de quests
              diárias (4), semanais (3) e mensais (2). As quests entram no pool e são ativadas pela rotação automática.
            </p>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tema da temporada</label>
              <textarea
                className={`${inputClass} resize-y`}
                rows={3}
                placeholder='Ex.: "invasão das sombras — o continente escurece e monstros das sombras avançam"'
                value={aiTheme}
                onChange={(e) => setAiTheme(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Início</label>
                <input type="datetime-local" className={inputClass} value={aiStartsAt} onChange={(e) => setAiStartsAt(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fim (opcional)</label>
                <input type="datetime-local" className={inputClass} value={aiEndsAt} onChange={(e) => setAiEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setAiOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className={`${btnPrimary} !bg-purple-600 hover:!bg-purple-700`} disabled={aiRunning}>
                <Sparkles size={14} /> {aiRunning ? "Gerando..." : "Gerar temporada"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}