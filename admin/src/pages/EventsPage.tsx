import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays, Hammer, Loader2, MapPin, Plus, RefreshCw, ScrollText,
  ShoppingBag, Trash2, Wand2, X, Zap,
} from "lucide-react";
import { adminApi } from "../api";
import EntityFormFields, { EntityField } from "../components/EntityFormFields";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const BTYPES = ["defense", "damage", "dropChance", "xp", "gold", "classXp"];
const BTYPE_LABELS: Record<string, string> = {
  defense: "Defesa",
  damage: "Dano Geral",
  dropChance: "Chance de Drop",
  xp: "XP",
  gold: "Gold",
  classXp: "XP de Classe",
};
const ITEM_TYPES = ["weapon", "helm", "armor", "cape", "ring", "necklace", "consumable"];
const ITEM_TYPE_LABELS: Record<string, string> = {
  weapon: "Arma", helm: "Capacete", armor: "Armadura", cape: "Capa",
  ring: "Anel", necklace: "Colar", consumable: "Consumível",
};
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const RARITY_LABELS: Record<string, string> = {
  common: "Comum", uncommon: "Incomum", rare: "Raro", epic: "Épico",
  legendary: "Lendário", mythic: "Mítico",
};

const EVENT_FIELDS: EntityField[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "slug", label: "Slug", type: "text", required: true, hint: "Único, minúsculas, sem espaços" },
  { name: "description", label: "Descrição", type: "textarea", required: true },
  { name: "type", label: "Tipo", type: "select", options: ["raid", "quest", "festival", "season", "custom"], defaultValue: "raid" },
  { name: "imageUrl", label: "Imagem do evento", type: "icon" },
  { name: "levelMin", label: "Nível mínimo", type: "number", defaultValue: 1 },
  { name: "levelMax", label: "Nível máximo", type: "number", defaultValue: 0, hint: "0 = sem limite" },
  { name: "xpBonus", label: "Bônus de XP (%)", type: "number", defaultValue: 0 },
  { name: "goldBonus", label: "Bônus de Gold (%)", type: "number", defaultValue: 0 },
  { name: "dropBonus", label: "Bônus de Drop (%)", type: "number", defaultValue: 0 },
  { name: "sortOrder", label: "Ordem", type: "number", defaultValue: 0 },
  { name: "rewards", label: "Recompensas (JSON)", type: "textarea", hint: 'Ex.: [{"itemName":"Poção","quantity":5}]' },
  { name: "isActive", label: "Ativo", type: "boolean", defaultValue: false },
];

const DEFAULT_SI = {
  itemId: "", currency: "gold", price: 0, stock: -1,
  requiredLevel: 1, requiredVip: false, isActive: true,
};
const DEFAULT_IC = { name: "", type: "weapon", rarity: "rare", boostType: "", boostValue: 10 };
const DEFAULT_CR = {
  name: "", description: "", resultItemId: "", resultClassId: "",
  resultQuantity: 1, requiredLevel: 1, goldCost: 0, ingredients: "", isActive: true,
};

function eventDefaults(): Record<string, any> {
  const d: Record<string, any> = {};
  for (const f of EVENT_FIELDS) d[f.name] = f.type === "boolean" ? false : f.type === "number" ? (f.defaultValue ?? 0) : f.defaultValue ?? "";
  d.startsAt = toLocalInput(Date.now());
  d.endsAt = toLocalInput(Date.now() + 7 * 86400000);
  return d;
}

function toLocalInput(ts: number | string): string {
  const dt = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const sectionHeaderClass =
  "px-4 py-3 border-b border-dark-600 flex items-center justify-between flex-wrap gap-2";

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [quests, setQuests] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [crafts, setCrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(eventDefaults());
  const [saving, setSaving] = useState(false);

  const [linkMapId, setLinkMapId] = useState("");
  const [linkQuestId, setLinkQuestId] = useState("");
  const [linkItemId, setLinkItemId] = useState("");

  const [siForm, setSiForm] = useState<Record<string, any>>({ ...DEFAULT_SI });
  const [siEditing, setSiEditing] = useState<any>(null);
  const [savingSi, setSavingSi] = useState(false);

  const [icForm, setIcForm] = useState<Record<string, any>>({ ...DEFAULT_IC });
  const [savingIc, setSavingIc] = useState(false);

  const [crForm, setCrForm] = useState<Record<string, any>>({ ...DEFAULT_CR });
  const [crEditing, setCrEditing] = useState<any>(null);
  const [savingCr, setSavingCr] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ev, it, qu, mp, cl, sh, cr] = await Promise.all([
        adminApi.events.list(),
        adminApi.items.list(),
        adminApi.quests.list(),
        adminApi.maps.list(),
        adminApi.classes.list(),
        adminApi.eventShopItems.list(),
        adminApi.craftRecipes.list(),
      ]);
      setEvents(Array.isArray(ev.data) ? ev.data : []);
      setItems(Array.isArray(it.data) ? it.data : []);
      setQuests(Array.isArray(qu.data) ? qu.data : []);
      setMaps(Array.isArray(mp.data) ? mp.data : []);
      setClasses(Array.isArray(cl.data) ? cl.data : []);
      setShopItems(Array.isArray(sh.data) ? sh.data : []);
      setCrafts(Array.isArray(cr.data) ? cr.data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => events.find((e) => e.id === selectedId) || null, [events, selectedId]);

  const filteredEvents = useMemo(() => {
    if (!filter.trim()) return events;
    const q = filter.toLowerCase();
    return events.filter((e) => e.name.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q));
  }, [events, filter]);

  const eventItems = useMemo(() => items.filter((i) => i.eventId === selectedId), [items, selectedId]);
  const eventQuests = useMemo(() => quests.filter((q) => q.eventId === selectedId), [quests, selectedId]);
  const eventMaps = useMemo(() => maps.filter((m) => m.eventId === selectedId), [maps, selectedId]);
  const eventShop = useMemo(() => shopItems.filter((s) => s.eventId === selectedId), [shopItems, selectedId]);
  const eventCrafts = useMemo(() => crafts.filter((c) => c.eventId === selectedId), [crafts, selectedId]);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id;
  const questTitle = (id: string) => quests.find((q) => q.id === id)?.title ?? id;
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? id;

  const selectEvent = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    const e = events.find((ev) => ev.id === id);
    if (e) fillForm(e);
  };

  const fillForm = (e: any) => {
    const values = eventDefaults();
    for (const f of EVENT_FIELDS) {
      if (f.type === "boolean") values[f.name] = !!e[f.name];
      else if (f.type === "number") values[f.name] = Number(e[f.name]) || 0;
      else values[f.name] = e[f.name] ?? "";
    }
    values.startsAt = e.startsAt ? toLocalInput(e.startsAt) : values.startsAt;
    values.endsAt = e.endsAt ? toLocalInput(e.endsAt) : values.endsAt;
    setForm(values);
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setForm(eventDefaults());
  };

  const handleSave = async (eForm: FormEvent) => {
    eForm.preventDefault();
    if (!String(form.name || "").trim() || !String(form.slug || "").trim()) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of EVENT_FIELDS) {
        const v = form[f.name];
        if (f.type === "boolean") payload[f.name] = !!v;
        else if (f.type === "number") payload[f.name] = Number(v) || 0;
        else payload[f.name] = v;
      }
      payload.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString();
      payload.endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : new Date(Date.now() + 86400000).toISOString();
      if (String(payload.levelMax || "").trim() === "" || !payload.levelMax || payload.levelMax <= 0) payload.levelMax = null;
      let saved;
      if (creating) {
        saved = (await adminApi.events.create(payload)).data;
        toast.success(`Evento "${payload.name}" criado!`);
      } else {
        if (!selectedId) return;
        saved = (await adminApi.events.update(selectedId, payload)).data;
        toast.success("Evento atualizado!");
      }
      await load();
      if (saved?.id) {
        setSelectedId(saved.id);
        setCreating(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: any) => {
    if (!window.confirm(`Excluir o evento "${e.name}"? Itens da loja do evento serão removidos.`)) return;
    try {
      await adminApi.events.delete(e.id);
      toast.success("Evento excluído");
      setSelectedId(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  // ---- vinculações (mapa/raid, quests, itens) ----
  const attachMap = async () => {
    if (!selectedId || !linkMapId) return;
    try {
      await adminApi.maps.update(linkMapId, { eventId: selectedId });
      toast.success("Mapa vinculado ao evento");
      setLinkMapId("");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao vincular"); }
  };

  const detachMap = async (m: any) => {
    try {
      await adminApi.maps.update(m.id, { eventId: null });
      toast.success("Mapa desvinculado do evento");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao desvincular"); }
  };

  const attachQuest = async () => {
    if (!selectedId || !linkQuestId) return;
    try {
      await adminApi.quests.update(linkQuestId, { eventId: selectedId });
      toast.success("Quest vinculada ao evento");
      setLinkQuestId("");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao vincular"); }
  };

  const detachQuest = async (q: any) => {
    try {
      await adminApi.quests.update(q.id, { eventId: null });
      toast.success("Quest desvinculada do evento");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao desvincular"); }
  };

  const attachItem = async () => {
    if (!selectedId || !linkItemId) return;
    try {
      await adminApi.items.update(linkItemId, { eventId: selectedId });
      toast.success("Item vinculado ao evento");
      setLinkItemId("");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao vincular"); }
  };

  const detachItem = async (i: any) => {
    try {
      await adminApi.items.update(i.id, { eventId: null });
      toast.success("Item desvinculado do evento");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao desvincular"); }
  };

  // ---- loja do evento ----
  const resetSiForm = () => { setSiForm({ ...DEFAULT_SI }); setSiEditing(null); };

  const openEditSi = (s: any) => {
    setSiEditing(s);
    setSiForm({
      itemId: s.itemId ?? "",
      currency: s.currency ?? "gold",
      price: Number(s.price) || 0,
      stock: Number(s.stock) ?? -1,
      requiredLevel: Number(s.requiredLevel) || 1,
      requiredVip: !!s.requiredVip,
      isActive: s.isActive !== false,
    });
  };

  const handleSaveSi = async (eForm: FormEvent) => {
    eForm.preventDefault();
    if (!selectedId || !siForm.itemId) {
      toast.error("Escolha um item para a loja do evento");
      return;
    }
    setSavingSi(true);
    try {
      const payload = {
        eventId: selectedId,
        itemId: siForm.itemId,
        currency: siForm.currency || "gold",
        price: Number(siForm.price) || 0,
        stock: Number(siForm.stock) ?? -1,
        requiredLevel: Number(siForm.requiredLevel) || 1,
        requiredVip: !!siForm.requiredVip,
        isActive: siForm.isActive !== false,
      };
      if (siEditing?.id) {
        await adminApi.eventShopItems.update(siEditing.id, payload);
        toast.success("Item da loja atualizado");
      } else {
        await adminApi.eventShopItems.create(payload);
        toast.success("Item adicionado à loja do evento");
      }
      resetSiForm();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSavingSi(false);
    }
  };

  const handleDeleteSi = async (s: any) => {
    if (!window.confirm(`Remover "${itemName(s.itemId)}" da loja do evento?`)) return;
    try {
      await adminApi.eventShopItems.delete(s.id);
      toast.success("Removido");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao excluir"); }
  };

  // ---- criador rápido de item com booster ----
  const handleQuickItem = async (eForm: FormEvent) => {
    eForm.preventDefault();
    if (!selectedId || !String(icForm.name || "").trim()) {
      toast.error("Dê um nome ao item");
      return;
    }
    setSavingIc(true);
    try {
      const payload: Record<string, any> = {
        name: icForm.name,
        type: icForm.type,
        rarity: icForm.rarity,
        eventId: selectedId,
      };
      if (icForm.boostType) {
        payload.boostType = icForm.boostType;
        payload.boostValue = Math.max(Number(icForm.boostValue) || 0, 1);
      }
      await adminApi.items.create(payload);
      toast.success(`Item "${icForm.name}" criado no evento!`);
      setIcForm({ ...DEFAULT_IC });
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao criar item");
    } finally {
      setSavingIc(false);
    }
  };

  // ---- craft do evento ----
  const resetCrForm = () => { setCrForm({ ...DEFAULT_CR }); setCrEditing(null); };

  const openEditCr = (c: any) => {
    setCrEditing(c);
    let ingredients = "";
    try {
      const arr = JSON.parse(c.ingredients || "[]");
      if (Array.isArray(arr)) ingredients = arr.map((ing: any) => `${ing.itemName ?? ""}|${ing.quantity ?? 1}`).join("\n");
    } catch { ingredients = String(c.ingredients ?? ""); }
    setCrForm({
      name: c.name ?? "",
      description: c.description ?? "",
      resultItemId: c.resultItemId ?? "",
      resultClassId: c.resultClassId ?? "",
      resultQuantity: Number(c.resultQuantity) || 1,
      requiredLevel: Number(c.requiredLevel) || 1,
      goldCost: Number(c.goldCost) || 0,
      ingredients,
      isActive: c.isActive !== false,
    });
  };

  const parseIngredients = (raw: string): { itemName: string; quantity: number }[] => {
    const out: { itemName: string; quantity: number }[] = [];
    for (const line of String(raw || "").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const [n, q] = t.split("|");
      out.push({ itemName: (n ?? "").trim(), quantity: Number(q) || 1 });
    }
    return out;
  };

  const handleSaveCr = async (eForm: FormEvent) => {
    eForm.preventDefault();
    if (!selectedId || !String(crForm.name || "").trim()) {
      toast.error("Dê um nome à receita");
      return;
    }
    if (!crForm.resultItemId && !crForm.resultClassId) {
      toast.error("Escolha o item resultado ou a classe resultado (ou ambos)");
      return;
    }
    setSavingCr(true);
    try {
      const payload: Record<string, any> = {
        name: crForm.name,
        description: crForm.description || "",
        resultItemId: crForm.resultItemId || null,
        resultClassId: crForm.resultClassId || null,
        resultQuantity: Number(crForm.resultQuantity) || 1,
        requiredLevel: Number(crForm.requiredLevel) || 1,
        goldCost: Number(crForm.goldCost) || 0,
        ingredients: JSON.stringify(parseIngredients(crForm.ingredients || "")),
        isActive: crForm.isActive !== false,
        eventId: selectedId,
      };
      if (crEditing?.id) {
        await adminApi.craftRecipes.update(crEditing.id, payload);
        toast.success("Receita atualizada");
      } else {
        await adminApi.craftRecipes.create(payload);
        toast.success("Receita criada no evento");
      }
      resetCrForm();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar receita");
    } finally {
      setSavingCr(false);
    }
  };

  const handleDeleteCr = async (c: any) => {
    if (!window.confirm(`Excluir a receita "${c.name}"?`)) return;
    try {
      await adminApi.craftRecipes.delete(c.id);
      toast.success("Receita excluída");
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || "Falha ao excluir"); }
  };

  // ---- IA ----
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Descreva o evento que a IA deve criar");
      return;
    }
    setAiBusy(true);
    try {
      const res = await adminApi.events.generate(aiPrompt.trim());
      const saved = res.data?.data;
      toast.success(`Evento "${saved?.event?.name ?? saved?.name ?? "?"}" gerado e salvo!`);
      if (saved?.warnings && saved.warnings.length > 0) {
        saved.warnings.forEach((w: string) => toast(w, { icon: "⚠️" }));
      }
      setAiOpen(false);
      await load();
      if (saved?.event?.id) {
        setSelectedId(saved.event.id);
        setCreating(false);
      }
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
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Raids, festivais e temporadas como eventos: cada um com raid, quests, loja, itens e crafts próprios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Wand2 size={16} /> Gerar evento com IA
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Novo evento
          </button>
          <button onClick={() => load()} className="p-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors" title="Recarregar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Cards de eventos */}
        <div className="space-y-2 h-fit">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar evento..." className={inputClass} />
          <div className="max-h-[72vh] overflow-y-auto space-y-2 pr-1">
            {loading && <p className="text-center text-gray-500 py-8">Carregando...</p>}
            {!loading && filteredEvents.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum evento — crie um novo ou use a IA</p>
            )}
            {filteredEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => selectEvent(e.id)}
                className={`w-full text-left bg-dark-800 border rounded-xl overflow-hidden transition-colors ${
                  selectedId === e.id ? "border-accent-500 bg-accent-600/10" : "border-dark-600 hover:border-gray-500"
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  {e.imageUrl ? (
                    <img src={e.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg bg-dark-700 shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-lg bg-dark-700 flex items-center justify-center text-gray-600 shrink-0">
                      <CalendarDays size={20} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{e.name}</span>
                      {e.isActive && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-green-500/20 text-green-400 shrink-0">ATIVO</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {e.type || "raid"} • Nv {e.levelMin} • {e.maps?.length ?? 0} mapa(s)
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhe — seções empilhadas (uma em baixo da outra) */}
        <div className="space-y-4">
          {selected || creating ? (
            <>
              {/* 1. Dados do evento */}
              <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                <div className={sectionHeaderClass}>
                  <div className="flex items-center gap-3">
                    {creating ? (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500"><Plus size={18} /></span>
                    ) : selected?.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg bg-dark-700" />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500"><CalendarDays size={18} /></span>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">
                        {creating ? "Novo evento" : selected?.name}
                        {!creating && selected?.isActive && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-green-500/20 text-green-400">ATIVO</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {creating ? "Preencha os dados abaixo" : `Tipo ${selected?.type} • Nv ${selected?.levelMin}–${selected?.levelMax ?? "∞"}`}
                      </p>
                    </div>
                  </div>
                  {!creating && (
                    <button
                      onClick={() => handleDelete(selected!)}
                      className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                    >
                      <Trash2 size={15} /> Excluir evento
                    </button>
                  )}
                </div>
                <form onSubmit={handleSave} className="p-5 space-y-4">
                  <EntityFormFields fields={EVENT_FIELDS} form={form} onChange={setForm} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Início (data/hora)</label>
                      <input type="datetime-local" value={form.startsAt ?? ""} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Fim (data/hora)</label>
                      <input type="datetime-local" value={form.endsAt ?? ""} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    {creating && (
                      <button type="button" onClick={() => { setCreating(false); setSelectedId(events[0]?.id ?? null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {saving ? "Salvando..." : creating ? "Criar evento" : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              </div>

              {!creating && selected && (
                <>
                  {/* 2. Raid do evento */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                    <div className={sectionHeaderClass}>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-gray-400" />
                        <h3 className="font-medium text-white">Raid do evento</h3>
                        <span className="text-xs text-gray-500">mapas vinculados (raids ficam fora da história)</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                        <select value={linkMapId} onChange={(e) => setLinkMapId(e.target.value)} className={inputClass}>
                          <option value="">Vincular mapa existente...</option>
                          {maps.filter((m) => !m.eventId).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.type === "raid" ? "(raid)" : ""}
                            </option>
                          ))}
                        </select>
                        <button onClick={attachMap} disabled={!linkMapId} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0">
                          Vincular
                        </button>
                      </div>
                      {eventMaps.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum mapa vinculado. Use a IA para gerar a raid do evento ou vincule um mapa.</p>
                      ) : (
                        <div className="space-y-2">
                          {eventMaps.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between bg-dark-900 border border-dark-600 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm text-white truncate">{m.name}</span>
                                {m.type === "raid" && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400 shrink-0">RAID</span>}
                                <span className="text-xs text-gray-500 shrink-0">Nv {m.requiredLevel} • {m.monsters?.length ?? 0} monstros</span>
                              </div>
                              <button onClick={() => detachMap(m)} className="text-red-400 hover:text-red-300 text-sm shrink-0">Desvincular</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Quests do evento */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                    <div className={sectionHeaderClass}>
                      <div className="flex items-center gap-2">
                        <ScrollText size={16} className="text-gray-400" />
                        <h3 className="font-medium text-white">Quests do evento</h3>
                        <span className="text-xs text-gray-500">quests próprias, fora da história</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex gap-2">
                        <select value={linkQuestId} onChange={(e) => setLinkQuestId(e.target.value)} className={inputClass}>
                          <option value="">Vincular quest existente...</option>
                          {quests.filter((q) => !q.eventId).map((q) => (
                            <option key={q.id} value={q.id}>{q.title}</option>
                          ))}
                        </select>
                        <button onClick={attachQuest} disabled={!linkQuestId} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0">
                          Vincular
                        </button>
                      </div>
                      {eventQuests.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhuma quest vinculada.</p>
                      ) : (
                        <div className="space-y-2">
                          {eventQuests.map((q: any) => (
                            <div key={q.id} className="flex items-center justify-between bg-dark-900 border border-dark-600 rounded-lg px-3 py-2">
                              <span className="text-sm text-white truncate">{q.title}</span>
                              <button onClick={() => detachQuest(q)} className="text-red-400 hover:text-red-300 text-sm shrink-0">Desvincular</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. Loja do evento */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                    <div className={sectionHeaderClass}>
                      <div className="flex items-center gap-2">
                        <ShoppingBag size={16} className="text-gray-400" />
                        <h3 className="font-medium text-white">Loja do evento</h3>
                        <span className="text-xs text-gray-500">itens à venda durante o evento</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <form onSubmit={handleSaveSi} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                        <div className="col-span-2 sm:col-span-4">
                          <label className={labelClass}>Item *</label>
                          <select value={siForm.itemId ?? ""} onChange={(e) => setSiForm({ ...siForm, itemId: e.target.value })} className={inputClass}>
                            <option value="">Selecionar item...</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} {i.eventId === selectedId ? "[evento]" : ""} {i.boostType ? `(+${i.boostValue}% ${BTYPE_LABELS[i.boostType] ?? i.boostType})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Preço (gold)</label>
                          <input type="number" value={siForm.price ?? 0} onChange={(e) => setSiForm({ ...siForm, price: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Estoque (-1 = infinito)</label>
                          <input type="number" value={siForm.stock ?? -1} onChange={(e) => setSiForm({ ...siForm, stock: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Nível mín.</label>
                          <input type="number" value={siForm.requiredLevel ?? 1} onChange={(e) => setSiForm({ ...siForm, requiredLevel: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div className="flex items-end gap-3 pb-1">
                          <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input type="checkbox" checked={!!siForm.requiredVip} onChange={(e) => setSiForm({ ...siForm, requiredVip: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                            VIP
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input type="checkbox" checked={siForm.isActive !== false} onChange={(e) => setSiForm({ ...siForm, isActive: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                            Ativo
                          </label>
                          <div className="flex gap-2">
                            {siEditing && (
                              <button type="button" onClick={resetSiForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                                Cancel
                              </button>
                            )}
                            <button type="submit" disabled={savingSi} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                              {savingSi ? "Salvando..." : siEditing?.id ? "Salvar alterações" : "Adicionar à loja"}
                            </button>
                          </div>
                        </div>
                      </form>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-dark-600">
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Item</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Preço</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Estoque</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv mín.</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Status</th>
                              <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eventShop.map((s: any) => (
                              <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                                <td className="py-2.5 px-4 font-medium text-white flex items-center gap-2">
                                  <ShoppingBag size={14} className="text-gray-500 shrink-0" />
                                  {itemName(s.itemId)}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs">{Number(s.price)}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{s.stock < 0 ? "∞" : s.stock}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{s.requiredLevel}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{s.isActive ? "Ativo" : "Inativo"}</td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                  <button onClick={() => openEditSi(s)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                                  <button onClick={() => handleDeleteSi(s)} className="text-red-400 hover:text-red-300">Delete</button>
                                </td>
                              </tr>
                            ))}
                            {eventShop.length === 0 && (
                              <tr><td colSpan={6} className="py-6 text-center text-gray-500">Loja vazia — adicione itens acima</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* 5. Itens do evento */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                    <div className={sectionHeaderClass}>
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-gray-400" />
                        <h3 className="font-medium text-white">Itens do evento</h3>
                        <span className="text-xs text-gray-500">itens próprios — arma/armadura podem vir com booster</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <form onSubmit={handleQuickItem} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                        <div className="col-span-2 sm:col-span-5">
                          <label className={labelClass}>Criar item rápido no evento</label>
                        </div>
                        <div className="col-span-2 sm:col-span-2">
                          <input value={icForm.name ?? ""} onChange={(e) => setIcForm({ ...icForm, name: e.target.value })} placeholder="Nome do item..." className={inputClass} />
                        </div>
                        <div>
                          <select value={icForm.type ?? "weapon"} onChange={(e) => setIcForm({ ...icForm, type: e.target.value })} className={inputClass}>
                            {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
                          </select>
                        </div>
                        <div>
                          <select value={icForm.rarity ?? "rare"} onChange={(e) => setIcForm({ ...icForm, rarity: e.target.value })} className={inputClass}>
                            {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
                          </select>
                        </div>
                        <div>
                          <select value={icForm.boostType ?? ""} onChange={(e) => setIcForm({ ...icForm, boostType: e.target.value })} className={inputClass}>
                            <option value="">Sem booster</option>
                            {BTYPES.map((b) => <option key={b} value={b}>Booster: {BTYPE_LABELS[b]}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2 items-end">
                          <input type="number" value={icForm.boostValue ?? 10} onChange={(e) => setIcForm({ ...icForm, boostValue: Number(e.target.value) })} placeholder="+" className={`${inputClass} w-20`} />
                          <button type="submit" disabled={savingIc} className="flex items-center gap-1.5 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                            {savingIc ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
                          </button>
                        </div>
                      </form>
                      <div className="flex gap-2">
                        <select value={linkItemId} onChange={(e) => setLinkItemId(e.target.value)} className={inputClass}>
                          <option value="">Vincular item existente...</option>
                          {items.filter((i) => !i.eventId).map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} {i.boostType ? `(+${i.boostValue}% ${BTYPE_LABELS[i.boostType] ?? i.boostType})` : ""}
                            </option>
                          ))}
                        </select>
                        <button onClick={attachItem} disabled={!linkItemId} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0">
                          Vincular
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-dark-600">
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Item</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Tipo</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Raridade</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Booster</th>
                              <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eventItems.map((i: any) => (
                              <tr key={i.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                                <td className="py-2.5 px-4 font-medium text-white">{i.name}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{ITEM_TYPE_LABELS[i.type] ?? i.type}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{RARITY_LABELS[i.rarity] ?? i.rarity}</td>
                                <td className="py-2.5 px-4 font-mono text-xs">
                                  {i.boostType ? <span className="text-amber-400">+{i.boostValue}% {BTYPE_LABELS[i.boostType] ?? i.boostType}</span> : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                  <button onClick={() => detachItem(i)} className="text-red-400 hover:text-red-300">Desvincular</button>
                                </td>
                              </tr>
                            ))}
                            {eventItems.length === 0 && (
                              <tr><td colSpan={5} className="py-6 text-center text-gray-500">Nenhum item no evento ainda</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* 6. Craft do evento */}
                  <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                    <div className={sectionHeaderClass}>
                      <div className="flex items-center gap-2">
                        <Hammer size={16} className="text-gray-400" />
                        <h3 className="font-medium text-white">Craft do evento</h3>
                        <span className="text-xs text-gray-500">receitas que só existem no evento — classes também podem ser craftáveis</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <form onSubmit={handleSaveCr} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                        <div className="col-span-2 sm:col-span-2">
                          <label className={labelClass}>Nome da receita *</label>
                          <input value={crForm.name ?? ""} onChange={(e) => setCrForm({ ...crForm, name: e.target.value })} className={inputClass} />
                        </div>
                        <div className="col-span-2">
                          <label className={labelClass}>Descrição</label>
                          <input value={crForm.description ?? ""} onChange={(e) => setCrForm({ ...crForm, description: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Item resultado</label>
                          <select value={crForm.resultItemId ?? ""} onChange={(e) => setCrForm({ ...crForm, resultItemId: e.target.value })} className={inputClass}>
                            <option value="">Nenhum</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>{i.name} {i.eventId === selectedId ? "[evento]" : ""}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Classe resultado (craft de classe)</label>
                          <select value={crForm.resultClassId ?? ""} onChange={(e) => setCrForm({ ...crForm, resultClassId: e.target.value })} className={inputClass}>
                            <option value="">Nenhuma (não cria classes — só usa as existentes)</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Qtde resultado</label>
                          <input type="number" value={crForm.resultQuantity ?? 1} onChange={(e) => setCrForm({ ...crForm, resultQuantity: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Nível mín.</label>
                          <input type="number" value={crForm.requiredLevel ?? 1} onChange={(e) => setCrForm({ ...crForm, requiredLevel: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Custo (gold)</label>
                          <input type="number" value={crForm.goldCost ?? 0} onChange={(e) => setCrForm({ ...crForm, goldCost: Number(e.target.value) })} className={inputClass} />
                        </div>
                        <div className="col-span-2 sm:col-span-2">
                          <label className={labelClass}>Ingredientes — uma por linha: Nome|Qtde (ex.: Moeda de Gelo|5)</label>
                          <textarea value={crForm.ingredients ?? ""} onChange={(e) => setCrForm({ ...crForm, ingredients: e.target.value })} rows={2} className={`${inputClass} resize-y font-mono text-xs`} />
                        </div>
                        <div className="flex items-end gap-2 pb-1">
                          <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input type="checkbox" checked={crForm.isActive !== false} onChange={(e) => setCrForm({ ...crForm, isActive: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                            Ativa
                          </label>
                          <div className="flex gap-2">
                            {crEditing && (
                              <button type="button" onClick={resetCrForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                                Cancel
                              </button>
                            )}
                            <button type="submit" disabled={savingCr} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                              {savingCr ? "Salvando..." : crEditing?.id ? "Salvar alterações" : "Criar receita"}
                            </button>
                          </div>
                        </div>
                      </form>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-dark-600">
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Receita</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Resultado</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Custo</th>
                              <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv mín.</th>
                              <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eventCrafts.map((c: any) => (
                              <tr key={c.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                                <td className="py-2.5 px-4 font-medium text-white">{c.name}</td>
                                <td className="py-2.5 px-4 text-xs">
                                  {c.resultClassId ? <span className="text-fuchsia-400">{className(c.resultClassId)} (classe)</span> : c.resultItemId ? itemName(c.resultItemId) : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-xs">{Number(c.goldCost)}g</td>
                                <td className="py-2.5 px-4 font-mono text-xs">{c.requiredLevel}</td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                  <button onClick={() => openEditCr(c)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                                  <button onClick={() => handleDeleteCr(c)} className="text-red-400 hover:text-red-300">Delete</button>
                                </td>
                              </tr>
                            ))}
                            {eventCrafts.length === 0 && (
                              <tr><td colSpan={5} className="py-6 text-center text-gray-500">Nenhuma receita no evento — a IA cria por padrão junto do evento</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col items-center justify-center p-16 space-y-3">
              <CalendarDays className="text-gray-600" size={28} />
              <p className="text-gray-500">Selecione um evento para gerenciar raid, quests, loja, itens e crafts</p>
            </div>
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !aiBusy && setAiOpen(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Wand2 size={18} className="text-fuchsia-400" /> Gerar evento com IA
              </h2>
              <button onClick={() => setAiOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none" disabled={aiBusy}>
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              A IA cria o evento completo: dados do evento, a raid (mapa) com ondas e monstros do evento, quests próprias,
              loja própria, itens próprios (só alguns com booster — ex.: 1 arma com +dano e 1 armadura com +defesa) e
              receitas de craft. As classes não são criadas pela IA — ela só vincula as classes existentes em crafts.
            </p>
            <label className={labelClass}>Prompt para a IA</label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              className={inputClass}
              placeholder="Descreva o evento... ex.: 'invasão de dragões de gelo nível 30, 3 ondas, com loja de moedas de gelo, armas com bônus de dano e craft da classe Cavaleiro'"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() =>
                  setAiPrompt("Invasão de Dragões de Gelo em Valdoria, nível 30, com 3 ondas de monstros de gelo e um chefe final (Dragão de Gelo Ancião). Quests do evento: coletar fragmentos de gelo e derrotar o chefe. Loja com moedas de gelo trocando por poções e armas de gelo. Armas e armaduras com booster de dano/defesa. Craft de itens com moedas de gelo e craft da classe Cavaleiro de Gelo.")
                }
                className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              >
                Exemplo
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiBusy}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {aiBusy ? "Gerando (pode levar ~60s)..." : "Gerar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}