import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { inventoryApi, authApi, marketApi, classesApi, craftApi } from "../services/api";
import { InventoryItem, UserEnchantment } from "../types";
import {
  Backpack, Search, Star, Coins,
  Shield, Sparkles, Swords,
} from "lucide-react";
import { useGameStore } from "../store/gameStore";
import { EntityIcon } from "../components/EntityIcon";
import { useAuthStore } from "../store/authStore";
import CharacterPreview from "../components/CharacterPreview";
import { EnchantItemPicker } from "../components/EnchantItemPicker";
import { effectiveEnchantmentStats } from "../lib/enchantmentStats";
import toast from "react-hot-toast";

const rarityOrder: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, artifact: 6,
};

const CORE_STAT_LABELS: { key: string; label: string; color: string }[] = [
  { key: "strength", label: "Força", color: "text-orange-400" },
  { key: "intellect", label: "Intelecto", color: "text-blue-400" },
  { key: "endurance", label: "Vigor", color: "text-red-400" },
  { key: "dexterity", label: "Destreza", color: "text-green-400" },
  { key: "wisdom", label: "Sabedoria", color: "text-purple-400" },
  { key: "luck", label: "Sorte", color: "text-yellow-400" },
];

const GACHA_BOOST_LABELS: Record<string, string> = {
  defense: "Defesa",
  damage: "Dano Geral",
  dropChance: "Chance de Drop",
  xp: "XP",
  gold: "Ouro",
  classXp: "XP de Classe",
};

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selling, setSelling] = useState(false);
  const [listing, setListing] = useState(false);
  const [listPrice, setListPrice] = useState(0);
  const [listQty, setListQty] = useState(1);
  const [ownedEnchants, setOwnedEnchants] = useState<UserEnchantment[]>([]);
  const [enchantBusy, setEnchantBusy] = useState(false);
  const [enchantPick, setEnchantPick] = useState<UserEnchantment | null>(null);
  const [applyingInvId, setApplyingInvId] = useState<string | null>(null);
  const [unlockedClasses, setUnlockedClasses] = useState<any[]>([]);
  const [switchingClass, setSwitchingClass] = useState<string | null>(null);
  const [crafting, setCrafting] = useState(false);
  const { selectedCharacter, setCharacter } = useGameStore();
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  const loadItems = () => {
    inventoryApi.list()
      .then(({ data }) => setItems(data))
      .catch(() => {});
    inventoryApi.enchantments()
      .then(({ data }) => setOwnedEnchants(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    inventoryApi.list()
      .then(({ data }) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    inventoryApi.enchantments()
      .then(({ data }) => setOwnedEnchants(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadClasses = () => {
    if (!selectedCharacter?.id) return;
    classesApi.listClasses(selectedCharacter.id)
      .then(({ data }) => setUnlockedClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadClasses();
  }, [selectedCharacter?.id]);

  const handleSwitchClass = async (gc: any) => {
    if (!selectedCharacter) return;
    setSwitchingClass(gc.id);
    try {
      const { data } = await classesApi.switchClass(selectedCharacter.id, gc.id);
      setCharacter({
        ...selectedCharacter,
        classId: data.classId,
        class: { name: gc.name, slug: gc.slug, icon: gc.icon || null },
      });
      toast.success(`Classe trocada para ${gc.name}!`);
      loadClasses();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao trocar de classe");
    } finally {
      setSwitchingClass(null);
    }
  };

  const refreshUser = async () => {
    try {
      const { data } = await authApi.me();
      if (data) setUser(data);
    } catch {}
  };

  const handleSellNow = async () => {
    if (!selectedItem) return;
    setSelling(true);
    try {
      await marketApi.sellNow({ inventoryId: selectedItem.id });
      toast.success(`Vendido por ${selectedItem.item.sellPrice}G!`);
      setSelectedItem(null);
      loadItems();
      refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao vender");
    } finally {
      setSelling(false);
    }
  };

  const handleList = async () => {
    if (!selectedItem || listPrice <= 0) return;
    setSelling(true);
    try {
      await marketApi.sell({
        inventoryId: selectedItem.id,
        price: listPrice,
        quantity: selectedItem.quantity > 1 ? listQty : undefined,
      });
      toast.success("Item anunciado no mercado!");
      setSelectedItem(null);
      setListing(false);
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao anunciar");
    } finally {
      setSelling(false);
    }
  };

  const handleEquip = async (inv: InventoryItem) => {
    if (!selectedCharacter) return;
    setSelling(true);
    try {
      await inventoryApi.equip({ inventoryId: inv.id, characterId: selectedCharacter.id });
      toast.success(`${inv.item.name} equipado!`);
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao equipar");
    } finally {
      setSelling(false);
    }
  };

  const handleUnequip = async (inv: InventoryItem) => {
    if (!selectedCharacter) return;
    setSelling(true);
    try {
      await inventoryApi.unequip({ inventoryId: inv.id, characterId: selectedCharacter.id });
      toast.success("Item desequipado");
      setSelectedItem(null);
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao desequipar");
    } finally {
      setSelling(false);
    }
  };

  const compatibleEnchants = (item: InventoryItem): UserEnchantment[] => {
    if (!item.item || item.item.type === "consumable") return [];
    let slots: string[] = [];
    try { slots = JSON.parse(item.item.enchantment?.compatibleSlots || "[]"); } catch {}
    return ownedEnchants.filter((ue) => {
      const en = ue.enchantment;
      if (!en || ue.quantity < 1) return false;
      if ((user?.level ?? 0) < en.level) return false;
      if (slots.length > 0 && !slots.includes(item.item.type)) return false;
      return true;
    });
  };

  const handleApplyEnchant = async (enchantmentId: string) => {
    if (!selectedItem) return;
    setEnchantBusy(true);
    try {
      await inventoryApi.enchant({ inventoryId: selectedItem.id, enchantmentId });
      toast.success("Encantamento aplicado!");
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao encantar");
    } finally {
      setEnchantBusy(false);
    }
  };

  const handleRemoveEnchant = async () => {
    if (!selectedItem) return;
    setEnchantBusy(true);
    try {
      await inventoryApi.removeEnchant({ inventoryId: selectedItem.id });
      toast.success("Encantamento removido");
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao remover encantamento");
    } finally {
      setEnchantBusy(false);
    }
  };

  const handleEnchantPickApply = async (inventoryId: string) => {
    if (!enchantPick) return;
    setApplyingInvId(inventoryId);
    try {
      await inventoryApi.enchant({ inventoryId, enchantmentId: enchantPick.enchantment.id });
      toast.success("Encantamento aplicado!");
      setEnchantPick(null);
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao encantar");
    } finally {
      setApplyingInvId(null);
    }
  };

  const handleCraft = async (recipeId: string) => {
    setCrafting(true);
    try {
      const { data } = await craftApi.craft(recipeId);
      toast.success(data.message || "Item craftado!");
      setSelectedItem(null);
      loadItems();
      refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao craftar");
    } finally {
      setCrafting(false);
    }
  };

  const ownedCount = (name: string): number =>
    items
      .filter((inv) => inv.item.name.toLowerCase() === String(name).toLowerCase())
      .reduce((acc, inv) => acc + inv.quantity, 0);

  const equippedItems = items.filter((i) => i.isEquipped);
  const equippedMap: Record<string, InventoryItem> = {};
  for (const inv of equippedItems) {
    equippedMap[inv.item.type] = inv;
  }

  const filtered = items
    .filter(i => filterType === "all" || i.item.type === filterType)
    .filter(i => !search || i.item.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (rarityOrder[b.item.rarity] || 0) - (rarityOrder[a.item.rarity] || 0));

  const types = ["all", "classes", ...new Set(items.map(i => i.item.type))];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Backpack size={24} className="text-purple-400" /> Inventário
          <span className="text-sm text-gray-500 font-normal">({items.length} itens)</span>
        </h1>
      </div>

      <div className="panel p-4">
        <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Shield size={16} className="text-yellow-400" /> Equipamento
        </h2>
        <div className="flex justify-center">
          <CharacterPreview
            equipped={equippedMap}
            classInfo={selectedCharacter?.class ? { name: selectedCharacter.class.name, icon: selectedCharacter.class.icon ?? null } : null}
            onSlotClick={(slot, inv) => {
              if (inv) setSelectedItem(inv);
            }}
            onClassClick={() => selectedCharacter?.class?.slug && navigate(`/class/${selectedCharacter.class.slug}`)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={filterType === "classes" ? "Buscar classe..." : "Buscar itens..."}
            className="input-rpg pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {types.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                filterType === type
                  ? "bg-purple-600 text-white"
                  : "bg-dark-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {ownedEnchants.filter((ue) => ue.quantity > 0).length > 0 && (
        <div className="panel p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-yellow-400 mb-2 flex items-center gap-1.5">
            <Sparkles size={13} /> Seus encantamentos
          </p>
          <p className="text-[11px] text-gray-600 mb-2">Selecione um encantamento e depois escolha a arma/armadura/elmo/capa para aplicar.</p>
          <div className="flex flex-wrap gap-2">
            {ownedEnchants.filter((ue) => ue.quantity > 0).map((ue) => (
              <button
                key={ue.id}
                onClick={() => setEnchantPick(ue)}
                className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 rounded-lg px-2.5 py-1.5 text-left transition-colors border border-dark-600 hover:border-purple-500/40"
              >
                {ue.enchantment.icon ? (
                  <EntityIcon src={ue.enchantment.icon} size={14} className="text-yellow-400" imgClassName="w-4 h-4 object-contain" />
                ) : (
                  <Sparkles size={14} className="text-yellow-400" />
                )}
                <span className="text-xs font-medium">{ue.enchantment.name}</span>
                {ue.enchantment.level > 1 && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Nv. {ue.enchantment.level}</span>
                )}
                <span className="text-[10px] text-gray-400">x{ue.quantity}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filterType === "classes" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {unlockedClasses
            .filter((cp: any) => !search || (cp.gameClass?.name || "").toLowerCase().includes(search.toLowerCase()))
            .map((cp: any) => {
              const gc = cp.gameClass || {};
              const equipped = !!cp.isActive;
              return (
                <div key={cp.id} className={`bg-dark-800/50 rounded-xl p-3 border ${equipped ? "border-purple-500/40" : "border-dark-600"}`}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium text-sm text-white">{gc.name}</p>
                    {equipped && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300">Equipada</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300 capitalize">{gc.role || "-"}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-700 text-gray-300 capitalize">{gc.combatType || "-"}</span>
                    {gc.price > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-300">{gc.price} gold</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">Rank {cp.rank ?? 1}</span>
                    {!equipped && (
                      <button
                        onClick={() => handleSwitchClass(gc)}
                        disabled={switchingClass !== null}
                        className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {switchingClass === gc.id ? "Trocando..." : "Equipar"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(inv => (
          <button
            key={inv.id}
            onClick={() => setSelectedItem(inv)}
            className={`card-hover text-left relative border-rarity-${inv.item.rarity || "common"} border`}
          >
            {inv.isEquipped && (
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded font-bold">
                EQUIPPED
              </div>
            )}
            {inv.item.enchantment && (
              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 text-[10px] rounded font-bold flex items-center gap-1">
                {inv.item.enchantment.icon ? (
                  <EntityIcon src={inv.item.enchantment.icon} size={10} className="text-yellow-400" imgClassName="w-3 h-3 object-contain" />
                ) : (
                  <Sparkles size={10} />
                )} {inv.item.enchantment.name}
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br ${
                inv.item.rarity === "rare" ? "from-blue-600 to-purple-600" :
                inv.item.rarity === "epic" ? "from-purple-600 to-pink-600" :
                inv.item.rarity === "legendary" ? "from-orange-500 to-yellow-500" :
                inv.item.rarity === "mythic" ? "from-red-500 to-purple-600" :
                "from-dark-600 to-dark-500"
              } flex items-center justify-center`}>
                {inv.item.icon ? (
                  <EntityIcon src={inv.item.icon} className="text-white/80" imgClassName="w-full h-full object-contain" />
                ) : (
                  <Star size={22} className="text-white/80" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{inv.item.name}</p>
                <p className={`text-xs capitalize text-rarity-${inv.item.rarity || "common"}`}>
                  {inv.item.rarity} • Rank {inv.item.rank}
                </p>
                <p className="text-xs text-gray-500 capitalize">{inv.item.type} {inv.item.level > 1 ? `• Lv.${inv.item.level}` : ""}</p>
                {inv.item.type === "weapon" && (
                  <p className="text-[11px] text-orange-300/90">
                    DPS {Number(inv.item.dps || 0).toLocaleString()} · {Number(inv.item.attackSpeedMs) > 0 ? `${(Number(inv.item.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s"}
                  </p>
                )}
                {inv.quantity > 1 && (
                  <p className="text-xs text-gray-500">x{inv.quantity}</p>
                )}
              </div>
            </div>
          </button>
        ))}
        </div>
      )}

      {filterType !== "classes" && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Backpack size={48} className="mx-auto mb-3 opacity-50" />
          <p>No items found</p>
        </div>
      )}

      {filterType === "classes" && unlockedClasses.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Swords size={48} className="mx-auto mb-3 opacity-50" />
          <p>Nenhuma classe desbloqueada ainda — resgate um código ou compre na loja.</p>
        </div>
      )}

      {selectedItem &&
        createPortal(
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto" onClick={() => setSelectedItem(null)}>
            <div className="panel p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-4 mb-4">
              <div className={`w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br ${
                selectedItem.item.rarity === "rare" ? "from-blue-600 to-purple-600" :
                selectedItem.item.rarity === "epic" ? "from-purple-600 to-pink-600" :
                selectedItem.item.rarity === "legendary" ? "from-orange-500 to-yellow-500" :
                "from-dark-600 to-dark-500"
              } flex items-center justify-center`}>
                {selectedItem.item.icon ? (
                  <EntityIcon src={selectedItem.item.icon} className="text-white/80" imgClassName="w-full h-full object-contain p-0.5" />
                ) : (
                  <Star size={32} className="text-white/80" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-display font-bold">{selectedItem.item.name}</h3>
                <p className={`text-sm capitalize text-rarity-${selectedItem.item.rarity || "common"}`}>
                  {selectedItem.item.rarity} • Rank {selectedItem.item.rank} • {selectedItem.item.type}
                </p>
                <p className="text-sm text-gray-400 mt-1">{selectedItem.item.description}</p>
                {Number(selectedItem.item.sellPrice) > 0 && (
                  <p className="text-xs text-yellow-300/90 mt-1.5 flex items-center gap-1">
                    <Coins size={12} /> Valor: {selectedItem.item.sellPrice}G
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>

            {selectedItem.item.type !== "consumable" && (
              <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-2">Core Stats</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {CORE_STAT_LABELS.map(({ key, label, color }) => {
                    const ench = selectedItem.item.enchantment;
                    const enchStats = ench ? effectiveEnchantmentStats(ench) : null;
                    const value = enchStats ? enchStats[key] : ((selectedItem.item as any)[key] ?? 0);
                    if (!value) return null;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className={`text-gray-400 ${color}`}>{label}</span>
                        <span className="font-mono text-green-400">
                          +{value}
                          {ench && <span className="text-yellow-400 text-xs"> (enc.)</span>}
                        </span>
                      </div>
                    );
                  })}
                  {selectedItem.item.type === "weapon" && (
                    <div className="col-span-2 border-t border-dark-600 pt-1.5 mt-1 flex items-center justify-between">
                      <span className="text-orange-300/90">DPS</span>
                      <span className="font-mono text-orange-300">{Number(selectedItem.item.dps || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedItem.item.type === "weapon" && (
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-orange-300/90">Velocidade</span>
                      <span className="font-mono text-orange-300">
                        {Number(selectedItem.item.attackSpeedMs) > 0 ? `${(Number(selectedItem.item.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s"}
                      </span>
                    </div>
                  )}
                  {selectedItem.item.boostType && (
                    <div className="col-span-2 border-t border-dark-600 pt-1.5 mt-1 flex items-center justify-between">
                      <span className="text-purple-300/90">Bonus (Anel/Colar do Gacha)</span>
                      <span className="font-mono text-purple-300">
                        {GACHA_BOOST_LABELS[selectedItem.item.boostType] ?? selectedItem.item.boostType} +{selectedItem.item.boostValue}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedItem.item.type !== "consumable" && (
              <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-yellow-400" /> Encantamento
                </p>
                <p className="text-[11px] text-gray-600 mb-2">Ao encantar, os core stats do encantamento substituem os do item.</p>
                {selectedItem.item.enchantment ? (
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-yellow-300">
                        {selectedItem.item.enchantment.name}
                        {selectedItem.item.enchantment.level > 1 && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400">Nv. {selectedItem.item.enchantment.level}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{selectedItem.item.enchantment.description}</p>
                    </div>
                    <button
                      onClick={handleRemoveEnchant}
                      disabled={enchantBusy}
                      className="text-xs text-red-400 hover:text-red-300 shrink-0 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mb-2">Nenhum encantamento equipado.</p>
                )}
                {compatibleEnchants(selectedItem).length > 0 && (
                  <div className="space-y-2">
                    {compatibleEnchants(selectedItem).map((ue) => (
                      <div key={ue.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm">{ue.enchantment.name} <span className="text-gray-500 text-xs">x{ue.quantity}</span></p>
                          <p className="text-[11px] text-gray-500">
                            {ue.enchantment.level > 1 ? `Requer jogador Nv. ${ue.enchantment.level} • ` : ""}
                            {(() => {
                              const stats = effectiveEnchantmentStats(ue.enchantment);
                              return CORE_STAT_LABELS.map(({ key, label }) =>
                                stats[key] ? `${label} +${stats[key]}` : null
                              ).filter(Boolean).join(" • ");
                            })()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleApplyEnchant(ue.enchantment.id)}
                          disabled={enchantBusy}
                          className="btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-50"
                        >
                          {enchantBusy ? "Aplicando..." : selectedItem.item.enchantment ? "Trocar" : "Aplicar"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {compatibleEnchants(selectedItem).length === 0 && !selectedItem.item.enchantment && (
                  <p className="text-[11px] text-gray-600">Nenhum encantamento compatível na sua mochila.</p>
                )}
              </div>
            )}

            {selectedItem.recipe && (
              <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-orange-400" /> Receita de Craft
                </p>
                <p className="text-sm font-medium text-orange-300">{selectedItem.recipe.name}</p>
                {selectedItem.recipe.description && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{selectedItem.recipe.description}</p>
                )}

                <div className="mt-2 space-y-1">
                  {selectedItem.recipe.ingredients.map((ing) => {
                    const have = ownedCount(ing.itemName);
                    const ok = have >= ing.quantity;
                    return (
                      <div key={ing.itemName} className="flex items-center justify-between text-xs">
                        <span className={ok ? "text-gray-300" : "text-red-400"}>{ing.itemName}</span>
                        <span className={`font-mono ${ok ? "text-green-400" : "text-red-400"}`}>{have} / {ing.quantity}</span>
                      </div>
                    );
                  })}
                  {selectedItem.recipe.goldCost > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-yellow-300 flex items-center gap-1"><Coins size={11} /> Ouro</span>
                      <span className={`font-mono ${Number(user?.gold) >= selectedItem.recipe.goldCost ? "text-green-400" : "text-red-400"}`}>
                        {Number(user?.gold ?? 0).toLocaleString("pt-BR")} / {selectedItem.recipe.goldCost.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleCraft(selectedItem.recipe!.id)}
                  disabled={crafting}
                  className="mt-3 w-full btn-primary text-sm disabled:opacity-50"
                >
                  {crafting ? "Craftando..." : `Craftar (${selectedItem.recipe.resultQuantity}x ${selectedItem.item.name})`}
                </button>
              </div>
            )}

            {listing ? (
              <div className="bg-dark-800/50 rounded-lg p-3 mb-4 space-y-3">
                <p className="text-xs text-gray-400">Anunciar no mercado</p>
                <input
                  type="number"
                  min={1}
                  value={listPrice || ""}
                  onChange={e => setListPrice(parseInt(e.target.value) || 0)}
                  placeholder="Preço (ouro)"
                  className="input-rpg"
                />
                {selectedItem.quantity > 1 && (
                  <input
                    type="number"
                    min={1}
                    max={selectedItem.quantity}
                    value={listQty}
                    onChange={e => setListQty(Math.min(selectedItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                    placeholder={`Quantidade (máx. ${selectedItem.quantity})`}
                    className="input-rpg"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleList}
                    disabled={selling || listPrice <= 0}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {selling ? "Anunciando..." : "Confirmar anúncio"}
                  </button>
                  <button onClick={() => setListing(false)} className="btn-secondary">Voltar</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {selectedItem.item.type !== "consumable" && (
                  selectedItem.isEquipped ? (
                    <button onClick={() => handleUnequip(selectedItem)} disabled={selling} className="btn-secondary flex-1 disabled:opacity-50">
                      {selling ? "..." : "Desequipar"}
                    </button>
                  ) : (
                    <button onClick={() => handleEquip(selectedItem)} disabled={selling} className="btn-primary flex-1 disabled:opacity-50">
                      {selling ? "Equipando..." : "Equipar"}
                    </button>
                  )
                )}
                <button
                  onClick={handleSellNow}
                  disabled={selling || !selectedItem.item.isSellable}
                  title={selectedItem.item.isSellable ? undefined : "Item não pode ser vendido"}
                  className="btn-secondary flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Coins size={14} /> {selling ? "Vendendo..." : `Vender (${selectedItem.item.sellPrice}G)`}
                </button>
              </div>
            )}

            {!listing && selectedItem.item.isTradable && (
              <button
                onClick={() => {
                  setListPrice(selectedItem.item.sellPrice * 3 || 1);
                  setListQty(1);
                  setListing(true);
                }}
                className="mt-2 w-full text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                Anunciar no mercado
              </button>
            )}
          </div>
          </div>,
          document.body
        )}

      {enchantPick && (
        <EnchantItemPicker
          enchantment={enchantPick.enchantment}
          items={items}
          playerLevel={user?.level}
          busyId={applyingInvId}
          onApply={handleEnchantPickApply}
          onKeep={() => setEnchantPick(null)}
          onClose={() => setEnchantPick(null)}
        />
      )}
    </div>
  );
}