import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, RefreshCw, ShoppingBag, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { adminApi } from "../api";
import { useCrudList } from "../lib/useCrud";
import EntityFormFields, { EntityField } from "../components/EntityFormFields";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const NPC_TYPE_OPTIONS = [
  "vendor",
  "shop",
  "enchantments",
  "classes",
  "quest_giver",
  "quest",
  "gacha",
  "blacksmith",
  "trainer",
  "lore",
  "guard",
  "other",
];

const NPC_FIELDS: EntityField[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  {
    name: "type",
    label: "Tipo",
    type: "select",
    options: NPC_TYPE_OPTIONS,
    required: true,
    hint: "vendor = vendedor comum • shop = loja especial • enchantments = vendedor de encantamentos • classes = vendedor de classes • quest_giver = dá missões • gacha • blacksmith • trainer • lore • guard • other",
  },
  { name: "description", label: "Descrição", type: "textarea" },
  { name: "dialogue", label: "Diálogo de saudação", type: "textarea", hint: "O que o NPC fala ao ser tocado no jogo" },
  { name: "imageUrl", label: "Imagem do NPC", type: "icon" },
  { name: "isActive", label: "Ativo (aparece no jogo)", type: "boolean", defaultValue: true },
];

const DEFAULT_AI_PROMPT = "ferreiro ancião da vila de pedra, com um aprendiz, que vende poções, uma espada e um encantamento de força";

function npcDefaults(): Record<string, any> {
  const d: Record<string, any> = {};
  for (const f of NPC_FIELDS) d[f.name] = f.type === "boolean" ? !!f.defaultValue : f.defaultValue ?? "";
  return d;
}

const DEFAULT_MAP = { mapId: "", positionX: 50, positionY: 50 };
const DEFAULT_SHOP = { kind: "item", refId: "", price: 0, currency: "gold", requiredLevel: 0, requiredVip: false };

const ACTION_TYPE_OPTIONS = [
  { value: "shop", label: "Loja" },
  { value: "quest", label: "Quests" },
  { value: "dialogue", label: "Conversar" },
  { value: "travel", label: "Viajar" },
  { value: "craft", label: "Craftar" },
  { value: "gacha", label: "Gacha" },
  { value: "custom", label: "Custom" },
];

function NpcActionsEditor({ npcId }: { npcId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["npcActions", npcId],
    queryFn: async () => (await adminApi.npcActions.list(npcId)).data,
  });
  const actions: any[] = Array.isArray(data)
    ? [...data].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
    : [];
  const [editing, setEditing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const blank = () => ({
    type: "shop",
    label: "",
    icon: "",
    order: actions.length,
    requirements: "",
    target: "",
    isActive: true,
  });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const payload: any = {
        type: editing.type,
        label: editing.label,
        icon: editing.icon || null,
        order: Number(editing.order) || 0,
        requirements:
          editing.requirements
            ? typeof editing.requirements === "string"
              ? editing.requirements
              : JSON.stringify(editing.requirements)
            : null,
        target: editing.target || null,
        isActive: editing.isActive !== false,
      };
      if (editing.id) await adminApi.npcActions.update(npcId, editing.id, payload);
      else await adminApi.npcActions.create(npcId, payload);
      toast.success("Ação salva");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["npcActions", npcId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir esta ação?")) return;
    await adminApi.npcActions.delete(npcId, id);
    queryClient.invalidateQueries({ queryKey: ["npcActions", npcId] });
  };

  const move = async (a: any, dir: -1 | 1) => {
    const sorted = [...actions].sort((x: any, y: any) => (x.order || 0) - (y.order || 0));
    const idx = sorted.findIndex((x: any) => x.id === a.id);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    await adminApi.npcActions.update(npcId, a.id, { order: other.order });
    await adminApi.npcActions.update(npcId, other.id, { order: a.order });
    queryClient.invalidateQueries({ queryKey: ["npcActions", npcId] });
  };

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">Ações de interação</h3>
          <p className="text-xs text-gray-500">
            Botões dinâmicos mostrados no jogo (ordem definida por "order"). Se vazio, o jogo usa o comportamento antigo por type.
          </p>
        </div>
        <button
          onClick={() => setEditing(blank())}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={15} /> Nova ação
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Carregando...</p>}

      {!isLoading && actions.length === 0 && (
        <p className="text-sm text-gray-500">Nenhuma ação configurada — este NPC usará o modo legado (loja/quest por type).</p>
      )}

      <div className="space-y-2">
        {actions.map((a: any) => (
          <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-dark-900 border border-dark-700">
            <div className="flex flex-col gap-1">
              <button onClick={() => move(a, -1)} className="text-gray-500 hover:text-white" title="Subir"><ArrowUp size={14} /></button>
              <button onClick={() => move(a, 1)} className="text-gray-500 hover:text-white" title="Descer"><ArrowDown size={14} /></button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {a.icon ? `${a.icon} ` : ""}
                {a.label || ACTION_TYPE_OPTIONS.find((o) => o.value === a.type)?.label || a.type}
              </p>
              <p className="text-[11px] text-gray-500">tipo: {a.type} • ordem: {a.order} {a.isActive ? "" : "• inativo"}</p>
            </div>
            <button onClick={() => setEditing({ ...a })} className="text-accent-400 hover:text-accent-300 text-sm">Editar</button>
            <button onClick={() => remove(a.id)} className="text-red-400 hover:text-red-300 text-sm">Excluir</button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="rounded-xl border border-dark-600 bg-dark-900 p-4 space-y-3">
          <h4 className="text-sm font-medium text-white">{editing.id ? "Editar ação" : "Nova ação"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo</label>
              <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} className={inputClass}>
                {ACTION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Ordem</label>
              <input type="number" value={editing.order} onChange={(e) => setEditing({ ...editing, order: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Rótulo (botão)</label>
              <input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className={inputClass} placeholder="Ex.: Ver mercadorias" />
            </div>
            <div>
              <label className={labelClass}>Ícone (emoji/opcional)</label>
              <input value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} className={inputClass} placeholder="🛒" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Target (ex.: mapId para travel)</label>
            <input value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Requisitos (JSON, opcional)</label>
            <input
              value={typeof editing.requirements === "string" ? editing.requirements : JSON.stringify(editing.requirements || "")}
              onChange={(e) => setEditing({ ...editing, requirements: e.target.value })}
              className={inputClass}
              placeholder='{"level":10,"questIds":["abc"]}'
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={editing.isActive !== false} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
            Ativo
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">Cancelar</button>
            <button onClick={save} disabled={busy} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NpcsPage() {
  const queryClient = useQueryClient();
  const { items: npcs, loading, reload: reloadNpcs } = useCrudList("npcs", () => adminApi.npcs.list());
  const { data: mapsData } = useQuery({ queryKey: ["crud", "maps"], queryFn: async () => (await adminApi.maps.list()).data });
  const { data: itemsData } = useQuery({ queryKey: ["crud", "items"], queryFn: async () => (await adminApi.items.list()).data });
  const { data: enchantmentsData } = useQuery({ queryKey: ["crud", "enchantments"], queryFn: async () => (await adminApi.enchantments.list()).data });
  const { data: questsData } = useQuery({ queryKey: ["crud", "quests"], queryFn: async () => (await adminApi.quests.list()).data });
  const maps: any[] = mapsData ?? [];
  const items: any[] = itemsData ?? [];
  const enchantments: any[] = enchantmentsData ?? [];
  const quests: any[] = questsData ?? [];
  const reload = (keepSelection = true) => {
    if (!keepSelection) setSelectedId(null);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crud", "npcs"] }),
      queryClient.invalidateQueries({ queryKey: ["crud", "maps"] }),
      queryClient.invalidateQueries({ queryKey: ["crud", "items"] }),
      queryClient.invalidateQueries({ queryKey: ["crud", "enchantments"] }),
      queryClient.invalidateQueries({ queryKey: ["crud", "quests"] }),
    ]);
  };
  const [filter, setFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"geral" | "mapas" | "vendas" | "quests" | "acoes">("geral");
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState<Record<string, any>>(npcDefaults());
  const [saving, setSaving] = useState(false);

  const [mapForm, setMapForm] = useState({ ...DEFAULT_MAP });
  const [mapBusy, setMapBusy] = useState(false);

  const [shopForm, setShopForm] = useState({ ...DEFAULT_SHOP });
  const [shopBusy, setShopBusy] = useState(false);

  const [questLinkId, setQuestLinkId] = useState("");
  const [questBusy, setQuestBusy] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiMapId, setAiMapId] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const selected = useMemo(() => npcs.find((n) => n.id === selectedId) || null, [npcs, selectedId]);

  const filteredNpcs = useMemo(() => {
    if (!filter.trim()) return npcs;
    const q = filter.toLowerCase();
    return npcs.filter((n) => n.name.toLowerCase().includes(q) || String(n.type).toLowerCase().includes(q));
  }, [npcs, filter]);

  const fillForm = (n: any) => {
    const values = npcDefaults();
    for (const f of NPC_FIELDS) {
      values[f.name] = n[f.name] ?? values[f.name];
    }
    setForm(values);
  };

  const selectNpc = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    const n = npcs.find((nn) => nn.id === id);
    if (n) fillForm(n);
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setTab("geral");
    setForm(npcDefaults());
  };

  const handleTab = (t: "geral" | "mapas" | "vendas" | "quests" | "acoes") => {
    setTab(t);
    if (t !== "geral" && !selectedId) {
      toast.error("Selecione um NPC primeiro");
      return;
    }
    setTab(t);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.name || "").trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!String(form.type || "").trim()) {
      toast.error("Tipo é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of NPC_FIELDS) {
        const v = form[f.name];
        if (f.type === "boolean") payload[f.name] = !!v;
        else payload[f.name] = v;
      }
      let saved;
      if (creating) {
        saved = (await adminApi.npcs.create(payload)).data;
        toast.success(`NPC "${payload.name}" criado!`);
      } else {
        if (!selectedId) return;
        saved = (await adminApi.npcs.update(selectedId, payload)).data;
        toast.success("NPC atualizado!");
      }
      setSelectedId(saved.id);
      setCreating(false);
      fillForm(saved);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (n: any) => {
    if (!window.confirm(`Excluir o NPC "${n.name}"?`)) return;
    try {
      await adminApi.npcs.delete(n.id);
      toast.success("NPC excluído");
      await reload(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const handleSaveMap = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !mapForm.mapId) {
      toast.error("Escolha um mapa");
      return;
    }
    setMapBusy(true);
    try {
      await adminApi.mapNpcs.create({
        npcId: selectedId,
        mapId: mapForm.mapId,
        positionX: Number(mapForm.positionX) || 50,
        positionY: Number(mapForm.positionY) || 50,
      });
      toast.success("NPC posicionado no mapa");
      setMapForm({ ...DEFAULT_MAP });
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Falha ao salvar");
    } finally {
      setMapBusy(false);
    }
  };

  const handleDeleteMap = async (m: any) => {
    if (!window.confirm(`Remover "${selected?.name}" do mapa "${m.map?.name ?? m.mapId}"?`)) return;
    try {
      await adminApi.mapNpcs.delete(m.id);
      toast.success("Removido do mapa");
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const handleSaveShop = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !shopForm.refId) {
      toast.error("Escolha um item ou encantamento");
      return;
    }
    setShopBusy(true);
    try {
      const payload: Record<string, any> = {
        npcId: selectedId,
        price: Number(shopForm.price) || 0,
        currency: shopForm.currency,
        stock: -1,
        requiredLevel: Number(shopForm.requiredLevel) || 0,
        requiredVip: !!shopForm.requiredVip,
      };
      if (shopForm.kind === "enchantment") payload.enchantmentId = shopForm.refId;
      else payload.itemId = shopForm.refId;
      await adminApi.shopItems.create(payload);
      toast.success("Oferta adicionada");
      setShopForm({ ...DEFAULT_SHOP });
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Falha ao salvar");
    } finally {
      setShopBusy(false);
    }
  };

  const handleDeleteShop = async (s: any) => {
    const name = s.item?.name ?? s.enchantment?.name ?? s.id;
    if (!window.confirm(`Remover a oferta "${name}"?`)) return;
    try {
      await adminApi.shopItems.delete(s.id);
      toast.success("Oferta removida");
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const handleLinkQuest = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !questLinkId) {
      toast.error("Escolha uma quest");
      return;
    }
    setQuestBusy(true);
    try {
      await adminApi.quests.update(questLinkId, { giverNpcId: selectedId });
      toast.success("Quest vinculada ao NPC");
      setQuestLinkId("");
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Falha ao vincular");
    } finally {
      setQuestBusy(false);
    }
  };

  const handleUnlinkQuest = async (q: any) => {
    if (!window.confirm(`Desvincular a quest "${q.title}" deste NPC?`)) return;
    try {
      await adminApi.quests.update(q.id, { giverNpcId: null });
      toast.success("Quest desvinculada");
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao desvincular");
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Descreva o que a IA deve criar");
      return;
    }
    setAiBusy(true);
    try {
      const res = await adminApi.npcs.generate(aiPrompt.trim(), aiMapId || undefined);
      const saved = res.data?.data;
      const created = saved?.npcs ?? [];
      if (created.length > 0) {
        toast.success(`${created.length} NPC(s) gerado(s): ${created.map((n: any) => n.name).join(", ")}`);
      } else {
        toast.success(`NPC "${saved?.name ?? "?"}" gerado e salvo no banco!`);
      }
      setAiOpen(false);
      await reload(false);
      const first = created?.[0] ?? saved;
      if (first?.id) {
        setSelectedId(first.id);
        setCreating(false);
        fillForm(first);
      }
      (saved?.warnings ?? []).forEach((w: string) => toast(w, { icon: "⚠️" }));
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
          <h1 className="text-2xl font-bold">NPCs / Comerciantes</h1>
          <p className="text-sm text-gray-500 mt-1">
            NPCs com diálogo, posição nos mapas e itens à venda — ou use o gerador de IA.
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
            <Plus size={16} /> Novo NPC
          </button>
          <button onClick={() => reload()} className="p-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors" title="Recarregar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Lista */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit">
          <div className="p-4 border-b border-dark-600">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar NPC..." className={inputClass} />
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {loading && <p className="text-center text-gray-500 py-8">Carregando...</p>}
            {!loading && filteredNpcs.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum NPC — crie um ou use o gerador de IA</p>
            )}
            {filteredNpcs.map((n) => {
              const mapCount = Array.isArray(n.mapNpcs) ? n.mapNpcs.length : 0;
              const shopCount = Array.isArray(n.shopItems) ? n.shopItems.length : 0;
              return (
                <button
                  key={n.id}
                  onClick={() => selectNpc(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-dark-700 transition-colors flex items-center gap-3 ${
                    selectedId === n.id ? "bg-accent-600/20 border-l-2 border-l-accent-500" : "hover:bg-dark-700/50"
                  }`}
                >
                  {n.imageUrl ? (
                    <img src={n.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-dark-700 p-0.5 shrink-0" style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <span className="w-9 h-9 rounded bg-dark-700 flex items-center justify-center text-gray-600 shrink-0">?</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-white block truncate">{n.name}</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-dark-700 text-gray-400">{n.type}</span>
                      {mapCount > 0 && (
                        <span className="flex items-center gap-0.5 text-gray-500"><MapPin size={11} /> {mapCount}</span>
                      )}
                      {shopCount > 0 && (
                        <span className="flex items-center gap-0.5 text-gray-500"><ShoppingBag size={11} /> {shopCount}</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhe */}
        <div className="space-y-4">
          {selected || creating ? (
            <>
              <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {creating ? (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500">?</span>
                    ) : selected?.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="w-10 h-10 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500">?</span>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">
                        {creating ? "Novo NPC" : selected?.name}
                        {!creating && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-dark-700 text-gray-400">{selected?.type}</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {creating ? "Preencha os dados abaixo" : selected?.description || "Sem descrição"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!creating && (
                      <button
                        onClick={() => handleDelete(selected!)}
                        className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                      >
                        <Trash2 size={15} /> Excluir
                      </button>
                    )}
                    <div className="flex bg-dark-900 border border-dark-600 rounded-lg p-0.5">
                      <button
                        onClick={() => handleTab("geral")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "geral" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Geral
                      </button>
                      <button
                        onClick={() => handleTab("mapas")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "mapas" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Mapas {!creating && Array.isArray(selected?.mapNpcs) && selected!.mapNpcs.length > 0 ? `(${selected!.mapNpcs.length})` : ""}
                      </button>
                      <button
                        onClick={() => handleTab("vendas")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "vendas" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Vendas {!creating && Array.isArray(selected?.shopItems) && selected!.shopItems.length > 0 ? `(${selected!.shopItems.length})` : ""}
                      </button>
                      <button
                        onClick={() => handleTab("quests")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "quests" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Quests {!creating && Array.isArray(selected?.quests) && selected!.quests.length > 0 ? `(${selected!.quests.length})` : ""}
                      </button>
                      <button
                        onClick={() => handleTab("acoes")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "acoes" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Ações
                      </button>
                    </div>
                  </div>
                </div>

                {!creating && selected && (
                  <div className="px-4 py-2 border-b border-dark-600 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    Diálogo: {selected.dialogue ? `"${selected.dialogue}"` : "—"}
                    {Array.isArray(selected.mapNpcs) && selected.mapNpcs.length > 0 && (
                      <span className="text-gray-500 flex items-center gap-1">
                        • Aparece em: {selected.mapNpcs.map((m: any) => m.map?.name).filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {tab === "geral" ? (
                <form onSubmit={handleSave} className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
                  <EntityFormFields fields={NPC_FIELDS} form={form} onChange={setForm} />
                  <div className="flex justify-end gap-2 pt-2">
                    {creating && (
                      <button type="button" onClick={() => { setCreating(false); setSelectedId(npcs[0]?.id ?? null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {saving ? "Salvando..." : creating ? "Criar NPC" : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              ) : tab === "mapas" ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Posições no mapa</h3>
                        <p className="text-xs text-gray-500">Onde {selected?.name} aparece no jogo</p>
                      </div>
                    </div>
                    <form onSubmit={handleSaveMap} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div className="col-span-2 sm:col-span-4">
                        <label className={labelClass}>Mapa *</label>
                        <select value={mapForm.mapId} onChange={(e) => setMapForm({ ...mapForm, mapId: e.target.value })} className={inputClass}>
                          <option value="">Selecionar mapa...</option>
                          {maps.filter((m) => m.isActive !== false).map((m) => (
                            <option key={m.id} value={m.id}>{m.name} (requer Nv {m.requiredLevel})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Posição X (%)</label>
                        <input type="number" min={0} max={100} value={mapForm.positionX} onChange={(e) => setMapForm({ ...mapForm, positionX: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Posição Y (%)</label>
                        <input type="number" min={0} max={100} value={mapForm.positionY} onChange={(e) => setMapForm({ ...mapForm, positionY: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="submit" disabled={mapBusy} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                          {mapBusy ? "Salvando..." : "Adicionar"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Mapa</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Posição</th>
                          <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(selected?.mapNpcs) ? selected!.mapNpcs : []).map((m: any) => (
                          <tr key={m.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                            <td className="py-2.5 px-4">
                              <span className="flex items-center gap-2 text-white">
                                <MapPin size={14} className="text-gray-500" /> {m.map?.name ?? m.mapId}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">{m.positionX}% , {m.positionY}%</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button onClick={() => handleDeleteMap(m)} className="text-red-400 hover:text-red-300">Remover</button>
                            </td>
                          </tr>
                        ))}
                        {(Array.isArray(selected?.mapNpcs) ? selected!.mapNpcs : []).length === 0 && (
                          <tr><td colSpan={3} className="py-6 text-center text-gray-500">Nenhum mapa configurado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : tab === "vendas" ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Itens à venda</h3>
                        <p className="text-xs text-gray-500">O que {selected?.name} vende (0 = preço sugerido pelo sistema)</p>
                      </div>
                    </div>
                    <form onSubmit={handleSaveShop} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
                        <div className="flex bg-dark-900 border border-dark-600 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => setShopForm({ ...shopForm, kind: "item", refId: "" })}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${shopForm.kind === "item" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                          >
                            Item
                          </button>
                          <button
                            type="button"
                            onClick={() => setShopForm({ ...shopForm, kind: "enchantment", refId: "" })}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${shopForm.kind === "enchantment" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                          >
                            Encantamento
                          </button>
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <label className={labelClass}>{shopForm.kind === "enchantment" ? "Encantamento" : "Item"} *</label>
                        {shopForm.kind === "enchantment" ? (
                          <select value={shopForm.refId} onChange={(e) => setShopForm({ ...shopForm, refId: e.target.value })} className={inputClass}>
                            <option value="">Selecionar encantamento...</option>
                            {enchantments.filter((e) => e.isActive !== false).map((e) => (
                              <option key={e.id} value={e.id}>{e.name} (Nv {e.level})</option>
                            ))}
                          </select>
                        ) : (
                          <select value={shopForm.refId} onChange={(e) => setShopForm({ ...shopForm, refId: e.target.value })} className={inputClass}>
                            <option value="">Selecionar item...</option>
                            {items.filter((i) => i.isActive !== false).map((i) => (
                              <option key={i.id} value={i.id}>{i.name} ({i.rarity ?? "?"})</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>Preço</label>
                        <input type="number" min={0} value={shopForm.price} onChange={(e) => setShopForm({ ...shopForm, price: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Moeda</label>
                        <select value={shopForm.currency} onChange={(e) => setShopForm({ ...shopForm, currency: e.target.value })} className={inputClass}>
                          <option value="gold">Ouro</option>
                          <option value="sf_coins">Moedas SF</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Nível mínimo</label>
                        <input type="number" min={0} value={shopForm.requiredLevel} onChange={(e) => setShopForm({ ...shopForm, requiredLevel: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div className="flex items-end gap-2 h-10">
                        <input id="requiredVip" type="checkbox" checked={!!shopForm.requiredVip} onChange={(e) => setShopForm({ ...shopForm, requiredVip: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                        <label htmlFor="requiredVip" className="text-sm text-gray-300">Requer VIP</label>
                        <button type="submit" disabled={shopBusy} className="ml-auto px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                          {shopBusy ? "Salvando..." : "Adicionar oferta"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Produto</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Preço</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Moeda</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv mín</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">VIP</th>
                          <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(selected?.shopItems) ? selected!.shopItems : []).map((s: any) => (
                          <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                {(s.item?.icon || s.enchantment?.icon) && (
                                  <img src={s.item?.icon ?? s.enchantment?.icon} alt="" className="w-7 h-7 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
                                )}
                                <span className="font-medium text-white">{s.item?.name ?? s.enchantment?.name ?? "?"}</span>
                                {s.enchantment && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400">Nv {s.enchantment.level}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">{Number(s.price)}</td>
                            <td className="py-2.5 px-4 text-xs">{s.currency === "sf_coins" ? "Moedas SF" : "Ouro"}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{s.requiredLevel}</td>
                            <td className="py-2.5 px-4">
                              {s.requiredVip ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">VIP</span> : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button onClick={() => handleDeleteShop(s)} className="text-red-400 hover:text-red-300">Remover</button>
                            </td>
                          </tr>
                        ))}
                        {(Array.isArray(selected?.shopItems) ? selected!.shopItems : []).length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-gray-500">Nenhuma oferta configurada</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : tab === "acoes" ? null : (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Quests entregues</h3>
                        <p className="text-xs text-gray-500">
                          Quests que {selected?.name} entrega no jogo — cada quest pertence a UM único NPC (evita duplicidade)
                        </p>
                      </div>
                    </div>
                    <form onSubmit={handleLinkQuest} className="mt-3 flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <label className={labelClass}>Vincular quest (que ainda não tem NPC)</label>
                        <select value={questLinkId} onChange={(e) => setQuestLinkId(e.target.value)} className={inputClass}>
                          <option value="">Selecionar quest...</option>
                          {quests
                            .filter((q) => !q.giverNpcId || q.giverNpcId === selectedId)
                            .filter((q) => q.isActive !== false)
                            .map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.title} (Nv {q.requiredLevel})
                                {q.giverNpcId ? " — este NPC" : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button type="submit" disabled={questBusy} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                        {questBusy ? "Vinculando..." : "Vincular"}
                      </button>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Quest</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Tipo</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv mín</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Ativa</th>
                          <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(selected?.quests) ? selected!.quests : []).map((q: any) => (
                          <tr key={q.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                            <td className="py-2.5 px-4 font-medium text-white">{q.title}</td>
                            <td className="py-2.5 px-4 text-xs">
                              <span className="px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400">{q.type}</span>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">{q.requiredLevel}</td>
                            <td className="py-2.5 px-4">{q.isActive ? <span className="text-green-400">Sim</span> : <span className="text-gray-600">Não</span>}</td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button onClick={() => handleUnlinkQuest(q)} className="text-red-400 hover:text-red-300">Desvincular</button>
                            </td>
                          </tr>
                        ))}
                        {(Array.isArray(selected?.quests) ? selected!.quests : []).length === 0 && (
                          <tr><td colSpan={5} className="py-6 text-center text-gray-500">Nenhuma quest vinculada a este NPC</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col items-center justify-center p-16 space-y-3">
              <Sparkles className="text-gray-600" size={28} />
              <p className="text-gray-500">Selecione um NPC, crie um novo ou use o gerador de IA</p>
              <button
                onClick={() => setAiOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Wand2 size={16} /> Gerar NPC com IA
              </button>
            </div>
          )}
          {tab === "acoes" && !creating && selected && (
            <NpcActionsEditor npcId={selectedId!} />
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !aiBusy && setAiOpen(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Wand2 size={18} className="text-fuchsia-400" /> Gerar NPC com IA
              </h2>
              <button onClick={() => setAiOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none" disabled={aiBusy}>
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Gemini (ou Groq como fallback) cria NPCs com diálogo, posição no mapa e ofertas de loja (vinculadas por nome a itens/encantamentos existentes). Você pode pedir vários de uma vez (ex.: "3 moradores da vila de pedra").
            </p>
            <label className={labelClass}>Prompt para a IA</label>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} className={inputClass} placeholder='Descreva o(s) NPC(s)... ex.: "ferreiro e seu aprendiz que vendem armas"' />
            <label className={`${labelClass} mt-3`}>Mapa (opcional — força todos os NPCs gerados para este mapa)</label>
            <select value={aiMapId} onChange={(e) => setAiMapId(e.target.value)} className={inputClass}>
              <option value="">Seguir sugestão da IA</option>
              {maps.filter((m) => m.isActive !== false).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
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
