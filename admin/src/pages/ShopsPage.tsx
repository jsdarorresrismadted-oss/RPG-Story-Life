import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

interface Npc {
  id: string;
  name: string;
  type: string;
  description: string;
  shopItems?: any[];
  mapNpcs?: any[];
}

interface Option {
  id: string;
  name: string;
}

export default function ShopsPage() {
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [enchantments, setEnchantments] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [maps, setMaps] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Npc | null>(null);
  const [loading, setLoading] = useState(true);

  const [itemForm, setItemForm] = useState<Record<string, any>>({});
  const [editingItem, setEditingItem] = useState<any>(null);
  const [savingItem, setSavingItem] = useState(false);

  const [mapForm, setMapForm] = useState<Record<string, any>>({});
  const [editingMap, setEditingMap] = useState<any>(null);
  const [savingMap, setSavingMap] = useState(false);

  const [filter, setFilter] = useState("");
  const [shopFilterType, setShopFilterType] = useState("all");
  const [shopFilterCategory, setShopFilterCategory] = useState("");
  const [shopFilterRarity, setShopFilterRarity] = useState("");
  const [shopFilterMinLevel, setShopFilterMinLevel] = useState("");
  const [npcFilterType, setNpcFilterType] = useState("all");

  const ENCH_CATEGORIES = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];
  const STAT_LABELS: Record<string, string> = {
    strength: "Força",
    intellect: "Intelecto",
    endurance: "Resistência",
    dexterity: "Destreza",
    wisdom: "Sabedoria",
    luck: "Sorte",
  };
  const RARITY_LABELS: Record<string, string> = {
    common: "Comum",
    uncommon: "Incomum",
    rare: "Raro",
    epic: "Épico",
    legendary: "Lendário",
    mythic: "Mítico",
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
  const availableNpcTypes = useMemo(() => {
    const set = new Set<string>();
    for (const n of npcs) if (n.type) set.add(n.type);
    return Array.from(set);
  }, [npcs]);

  const load = async () => {
    setLoading(true);
    try {
      const [npcsRes, itemsRes, mapsRes, classesRes, enchantmentsRes] = await Promise.all([
        adminApi.npcs.list(),
        adminApi.items.list(),
        adminApi.maps.list(),
        adminApi.classes.list(),
        adminApi.enchantments.list(),
      ]);
      const npcList = Array.isArray(npcsRes.data) ? npcsRes.data : [];
      setNpcs(npcList);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setMaps(Array.isArray(mapsRes.data) ? mapsRes.data : []);
      setClasses(Array.isArray(classesRes.data) ? classesRes.data : []);
      setEnchantments(Array.isArray(enchantmentsRes.data) ? enchantmentsRes.data : []);
      if (selected) {
        const updated = npcList.find((n: any) => n.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredNpcs = useMemo(() => {
    return npcs.filter((n) => {
      if (npcFilterType !== "all" && n.type !== npcFilterType) return false;
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
    });
  }, [npcs, filter, npcFilterType]);

  const selectedShopItems = useMemo(() => {
    const base = selected?.shopItems ?? [];
    return base.filter((s) => {
      if (shopFilterType === "items" && s.enchantmentId) return false;
      if (shopFilterType === "enchantments" && !s.enchantmentId) return false;
      const ench = s.enchantment;
      if (shopFilterCategory && ench?.category !== shopFilterCategory) return false;
      if (shopFilterRarity && ench?.rarity !== shopFilterRarity) return false;
      if (shopFilterMinLevel !== "" && Number(ench?.level || 0) < Number(shopFilterMinLevel)) return false;
      return true;
    });
  }, [selected, shopFilterType, shopFilterCategory, shopFilterRarity, shopFilterMinLevel]);
  const selectedMapNpcs = useMemo(() => selected?.mapNpcs ?? [], [selected]);

  const itemName = (id: string | null) => (id ? items.find((i) => i.id === id)?.name ?? id : null);
  const enchantmentName = (id: string | null) => (id ? enchantments.find((e) => e.id === id)?.name ?? id : null);
  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? null;
  const mapName = (id: string) => maps.find((m) => m.id === id)?.name ?? id;

  const resetItemForm = () => {
    setItemForm({ itemId: "", enchantmentId: "", price: 0, currency: "gold", stock: -1, rotationDays: 0, classId: "", requiredLevel: 0, requiredVip: false, requiredQuestIds: "" });
    setEditingItem(null);
  };

  const resetMapForm = () => {
    setMapForm({ mapId: "", positionX: 0, positionY: 0 });
    setEditingMap(null);
  };

  const openEditItem = (s: any) => {
    setEditingItem(s);
    setItemForm({
      itemId: s.itemId ?? "",
      enchantmentId: s.enchantmentId ?? "",
      price: Number(s.price) || 0,
      currency: s.currency ?? "gold",
      stock: Number(s.stock) ?? -1,
      rotationDays: Number(s.rotationDays) || 0,
      classId: s.classId ?? "",
      requiredLevel: Number(s.requiredLevel) || 0,
      requiredVip: !!s.requiredVip,
      requiredQuestIds: s.requiredQuestIds ?? "",
    });
  };

  const openEditMap = (m: any) => {
    setEditingMap(m);
    setMapForm({
      mapId: m.mapId ?? "",
      positionX: Number(m.positionX) ?? 0,
      positionY: Number(m.positionY) ?? 0,
    });
  };

  const handleItemSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || (!itemForm.itemId && !itemForm.enchantmentId)) {
      toast.error("Escolha um item ou um encantamento");
      return;
    }
    setSavingItem(true);
    try {
      const payload = {
        npcId: selected.id,
        itemId: itemForm.enchantmentId ? null : itemForm.itemId || null,
        enchantmentId: itemForm.enchantmentId || null,
        price: Number(itemForm.price) || 0,
        currency: itemForm.currency || "gold",
        stock: Number(itemForm.stock) ?? -1,
        rotationDays: Number(itemForm.rotationDays) || 0,
        classId: itemForm.classId || null,
        requiredLevel: Number(itemForm.requiredLevel) || 0,
        requiredVip: !!itemForm.requiredVip,
        requiredQuestIds: itemForm.requiredQuestIds?.trim() ? itemForm.requiredQuestIds.trim() : null,
      };
      if (editingItem?.id) {
        await adminApi.shopItems.update(editingItem.id, payload);
        toast.success("Item da loja atualizado");
      } else {
        await adminApi.shopItems.create(payload);
        toast.success("Item adicionado à loja");
      }
      resetItemForm();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (s: any) => {
    const label = s.enchantmentId ? enchantmentName(s.enchantmentId) : itemName(s.itemId);
    if (!window.confirm(`Remover "${label ?? "item"}" da loja?`)) return;
    try {
      await adminApi.shopItems.delete(s.id);
      toast.success("Removido");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const handleMapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !mapForm.mapId) {
      toast.error("Escolha um mapa");
      return;
    }
    setSavingMap(true);
    try {
      const payload = {
        npcId: selected.id,
        mapId: mapForm.mapId,
        positionX: Number(mapForm.positionX) || 0,
        positionY: Number(mapForm.positionY) || 0,
      };
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
      toast.error(err.response?.data?.message || "Failed to save");
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
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shops &amp; NPCs em Mapas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Itens que cada NPC vende e onde ele fica nos mapas. Crie NPCs na página NPCs.
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
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar NPC..."
              className={inputClass}
            />
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
                onClick={() => setSelected(n)}
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
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${NPC_TYPE_BADGE[selected.type] ?? "bg-dark-700 text-gray-400"}`}>
                  {NPC_TYPE_LABELS[selected.type] ?? selected.type}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">{selected.description}</p>
            </div>

            {/* Itens da loja */}
            <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
                <h3 className="font-medium text-white">Itens da Loja</h3>
                <button onClick={resetItemForm} className="text-xs text-accent-400 hover:text-accent-300">
                  + Adicionar item
                </button>
              </div>

              <div className="px-4 py-3 border-b border-dark-700 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className={labelClass}>Mostrar</label>
                  <select value={shopFilterType} onChange={(e) => setShopFilterType(e.target.value)} className={inputClass}>
                    <option value="all">Tudo</option>
                    <option value="items">Só itens</option>
                    <option value="enchantments">Só encantamentos</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Encant. — categoria</label>
                  <select value={shopFilterCategory} onChange={(e) => setShopFilterCategory(e.target.value)} className={inputClass}>
                    <option value="">Todas</option>
                    {ENCH_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{STAT_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Encant. — raridade</label>
                  <select value={shopFilterRarity} onChange={(e) => setShopFilterRarity(e.target.value)} className={inputClass}>
                    <option value="">Todas</option>
                    {Object.entries(RARITY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Encant. — nível mín.</label>
                  <input type="number" min={1} max={150} value={shopFilterMinLevel} onChange={(e) => setShopFilterMinLevel(e.target.value)} className={inputClass} />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setShopFilterType("all");
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

              <form onSubmit={handleItemSubmit} className="p-4 border-b border-dark-700 grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelClass}>Item *</label>
                  <select
                    value={itemForm.itemId ?? ""}
                    disabled={!!itemForm.enchantmentId}
                    onChange={(e) => setItemForm({ ...itemForm, itemId: e.target.value })}
                    className={`${inputClass} ${itemForm.enchantmentId ? "opacity-40" : ""}`}
                  >
                    <option value="">Selecionar item...</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelClass}>ou Encantamento</label>
                  <select
                    value={itemForm.enchantmentId ?? ""}
                    disabled={!!itemForm.itemId}
                    onChange={(e) => setItemForm({ ...itemForm, enchantmentId: e.target.value })}
                    className={`${inputClass} ${itemForm.itemId ? "opacity-40" : ""}`}
                  >
                    <option value="">Nenhum (vender item)</option>
                    {enchantments.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Preço</label>
                  <input type="number" value={itemForm.price ?? 0} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Moeda</label>
                  <select value={itemForm.currency ?? "gold"} onChange={(e) => setItemForm({ ...itemForm, currency: e.target.value })} className={inputClass}>
                    <option value="gold">Gold</option>
                    <option value="gems">Gems</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Estoque (-1 = infinito)</label>
                  <input type="number" value={itemForm.stock ?? -1} onChange={(e) => setItemForm({ ...itemForm, stock: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Rotação (dias)</label>
                  <input type="number" value={itemForm.rotationDays ?? 0} onChange={(e) => setItemForm({ ...itemForm, rotationDays: Number(e.target.value) })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Classe (opcional)</label>
                  <select value={itemForm.classId ?? ""} onChange={(e) => setItemForm({ ...itemForm, classId: e.target.value })} className={inputClass}>
                    <option value="">Qualquer classe</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nível mín.</label>
                  <input type="number" value={itemForm.requiredLevel ?? 0} onChange={(e) => setItemForm({ ...itemForm, requiredLevel: Number(e.target.value) })} className={inputClass} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-300 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!itemForm.requiredVip}
                      onChange={(e) => setItemForm({ ...itemForm, requiredVip: e.target.checked })}
                      className="w-4 h-4 accent-yellow-500"
                    />
                    Exclusivo VIP
                  </label>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelClass}>Quest para desbloquear (ids separados por vírgula)</label>
                  <input
                    type="text"
                    value={itemForm.requiredQuestIds ?? ""}
                    onChange={(e) => setItemForm({ ...itemForm, requiredQuestIds: e.target.value })}
                    placeholder="ex: 3f2a1b..., 8c4d5e... (opcional)"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2 sm:col-span-6 flex justify-end gap-2">
                  {editingItem && (
                    <button type="button" onClick={resetItemForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={savingItem} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    {savingItem ? "Saving..." : editingItem?.id ? "Salvar alterações" : "Adicionar à loja"}
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Item</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Preço</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Moeda</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Classe</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Nv. mín</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">VIP</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Quest</th>
                      <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Estoque</th>
                      <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedShopItems.map((s) => (
                      <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                        <td className="py-2.5 px-4 font-medium text-white">
                          {s.enchantmentId ? (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-purple-300">{enchantmentName(s.enchantmentId) ?? "Encantamento"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300">encantamento</span>
                              {s.enchantment && (
                                <>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-900 text-gray-400 capitalize">
                                    {STAT_LABELS[s.enchantment.category] ?? s.enchantment.category}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-900 text-gray-400">
                                    {RARITY_LABELS[s.enchantment.rarity] ?? s.enchantment.rarity}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
                                    Nv. {s.enchantment.level ?? 1}
                                  </span>
                                </>
                              )}
                            </span>
                          ) : (
                            itemName(s.itemId) ?? "-"
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs">{String(s.price)}</td>
                        <td className="py-2.5 px-4 text-gray-400">{s.currency}</td>
                        <td className="py-2.5 px-4">
                          {s.classId ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">
                              {className(s.classId)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Qualquer</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs">{Number(s.requiredLevel) > 0 ? s.requiredLevel : "-"}</td>
                        <td className="py-2.5 px-4">
                          {s.requiredVip ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300">VIP</span>
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {s.requiredQuestIds ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300">Quest</span>
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs">{s.stock}</td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {s.enchantmentId && s.enchantment && (
                            <button
                              onClick={async () => {
                                try {
                                  await adminApi.enchantments.update(s.enchantment.id, { isActive: !s.enchantment.isActive });
                                  toast.success(s.enchantment.isActive ? "Encantamento desativado" : "Encantamento ativado");
                                  await load();
                                } catch (err: any) {
                                  toast.error(err.response?.data?.message || "Falha ao alternar");
                                }
                              }}
                              className={`mr-3 text-xs ${s.enchantment.isActive ? "text-green-400 hover:text-green-300" : "text-gray-500 hover:text-gray-300"}`}
                              title="Ativar/desativar este encantamento"
                            >
                              {s.enchantment.isActive ? "Ativo" : "Inativo"}
                            </button>
                          )}
                          <button onClick={() => openEditItem(s)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                          <button onClick={() => handleDeleteItem(s)} className="text-red-400 hover:text-red-300">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {selectedShopItems.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-gray-500">Nenhum item na loja deste NPC</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mapas */}
            <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
                <h3 className="font-medium text-white">NPC nos Mapas</h3>
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
                          <button onClick={() => openEditMap(m)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                          <button onClick={() => handleDeleteMap(m)} className="text-red-400 hover:text-red-300">Delete</button>
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
    </div>
  );
}
