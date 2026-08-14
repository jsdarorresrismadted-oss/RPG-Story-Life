import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Package, Sparkles, Swords, Plus, Hammer, CheckCircle2, XCircle, MapPin, Pencil, Trash2 } from "lucide-react";
import { adminApi } from "../api";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const STATUS_COLORS: Record<string, string> = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-orange-400",
  mythic: "text-red-400",
};

const RARITY_LABELS: Record<string, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  epic: "Épico",
  legendary: "Lendário",
  mythic: "Mítico",
};

const STAT_LABELS: Record<string, string> = {
  strength: "Força",
  intellect: "Intelecto",
  endurance: "Resistência",
  dexterity: "Destreza",
  wisdom: "Sabedoria",
  luck: "Sorte",
};

const NPC_TYPE_LABELS: Record<string, string> = {
  vendor: "Vendedor (itens)",
  quest_giver: "Dador de missões",
  gacha: "Gacha",
  enchantments: "Encantamentos",
  classes: "Classes",
};
const NPC_TYPE_BADGE: Record<string, string> = {
  vendor: "bg-sky-500/15 text-sky-300",
  quest_giver: "bg-emerald-500/15 text-emerald-300",
  gacha: "bg-pink-500/15 text-pink-300",
  enchantments: "bg-purple-500/15 text-purple-300",
  classes: "bg-orange-500/15 text-orange-300",
};

type ShopTab = "items" | "enchantments" | "classes";
type ShopContentKind = "item" | "enchantment" | "class";
type AddModalState =
  | { kind: "pick" }
  | { kind: "item"; editing?: any }
  | { kind: "enchantment"; editing?: any }
  | { kind: "class"; editing?: any }
  | null;

// Tipos de NPC que possuem loja (mesma regra do jogo em MapPage).
const SHOP_TYPES = new Set(["vendor", "shop", "enchantments", "classes"]);
const SHOP_CONTENT_BY_TYPE: Record<string, ShopContentKind[]> = {
  vendor: ["item"],
  shop: ["item"],
  enchantments: ["enchantment"],
  classes: ["class"],
};
const TAB_BY_KIND: Record<ShopContentKind, ShopTab> = { item: "items", enchantment: "enchantments", class: "classes" };

interface Npc {
  id: string;
  name: string;
  type: string;
  description: string;
  shopItems?: any[];
  mapNpcs?: any[];
}

interface CraftRecipe {
  id: string;
  name: string;
  description?: string;
  resultItemId: string;
  resultQuantity?: number;
  goldCost?: string | number;
  requiredLevel?: number;
  ingredients?: string;
}

function parseIngredients(raw?: string): { itemName: string; quantity: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x: any) => ({ itemName: String(x.itemName ?? ""), quantity: Number(x.quantity ?? 1) }));
  } catch { /* ignore */ }
  return [];
}

function imgIcon(src?: string | null, size = "w-11 h-11", className = "") {
  if (!src) return null;
  return (
    <div className={`${size} rounded-lg bg-dark-900 border border-dark-600 flex items-center justify-center overflow-hidden shrink-0 ${className}`}>
      <img src={src} alt="" className="w-3/4 h-3/4 object-contain" />
    </div>
  );
}

function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${cls}`}>{children}</span>;
}

export default function ShopsPage() {
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [enchantments, setEnchantments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [craftRecipes, setCraftRecipes] = useState<CraftRecipe[]>([]);
  const [selected, setSelected] = useState<Npc | null>(null);
  const [loading, setLoading] = useState(true);

  const [addModal, setAddModal] = useState<AddModalState>(null);
  const [saving, setSaving] = useState(false);

  const [itemForm, setItemForm] = useState<Record<string, any>>({});
  const [enchForm, setEnchForm] = useState<Record<string, any>>({});
  const [classForm, setClassForm] = useState<Record<string, any>>({});

  const [shopTab, setShopTab] = useState<ShopTab>("items");
  const [filter, setFilter] = useState("");
  const [npcFilterType, setNpcFilterType] = useState("all");
  const [shopFilterCategory, setShopFilterCategory] = useState("");
  const [shopFilterRarity, setShopFilterRarity] = useState("");
  const [shopFilterMinLevel, setShopFilterMinLevel] = useState("");

  const [mapForm, setMapForm] = useState<Record<string, any>>({});
  const [editingMap, setEditingMap] = useState<any>(null);
  const [savingMap, setSavingMap] = useState(false);

  const ENCH_CATEGORIES = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];

  const recipesByItem = useMemo(() => {
    const map = new Map<string, CraftRecipe[]>();
    for (const r of craftRecipes) {
      const list = map.get(r.resultItemId) ?? [];
      list.push(r);
      map.set(r.resultItemId, list);
    }
    return map;
  }, [craftRecipes]);

  const load = async () => {
    setLoading(true);
    try {
      const [npcsRes, itemsRes, mapsRes, classesRes, enchantmentsRes, recipesRes] = await Promise.all([
        adminApi.npcs.list(),
        adminApi.items.list(),
        adminApi.maps.list(),
        adminApi.classes.list(),
        adminApi.enchantments.list(),
        adminApi.craftRecipes.list(),
      ]);
      const npcList = Array.isArray(npcsRes.data) ? npcsRes.data : [];
      setNpcs(npcList);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setMaps(Array.isArray(mapsRes.data) ? mapsRes.data : []);
      setClasses(Array.isArray(classesRes.data) ? classesRes.data : []);
      setEnchantments(Array.isArray(enchantmentsRes.data) ? enchantmentsRes.data : []);
      setCraftRecipes(Array.isArray(recipesRes.data) ? recipesRes.data : []);
      if (selected) {
        const updated = npcList.find((n: any) => n.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shopNpcs = useMemo(() => npcs.filter((n) => SHOP_TYPES.has(n.type)), [npcs]);
  const availableNpcTypes = useMemo(() => Array.from(new Set(shopNpcs.map((n) => n.type).filter(Boolean))), [shopNpcs]);

  const allowedTabs = useMemo<ShopTab[]>(() => {
    return (SHOP_CONTENT_BY_TYPE[selected?.type ?? ""] ?? []).map((k) => TAB_BY_KIND[k]);
  }, [selected?.type]);

  const filteredNpcs = useMemo(() => {
    return shopNpcs.filter((n) => {
      if (npcFilterType !== "all" && n.type !== npcFilterType) return false;
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
    });
  }, [shopNpcs, filter, npcFilterType]);

  const selectNpc = (n: Npc) => {
    setSelected(n);
    setShopTab((SHOP_CONTENT_BY_TYPE[n.type]?.[0] && TAB_BY_KIND[SHOP_CONTENT_BY_TYPE[n.type][0]]) ?? "items");
  };

  useEffect(() => {
    if (selected && allowedTabs.length > 0 && !allowedTabs.includes(shopTab)) {
      setShopTab(allowedTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTabs.join(",")]);

  const itemName = (id: string | null) => (id ? items.find((i) => i.id === id)?.name ?? id : null);
  const enchantmentName = (id: string | null) => (id ? enchantments.find((e) => e.id === id)?.name ?? id : null);
  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? null;
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? id;

  const filteredShopItems = useMemo(() => {
    const base = selected?.shopItems ?? [];
    if (shopTab === "items") return base.filter((s) => s.itemId && !s.enchantmentId && !s.classId);
    if (shopTab === "classes") return base.filter((s) => s.classId && !s.itemId && !s.enchantmentId);
    return base.filter((s) => s.enchantmentId).filter((s) => {
      const ench = s.enchantment;
      if (shopFilterCategory && ench?.category !== shopFilterCategory) return false;
      if (shopFilterRarity && ench?.rarity !== shopFilterRarity) return false;
      if (shopFilterMinLevel !== "" && Number(ench?.level || 0) < Number(shopFilterMinLevel)) return false;
      return true;
    });
  }, [selected, shopTab, shopFilterCategory, shopFilterRarity, shopFilterMinLevel]);

  const selectedMapNpcs = useMemo(() => selected?.mapNpcs ?? [], [selected]);

  // ===== Abrir modais =====
  const openAdd = () => setAddModal({ kind: "pick" });

  const openItemModal = (editing?: any) => {
    setItemForm({
      itemId: editing?.itemId ?? "",
      mode: editing?.itemId ? "buy" : "buy",
      price: Number(editing?.price ?? 0) || 0,
      currency: editing?.currency ?? "gold",
      stock: Number(editing?.stock ?? -1),
      rotationDays: Number(editing?.rotationDays ?? 0) || 0,
      classId: editing?.classId ?? "",
      requiredLevel: Number(editing?.requiredLevel ?? 0) || 0,
      requiredVip: !!editing?.requiredVip,
      requiredQuestIds: editing?.requiredQuestIds ?? "",
    });
    setAddModal({ kind: "item", editing });
  };

  const openEnchantmentModal = (editing?: any) => {
    setEnchForm({
      enchantmentId: editing?.enchantmentId ?? "",
      price: Number(editing?.price ?? 0) || 0,
      currency: editing?.currency ?? "gold",
      stock: Number(editing?.stock ?? -1),
      rotationDays: Number(editing?.rotationDays ?? 0) || 0,
      classId: editing?.classId ?? "",
      requiredLevel: Number(editing?.requiredLevel ?? 0) || 0,
      requiredVip: !!editing?.requiredVip,
      requiredQuestIds: editing?.requiredQuestIds ?? "",
    });
    setAddModal({ kind: "enchantment", editing });
  };

  const openClassModal = (editing?: any) => {
    setClassForm({
      classId: editing?.classId ?? "",
      price: Number(editing?.price ?? 0) || 0,
      currency: editing?.currency ?? "gold",
      stock: Number(editing?.stock ?? -1),
      rotationDays: Number(editing?.rotationDays ?? 0) || 0,
      requiredLevel: Number(editing?.requiredLevel ?? 0) || 0,
      requiredVip: !!editing?.requiredVip,
      requiredQuestIds: editing?.requiredQuestIds ?? "",
    });
    setAddModal({ kind: "class", editing });
  };

  const openEdit = (s: any) => {
    if (s.enchantmentId) openEnchantmentModal(s);
    else if (s.classId) openClassModal(s);
    else openItemModal(s);
  };

  // ===== Salvar ofertas =====
  const submitOffer = async (payload: Record<string, any>, editingId?: string) => {
    setSaving(true);
    try {
      if (editingId) {
        await adminApi.shopItems.update(editingId, payload);
        toast.success("Oferta atualizada");
      } else {
        await adminApi.shopItems.create(payload);
        toast.success("Adicionado à loja!");
      }
      setAddModal(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const buildOfferPayload = (extra: Record<string, any>) => {
    const currency = extra.currency || "gold";
    return {
      npcId: selected!.id,
      price: Number(extra.price) || 0,
      currency,
      stock: Number(extra.stock) === 0 ? 0 : Number(extra.stock) || -1,
      rotationDays: Number(extra.rotationDays) || 0,
      requiredLevel: Number(extra.requiredLevel) || 0,
      requiredVip: !!extra.requiredVip,
      requiredQuestIds: String(extra.requiredQuestIds ?? "").trim() ? String(extra.requiredQuestIds).trim() : null,
      classId: extra.classId ?? null,
    };
  };

  const handleItemSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !itemForm.itemId) return;
    const recipe = recipesByItem.get(itemForm.itemId);
    if (itemForm.mode !== "buy" && itemForm.mode !== "both" && (!recipe || recipe.length === 0)) {
      toast.error("Este Item não possui Craft");
      return;
    }
    const payload = { ...buildOfferPayload(itemForm), itemId: itemForm.itemId, enchantmentId: null };
    await submitOffer(payload, addModal && addModal.kind === "item" ? addModal.editing?.id : undefined);
  };

  const handleEnchantmentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !enchForm.enchantmentId) return;
    const payload = { ...buildOfferPayload(enchForm), itemId: null, enchantmentId: enchForm.enchantmentId };
    await submitOffer(payload, addModal && addModal.kind === "enchantment" ? addModal.editing?.id : undefined);
  };

  const handleClassSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !classForm.classId) return;
    const payload = { ...buildOfferPayload(classForm), itemId: null, enchantmentId: null, classId: classForm.classId };
    await submitOffer(payload, addModal && addModal.kind === "class" ? addModal.editing?.id : undefined);
  };

  const handleDelete = async (s: any) => {
    const label = s.enchantmentId ? enchantmentName(s.enchantmentId) : s.classId ? className(s.classId) : itemName(s.itemId);
    if (!window.confirm(`Remover "${label ?? "oferta"}" da loja?`)) return;
    try {
      await adminApi.shopItems.delete(s.id);
      toast.success("Removido");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao remover");
    }
  };

  // ===== Mapas =====
  const resetMapForm = () => {
    setMapForm({ mapId: "", positionX: 0, positionY: 0 });
    setEditingMap(null);
  };

  const openEditMap = (m: any) => {
    setEditingMap(m);
    setMapForm({ mapId: m.mapId ?? "", positionX: Number(m.positionX) ?? 0, positionY: Number(m.positionY) ?? 0 });
  };

  const handleMapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !mapForm.mapId) {
      toast.error("Escolha um mapa");
      return;
    }
    setSavingMap(true);
    try {
      const payload = { npcId: selected.id, mapId: mapForm.mapId, positionX: Number(mapForm.positionX) || 0, positionY: Number(mapForm.positionY) || 0 };
      if (editingMap?.id) {
        await adminApi.mapNpcs.update(editingMap.id, payload);
        toast.success("Posição atualizada");
      } else {
        await adminApi.mapNpcs.create(payload);
        toast.success("NPC posicionado no mapa");
      }
      resetMapForm();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSavingMap(false);
    }
  };

  const handleDeleteMap = async (m: any) => {
    if (!window.confirm(`Remover "${selected?.name}" do mapa "${mapName(m.mapId)}"?`)) return;
    try {
      await adminApi.mapNpcs.delete(m.id);
      toast.success("Removido");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao remover");
    }
  };

  // ===== Sub-formulários reutilizáveis =====
  const offerFields = (form: Record<string, any>, setForm: (v: Record<string, any>) => void, opts?: { withClassRestriction?: boolean }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div>
        <label className={labelClass}>Preço</label>
        <input
          type="number"
          min={0}
          value={form.price ?? 0}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          className={inputClass}
          placeholder="ex.: 50.000"
        />
      </div>
      <div>
        <label className={labelClass}>Moeda</label>
        <select value={form.currency ?? "gold"} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
          <option value="gold">Gold</option>
          <option value="sf_coins">SF Coins</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Estoque (-1 = infinito)</label>
        <input type="number" value={form.stock ?? -1} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Rotação (dias)</label>
        <input type="number" value={form.rotationDays ?? 0} onChange={(e) => setForm({ ...form, rotationDays: Number(e.target.value) })} className={inputClass} />
      </div>
      {opts?.withClassRestriction !== false && (
        <div>
          <label className={labelClass}>Classe (opcional)</label>
          <select value={form.classId ?? ""} onChange={(e) => setForm({ ...form, classId: e.target.value })} className={inputClass}>
            <option value="">Qualquer classe</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className={labelClass}>Nível mín.</label>
        <input type="number" value={form.requiredLevel ?? 0} onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Quest para desbloquear (ids)</label>
        <input
          type="text"
          value={form.requiredQuestIds ?? ""}
          onChange={(e) => setForm({ ...form, requiredQuestIds: e.target.value })}
          placeholder="ex: 3f2a1b..., 8c4d5e... (opcional)"
          className={inputClass}
        />
      </div>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.requiredVip}
            onChange={(e) => setForm({ ...form, requiredVip: e.target.checked })}
            className="w-4 h-4 accent-yellow-500"
          />
          Exclusivo VIP
        </label>
      </div>
    </div>
  );

  const modalFooter = (submitLabel: string, editing: boolean, extra?: ReactNode, hideSubmit = false) => (
    <div className="mt-5 flex items-center justify-between gap-3">
      <div className="flex-1">{extra}</div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAddModal(null)} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
          Cancelar
        </button>
        {!hideSubmit && (
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : submitLabel}
          </button>
        )}
      </div>
    </div>
  );

  const modalShell = (title: string, subtitle: string, children: ReactNode) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !saving && setAddModal(null)}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={() => setAddModal(null)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );

  // ===== Preview de conteúdo =====
  const itemPreview = (item: any) => (
    <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-4">
      <div className="flex items-center gap-3">
        {imgIcon(item.icon, "w-12 h-12")}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{item.name}</p>
            {item.rarity && <Badge cls={`bg-dark-700 ${STATUS_COLORS[item.rarity] ?? ""}`}>{RARITY_LABELS[item.rarity] ?? item.rarity}</Badge>}
            {item.isActive ? (
              <Badge cls="bg-green-500/15 text-green-300">Ativo</Badge>
            ) : (
              <Badge cls="bg-red-500/15 text-red-300">Inativo</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">
            {item.type} {item.subtype ? `• ${item.subtype}` : ""} • Nível {item.level}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-2">{item.description}</p>
    </div>
  );

  const craftPreview = (recipes: CraftRecipe[]) => {
    if (!recipes || recipes.length === 0) return null;
    const r = recipes[0];
    const ingredients = parseIngredients(r.ingredients);
    return (
      <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
          <CheckCircle2 size={15} /> Este Item possui Craft
        </div>
        <details>
          <summary className="text-xs text-gray-400 hover:text-white cursor-pointer select-none">
            <Hammer size={12} className="inline mr-1 -mt-0.5" /> Visualizar Craft — {r.name ?? "Receita"}
          </summary>
          <div className="mt-2 space-y-1.5">
            {ingredients.length === 0 && <p className="text-[11px] text-gray-600">—</p>}
            {ingredients.map((ing) => (
              <div key={ing.itemName} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{ing.itemName}</span>
                <span className="font-mono text-gray-400">{ing.quantity}x</span>
              </div>
            ))}
            {Number(r.goldCost || 0) > 0 && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-dark-700">
                <span className="text-yellow-300">Ouro</span>
                <span className="font-mono text-gray-300">{Number(r.goldCost).toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Nível mín.</span>
              <span className="font-mono text-gray-300">{Number(r.requiredLevel || 1)}</span>
            </div>
          </div>
        </details>
      </div>
    );
  };

  const enchantmentPreview = (e: any) => (
    <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Sparkles size={20} className="text-purple-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{e.name}</p>
            <Badge cls="bg-purple-500/15 text-purple-300">{STAT_LABELS[e.category] ?? e.category}</Badge>
            {e.rarity && <Badge cls={`bg-dark-700 ${STATUS_COLORS[e.rarity] ?? ""}`}>{RARITY_LABELS[e.rarity] ?? e.rarity}</Badge>}
            <Badge cls="bg-purple-500/15 text-purple-300">Nv. {e.level ?? 1}</Badge>
            {e.isActive ? (
              <Badge cls="bg-green-500/15 text-green-300">Ativo</Badge>
            ) : (
              <Badge cls="bg-red-500/15 text-red-300">Inativo</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{e.description}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {ENCH_CATEGORIES.map((cat) => {
          const v = Number(e[cat] ?? 0);
          return (
            <div key={cat} className="flex items-center justify-between bg-dark-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-gray-400">{STAT_LABELS[cat]}</span>
              <span className="font-mono text-green-400">{v > 0 ? `+${v}` : "-"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const classPreview = (c: any) => (
    <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-4">
      <div className="flex items-center gap-3">
        {imgIcon(c.icon, "w-12 h-12")}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{c.name}</p>
            <Badge cls="bg-orange-500/15 text-orange-300 capitalize">{c.role ?? "Classe"}</Badge>
            {c.requiredVip && <Badge cls="bg-yellow-500/15 text-yellow-300">VIP</Badge>}
            {c.isActive ? (
              <Badge cls="bg-green-500/15 text-green-300">Ativa</Badge>
            ) : (
              <Badge cls="bg-red-500/15 text-red-300">Inativa</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">
            {c.combatType ?? "melee"} • Nível mín. {c.requiredLevel ?? 1} • {c.statModel?.name ?? "Sem stat model"}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-2">{c.description}</p>
      {Number(c.price) > 0 && (
        <p className="text-xs text-gray-500 mt-2">Preço padrão da classe: <span className="text-yellow-300 font-mono">{Number(c.price).toLocaleString()} gold</span></p>
      )}
    </div>
  );

  // ===== Tabelas =====
  const renderItemRow = (s: any) => {
    const it = items.find((i) => i.id === s.itemId);
    const hasCraft = it ? (recipesByItem.get(it.id)?.length ?? 0) > 0 : false;
    return (
      <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2.5">
            {imgIcon(it?.icon, "w-8 h-8")}
            <span className="font-medium text-white">{it?.name ?? s.itemId}</span>
            {hasCraft && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 flex items-center gap-1" title="Este item possui receita de craft">
                <Hammer size={9} /> Craft
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-4 font-mono text-xs">{String(s.price)}</td>
        <td className="py-2.5 px-4 text-gray-400">{s.currency}</td>
        <td className="py-2.5 px-4">
          {s.classId ? <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">{className(s.classId)}</span> : <span className="text-xs text-gray-500">Qualquer</span>}
        </td>
        <td className="py-2.5 px-4 font-mono text-xs">{Number(s.requiredLevel) > 0 ? s.requiredLevel : "-"}</td>
        <td className="py-2.5 px-4">{s.requiredVip ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300">VIP</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4">{s.requiredQuestIds ? <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300">Quest</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4 font-mono text-xs">{s.stock}</td>
        <td className="py-2.5 px-4 text-right whitespace-nowrap">
          <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 mr-3"><Pencil size={13} className="inline" /> Edit</button>
          <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-300"><Trash2 size={13} className="inline" /> Delete</button>
        </td>
      </tr>
    );
  };

  const renderEnchantmentRow = (s: any) => {
    const e = s.enchantment;
    return (
      <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-purple-300 font-medium">{e?.name ?? enchantmentName(s.enchantmentId)}</span>
            <Badge cls="bg-purple-500/15 text-purple-300">encantamento</Badge>
            {e && (
              <>
                <Badge cls="bg-dark-900 text-gray-400 capitalize">{STAT_LABELS[e.category] ?? e.category}</Badge>
                <Badge cls="bg-dark-900 text-gray-400">{RARITY_LABELS[e.rarity] ?? e.rarity}</Badge>
                <Badge cls="bg-purple-500/15 text-purple-300">Nv. {e.level ?? 1}</Badge>
              </>
            )}
          </div>
        </td>
        <td className="py-2.5 px-4 font-mono text-xs">{String(s.price)}</td>
        <td className="py-2.5 px-4 text-gray-400">{s.currency}</td>
        <td className="py-2.5 px-4">
          {s.classId ? <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">{className(s.classId)}</span> : <span className="text-xs text-gray-500">Qualquer</span>}
        </td>
        <td className="py-2.5 px-4 font-mono text-xs">{Number(s.requiredLevel) > 0 ? s.requiredLevel : "-"}</td>
        <td className="py-2.5 px-4">{s.requiredVip ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300">VIP</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4">{s.requiredQuestIds ? <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300">Quest</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4 font-mono text-xs">{s.stock}</td>
        <td className="py-2.5 px-4 text-right whitespace-nowrap">
          {e && (
            <button
              onClick={async () => {
                try {
                  await adminApi.enchantments.update(e.id, { isActive: !e.isActive });
                  toast.success(e.isActive ? "Encantamento desativado" : "Encantamento ativado");
                  await load();
                } catch (err: any) {
                  toast.error(err.response?.data?.message || "Falha ao alternar");
                }
              }}
              className={`mr-3 text-xs ${e.isActive ? "text-green-400 hover:text-green-300" : "text-gray-500 hover:text-gray-300"}`}
              title="Ativar/desativar este encantamento"
            >
              {e.isActive ? "Ativo" : "Inativo"}
            </button>
          )}
          <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 mr-3"><Pencil size={13} className="inline" /> Edit</button>
          <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-300"><Trash2 size={13} className="inline" /> Delete</button>
        </td>
      </tr>
    );
  };

  const renderClassRow = (s: any) => {
    const c = classes.find((x) => x.id === s.classId);
    return (
      <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2.5">
            {imgIcon(c?.icon, "w-8 h-8")}
            <span className="font-medium text-white">{c?.name ?? s.classId}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 font-mono text-xs">{String(s.price)}</td>
        <td className="py-2.5 px-4 text-gray-400">{s.currency}</td>
        <td className="py-2.5 px-4 font-mono text-xs">{Number(s.requiredLevel) > 0 ? s.requiredLevel : "-"}</td>
        <td className="py-2.5 px-4">{s.requiredVip ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300">VIP</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4">{s.requiredQuestIds ? <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300">Quest</span> : <span className="text-xs text-gray-500">-</span>}</td>
        <td className="py-2.5 px-4 font-mono text-xs">{s.stock}</td>
        <td className="py-2.5 px-4 text-right whitespace-nowrap">
          <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 mr-3"><Pencil size={13} className="inline" /> Edit</button>
          <button onClick={() => handleDelete(s)} className="text-red-400 hover:text-red-300"><Trash2 size={13} className="inline" /> Delete</button>
        </td>
      </tr>
    );
  };

  const tabs: { key: ShopTab; label: string; icon: any }[] = [
    { key: "items", label: "Itens", icon: Package },
    { key: "enchantments", label: "Encantamentos", icon: Sparkles },
    { key: "classes", label: "Classes", icon: Swords },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shops &amp; NPCs em Mapas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Adicione itens, encantamentos e classes existentes à loja de cada NPC. Nada é criado aqui — só disponibilizado na loja.
          </p>
        </div>
        <button onClick={load} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Lista de NPCs */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit">
          <div className="p-4 border-b border-dark-600 space-y-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar NPC..." className={inputClass} />
            <select value={npcFilterType} onChange={(e) => setNpcFilterType(e.target.value)} className={inputClass}>
              <option value="all">Todos os tipos</option>
              {availableNpcTypes.map((t) => (
                <option key={t} value={t}>{NPC_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && <p className="text-center text-gray-500 py-8">Loading...</p>}
            {!loading && filteredNpcs.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum NPC — crie um na página NPCs</p>
            )}
            {filteredNpcs.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNpc(n)}
                className={`w-full text-left px-4 py-3 border-b border-dark-700 transition-colors ${
                  selected?.id === n.id ? "bg-accent-600/20 border-l-2 border-l-accent-500" : "hover:bg-dark-700/50"
                }`}
              >
                <span className="font-medium text-white block">{n.name}</span>
                <span className="text-xs text-gray-500">
                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] mr-1.5 ${NPC_TYPE_BADGE[n.type] ?? "bg-dark-700 text-gray-400"}`}>
                    {NPC_TYPE_LABELS[n.type] ?? n.type}
                  </span>
                  {n.shopItems?.length ?? 0} itens • {n.mapNpcs?.length ?? 0} mapas
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhes do NPC selecionado */}
        {selected ? (
          <div className="space-y-6">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${NPC_TYPE_BADGE[selected.type] ?? "bg-dark-700 text-gray-400"}`}>
                    {NPC_TYPE_LABELS[selected.type] ?? selected.type}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{selected.description}</p>
              </div>
              {allowedTabs.length > 0 && (
                <button
                  onClick={openAdd}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
                >
                  <Plus size={15} /> ADICIONAR
                </button>
              )}
            </div>

            {/* Loja — tabs por categoria */}
            <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-600 flex items-center gap-2 flex-wrap">
                {tabs.filter((t) => allowedTabs.includes(t.key)).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setShopTab(t.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        shopTab === t.key ? "bg-accent-600/20 border border-accent-500/50 text-white" : "bg-dark-900 border border-dark-600 text-gray-400 hover:text-white"
                      }`}
                    >
                      <Icon size={14} /> {t.label}
                    </button>
                  );
                })}
                {allowedTabs.length > 0 && (
                  <div className="ml-auto">
                    <button onClick={openAdd} className="text-xs text-accent-400 hover:text-accent-300">
                      + Adicionar
                    </button>
                  </div>
                )}
              </div>

              {shopTab === "enchantments" && (
                <div className="px-4 py-3 border-b border-dark-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>Categoria</label>
                    <select value={shopFilterCategory} onChange={(e) => setShopFilterCategory(e.target.value)} className={inputClass}>
                      <option value="">Todas</option>
                      {ENCH_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{STAT_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Raridade</label>
                    <select value={shopFilterRarity} onChange={(e) => setShopFilterRarity(e.target.value)} className={inputClass}>
                      <option value="">Todas</option>
                      {Object.entries(RARITY_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Nível mín.</label>
                    <input type="number" min={1} max={150} value={shopFilterMinLevel} onChange={(e) => setShopFilterMinLevel(e.target.value)} className={inputClass} />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setShopFilterCategory("");
                        setShopFilterRarity("");
                        setShopFilterMinLevel("");
                      }}
                      className="text-xs text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg px-3 py-2 transition-colors"
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">
                        {shopTab === "items" ? "Item" : shopTab === "classes" ? "Classe" : "Encantamento"}
                      </th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Preço</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Moeda</th>
                      {shopTab !== "classes" && <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Classe</th>}
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv. mín</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">VIP</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Quest</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Estoque</th>
                      <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShopItems.map((s) => (shopTab === "items" ? renderItemRow(s) : shopTab === "enchantments" ? renderEnchantmentRow(s) : renderClassRow(s)))}
                    {filteredShopItems.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-gray-500">
                          Nada {shopTab === "items" ? "à venda" : shopTab === "classes" ? "de classes na loja" : "de encantamentos na loja"} deste NPC — use [+ ADICIONAR]
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* NPC nos Mapas */}
            <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
                <h3 className="font-medium text-white flex items-center gap-1.5"><MapPin size={14} /> NPC nos Mapas</h3>
                <button onClick={resetMapForm} className="text-xs text-accent-400 hover:text-accent-300">
                  + Posicionar em mapa
                </button>
              </div>

              <form onSubmit={handleMapSubmit} className="p-4 border-b border-dark-700 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Mapa *</label>
                  <select value={mapForm.mapId ?? ""} onChange={(e) => setMapForm({ ...mapForm, mapId: e.target.value })} className={inputClass}>
                    <option value="">Selecionar mapa...</option>
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Posição X</label>
                  <input type="number" value={mapForm.positionX ?? 0} onChange={(e) => setMapForm({ ...mapForm, positionX: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Posição Y</label>
                  <input type="number" value={mapForm.positionY ?? 0} onChange={(e) => setMapForm({ ...mapForm, positionY: Number(e.target.value) })} className={inputClass} />
                </div>
                <div className="sm:col-span-4 flex justify-end gap-2">
                  {editingMap && (
                    <button type="button" onClick={resetMapForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={savingMap} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {savingMap ? "Saving..." : editingMap?.id ? "Salvar posição" : "Posicionar"}
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Mapa</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Posição X</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Posição Y</th>
                      <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMapNpcs.map((m) => (
                      <tr key={m.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                        <td className="py-2.5 px-4 font-medium text-white">{mapName(m.mapId)}</td>
                        <td className="py-2.5 px-4 font-mono text-xs">{m.positionX}</td>
                        <td className="py-2.5 px-4 font-mono text-xs">{m.positionY}</td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button onClick={() => openEditMap(m)} className="text-blue-400 hover:text-blue-300 mr-3"><Pencil size={13} className="inline" /> Edit</button>
                          <button onClick={() => handleDeleteMap(m)} className="text-red-400 hover:text-red-300"><Trash2 size={13} className="inline" /> Delete</button>
                        </td>
                      </tr>
                    ))}
                    {selectedMapNpcs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-gray-500">Este NPC ainda não está em nenhum mapa</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-600 rounded-xl flex items-center justify-center p-16">
            <p className="text-gray-500">Selecione um NPC para gerenciar loja e mapas</p>
          </div>
        )}
      </div>

      {/* ===== Modal: escolher categoria ===== */}
      {addModal?.kind === "pick" && (() => {
        const kinds = SHOP_CONTENT_BY_TYPE[selected?.type ?? ""] ?? [];
        const options: { kind: string; label: string; desc: string; icon: any; cls: string; open: () => void }[] = [];
        if (kinds.includes("item")) options.push({ kind: "item", label: "Itens", desc: "Itens comuns e itens que possuem Craft", icon: Package, cls: "text-sky-300 border-sky-500/30 bg-sky-500/15", open: () => openItemModal() });
        if (kinds.includes("enchantment")) options.push({ kind: "enchantment", label: "Encantamentos", desc: "Encantamentos existentes para venda", icon: Sparkles, cls: "text-purple-300 border-purple-500/30 bg-purple-500/15", open: () => openEnchantmentModal() });
        if (kinds.includes("class")) options.push({ kind: "class", label: "Classes", desc: "Classes existentes para desbloqueio", icon: Swords, cls: "text-orange-300 border-orange-500/30 bg-orange-500/15", open: () => openClassModal() });
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setAddModal(null)}>
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-bold">Adicionar à Shop</h2>
                <button onClick={() => setAddModal(null)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
              </div>
              <div className="space-y-2">
                {options.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.kind}
                      onClick={opt.open}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-dark-900 border border-dark-600 hover:bg-dark-700/50 rounded-xl text-left transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${opt.cls}`}><Icon size={18} /></div>
                      <div>
                        <p className="font-medium text-white">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Modal: Adicionar Item ===== */}
      {addModal?.kind === "item" && (
        modalShell(
          "Adicionar Item",
          "Selecione um Item que já existe no jogo. Este painel só adiciona o Item à loja — não edita o Item.",
          <form onSubmit={handleItemSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Item *</label>
              <select
                value={itemForm.itemId ?? ""}
                onChange={(e) => {
                  const it = items.find((i) => i.id === e.target.value);
                  setItemForm({
                    ...itemForm,
                    itemId: e.target.value,
                    mode: recipesByItem.has(e.target.value) ? "both" : "buy",
                    price: Number(it?.buyPrice ?? 0) || itemForm.price || 0,
                  });
                }}
                className={inputClass}
              >
                <option value="">Selecionar Item...</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {recipesByItem.has(i.id) ? "⚒" : ""}
                  </option>
                ))}
              </select>
            </div>

            {itemForm.itemId && (() => {
              const it = items.find((i) => i.id === itemForm.itemId);
              if (!it) return null;
              const recipes = recipesByItem.get(it.id) ?? [];
              const onlyCraft = itemForm.mode === "craft";
              return (
                <>
                  {itemPreview(it)}
                  <div className="mt-3">
                    {recipes.length > 0 ? craftPreview(recipes) : (
                      <div className="bg-dark-900/60 border border-dark-600 rounded-xl p-3 text-sm text-gray-400 flex items-center gap-2">
                        <XCircle size={15} className="text-gray-500" /> Este Item não possui Craft.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Forma de obtenção</label>
                    <div className="flex gap-2">
                      {[
                        { v: "buy", l: "Compra" },
                        { v: "craft", l: "Craft", disabled: recipes.length === 0 },
                        { v: "both", l: "Compra + Craft", disabled: recipes.length === 0 },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          disabled={opt.disabled}
                          onClick={() => setItemForm({ ...itemForm, mode: opt.v })}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            itemForm.mode === opt.v
                              ? "bg-accent-600/20 border-accent-500/60 text-white"
                              : "bg-dark-900 border-dark-600 text-gray-400 hover:text-white"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {onlyCraft ? (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-sm text-green-300">
                      Este Item já fica disponível na loja deste NPC através da receita de craft existente — nada precisa ser
                      criado. Nenhuma compra é adicionada.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className={labelClass}>Configuração da oferta</label>
                        {offerFields(itemForm, setItemForm, { withClassRestriction: false })}
                      </div>
                      {itemForm.mode === "both" && (
                        <p className="text-xs text-gray-500">O jogador poderá comprar o Item <b>ou</b> craftá-lo com a receita existente.</p>
                      )}
                    </>
                  )}
                </>
              );
            })()}

            {modalFooter(
              "ADICIONAR À SHOP",
              !!addModal.editing,
              itemForm.itemId && (() => {
                const onlyCraft = itemForm.mode === "craft" && (recipesByItem.get(itemForm.itemId)?.length ?? 0) > 0;
                return onlyCraft ? (
                  <button
                    type="button"
                    onClick={() => setAddModal(null)}
                    className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Fechar
                  </button>
                ) : null;
              })(),
              itemForm.mode === "craft" && (recipesByItem.get(itemForm.itemId ?? "")?.length ?? 0) > 0
            )}
          </form>
        )
      )}

      {/* ===== Modal: Adicionar Encantamento ===== */}
      {addModal?.kind === "enchantment" && (
        modalShell(
          "Adicionar Encantamento",
          "Selecione um Encantamento que já existe no jogo. Os valores vêm automaticamente do Encantamento — não edite aqui.",
          <form onSubmit={handleEnchantmentSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Encantamento *</label>
              <select
                value={enchForm.enchantmentId ?? ""}
                onChange={(e) => setEnchForm({ ...enchForm, enchantmentId: e.target.value })}
                className={inputClass}
              >
                <option value="">Selecionar Encantamento...</option>
                {enchantments.map((en) => (
                  <option key={en.id} value={en.id}>{en.name}</option>
                ))}
              </select>
            </div>

            {enchForm.enchantmentId && (() => {
              const en = enchantments.find((x) => x.id === enchForm.enchantmentId);
              if (!en) return null;
              return (
                <>
                  {enchantmentPreview(en)}
                  <div>
                    <label className={labelClass}>Configuração da oferta</label>
                    {offerFields(enchForm, setEnchForm, { withClassRestriction: false })}
                  </div>
                </>
              );
            })()}

            {modalFooter("ADICIONAR À SHOP", !!addModal.editing)}
          </form>
        )
      )}

      {/* ===== Modal: Adicionar Classe ===== */}
      {addModal?.kind === "class" && (
        modalShell(
          "Adicionar Classe",
          "Selecione uma Classe que já existe no jogo. Este painel só a adiciona à loja — não edita a Classe.",
          <form onSubmit={handleClassSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Classe *</label>
              <select
                value={classForm.classId ?? ""}
                onChange={(e) => {
                  const c = classes.find((x) => x.id === e.target.value);
                  setClassForm({ ...classForm, classId: e.target.value, price: Number(c?.price ?? 0) || classForm.price || 0 });
                }}
                className={inputClass}
              >
                <option value="">Selecionar Classe...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {classForm.classId && (() => {
              const c = classes.find((x) => x.id === classForm.classId);
              if (!c) return null;
              return (
                <>
                  {classPreview(c)}
                  <div>
                    <label className={labelClass}>Configuração da oferta</label>
                    {offerFields(classForm, setClassForm, { withClassRestriction: false })}
                  </div>
                </>
              );
            })()}

            {modalFooter("ADICIONAR À SHOP", !!addModal.editing)}
          </form>
        )
      )}
    </div>
  );
}
