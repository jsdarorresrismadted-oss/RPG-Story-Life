import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { mapsApi, npcApi, questsApi, raidApi, craftApi, authApi, gachaApi } from "../services/api";
import { Map as MapType } from "../types";
import { getSocket } from "../services/socket";
import {
  ArrowLeft, Skull, Store, ScrollText, Navigation, Shield, Map as MapIcon,
  X, ShoppingBag, CheckCircle2, Clock, Gift, Lock, Swords, Hammer, Crown, Sparkles,
  Dices, Ticket, Gem,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { effectiveEnchantmentStats } from "../lib/enchantmentStats";
import { EntityIcon } from "../components/EntityIcon";

const ENCH_STAT_LABELS: { key: string; label: string }[] = [
  { key: "strength", label: "Força" },
  { key: "intellect", label: "Intelecto" },
  { key: "endurance", label: "Vigor" },
  { key: "dexterity", label: "Destreza" },
  { key: "wisdom", label: "Sabedoria" },
  { key: "luck", label: "Sorte" },
];

const RARITY_CLASSES: Record<string, string> = {
  common: "bg-gray-500/15 text-gray-300",
  uncommon: "bg-green-500/15 text-green-300",
  rare: "bg-blue-500/15 text-blue-300",
  epic: "bg-purple-500/15 text-purple-300",
  legendary: "bg-orange-500/15 text-orange-300",
  mythic: "bg-red-500/15 text-red-300",
};

interface NpcDetail {
  id: string;
  name: string;
  type: string;
  shopItems?: { id: string; price: string | number; currency?: string; itemId?: string | null; enchantmentId?: string | null; classId?: string | null; requiredLevel?: number; requiredVip?: boolean; requiredQuestIds?: string | null; class?: { id: string; name: string; slug: string; description: string; icon?: string | null; role: string; requiredLevel: number; requiredVip: boolean; price: string | number } | null; item: { id: string; name: string; description: string; type: string; rarity: string; icon?: string | null; attackSpeedMs?: number; dps?: number; requiredVip?: boolean } | null; enchantment?: { name: string; slug: string; description: string; icon?: string | null; requiredVip?: boolean; level?: number; rarity?: string; category?: string; strength?: number; intellect?: number; endurance?: number; dexterity?: number; wisdom?: number; luck?: number; computedStats?: Record<string, number> } | null }[];
  quests?: { id: string; title: string; description: string; requiredLevel: number; requiredRank: number; requiredQuestIds?: string | null; xpReward: string | number; goldReward: string | number }[];
}

interface QuestProgressEntry {
  questId: string;
  status: "active" | "completed" | "claimed";
}

interface RaidStatusEntry {
  map: MapType;
  attemptsUsed: number;
  maxAttempts: number;
  resetsInMs: number;
}

interface CraftResultItem {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  type?: string;
  rarity?: string;
  level?: number;
  dps?: number;
  attackSpeedMs?: number;
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
}

interface CraftRecipe {
  id: string;
  name: string;
  description: string;
  resultItemId: string;
  resultQuantity: number;
  requiredLevel: number;
  requiredQuestIds?: string | null;
  ingredients: string;
  isActive: boolean;
  resultItem?: CraftResultItem | null;
}

interface GachaBooster {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  type: "ring" | "necklace";
  rarity: string;
  boostType: string;
  boostValue: number;
}

interface OwnedBooster {
  id: string;
  quantity: number;
  equipped: boolean;
  booster: GachaBooster;
}

interface GachaData {
  npc: { id: string; name: string; description: string; type: string };
  config: { id: string; freeTickets: number; ticketCost: number; chances: Record<string, number>; slotChances?: Record<string, number>; active: boolean } | null;
  tickets: number;
  gold: number;
  catalog: GachaBooster[];
  owned: OwnedBooster[];
  rarityLabels: Record<string, string>;
}

interface GachaRollResult {
  rarity: string;
  rarityLabel: string;
  booster: GachaBooster;
  ticketsLeft: number;
}

const GACHA_TYPES = new Set(["gacha"]);

function isGachaNpc(type?: string | null) {
  return !!type && GACHA_TYPES.has(type);
}

const BOOST_LABELS: Record<string, string> = {
  defense: "Defesa",
  damage: "Dano Geral",
  dropChance: "Chance de Drop",
  xp: "XP",
  gold: "Ouro",
  classXp: "XP de Classe",
};

const BOOSTER_RARITY_BADGE: Record<string, string> = {
  common: "bg-gray-600/30 text-gray-300",
  uncommon: "bg-green-600/30 text-green-300",
  rare: "bg-blue-600/30 text-blue-300",
  epic: "bg-purple-600/30 text-purple-300",
  legendary: "bg-yellow-600/30 text-yellow-300",
  mythic: "bg-red-600/30 text-red-300",
};

function parseIngredients(raw: string): { itemName: string; quantity: number }[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatRaidReset(ms: number): string {
  if (ms <= 0) return "pronto";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function parseQuestIdList(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x: unknown) => String(x)).filter(Boolean);
  } catch {
    /* não é JSON — tenta formato separado por vírgula */
  }
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
}

const SHOP_TYPES = new Set(["vendor", "shop", "enchantments", "classes"]);
const QUEST_TYPES = new Set(["quest_giver", "quest"]);
const ENCHANT_NPC_TYPES = new Set(["enchantments"]);
const CLASS_NPC_TYPES = new Set(["classes"]);

function isShopNpc(type?: string | null) {
  return !!type && SHOP_TYPES.has(type);
}

function isEnchantNpc(type?: string | null) {
  return !!type && ENCHANT_NPC_TYPES.has(type);
}

function isClassNpc(type?: string | null) {
  return !!type && CLASS_NPC_TYPES.has(type);
}

function isQuestNpc(type?: string | null) {
  return !!type && QUEST_TYPES.has(type);
}

export function MapPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, setUser } = useAuthStore();
  const [map, setMap] = useState<MapType | null>(null);
  const [maps, setMaps] = useState<MapType[]>([]);
  const [raidStatus, setRaidStatus] = useState<Record<string, RaidStatusEntry>>({});
  const [loading, setLoading] = useState(true);
  const [npc, setNpc] = useState<NpcDetail | null>(null);
  const [npcLoading, setNpcLoading] = useState(false);
  const [questProgress, setQuestProgress] = useState<QuestProgressEntry[]>([]);
  const [buyingItemId, setBuyingItemId] = useState<string | null>(null);
  const [crafts, setCrafts] = useState<CraftRecipe[]>([]);
  const [craftingId, setCraftingId] = useState<string | null>(null);
  const [vendorTab, setVendorTab] = useState<"items" | "enchantments" | "crafts">("items");
  const [enchantCategory, setEnchantCategory] = useState<string>("all");
  const [enchantMaxLevel, setEnchantMaxLevel] = useState<number>(10);
  const [gachaData, setGachaData] = useState<GachaData | null>(null);
  const [gachaLoading, setGachaLoading] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [buyingTicket, setBuyingTicket] = useState(false);
  const [lastRoll, setLastRoll] = useState<GachaRollResult | null>(null);

  const doneQuests = new Set(
    questProgress.filter((q) => q.status === "completed" || q.status === "claimed").map((q) => q.questId)
  );
  const vipActive = !!user?.vipUntil && new Date(user.vipUntil).getTime() > Date.now();

  const shopTabs = (offers: { enchantmentId?: string | null }[]): Array<"items" | "enchantments" | "crafts"> => {
    const tabs: Array<"items" | "enchantments" | "crafts"> = [];
    if ((offers ?? []).some((o) => !o.enchantmentId)) tabs.push("items");
    if ((offers ?? []).some((o) => !!o.enchantmentId)) tabs.push("enchantments");
    if (crafts.length > 0) tabs.push("crafts");
    return tabs;
  };

  const refreshUser = async () => {
    try {
      const { data } = await authApi.me();
      if (data.user) setUser(data.user);
    } catch { /* ignore */ }
  };

  const loadCrafts = () => {
    craftApi.list().then(({ data }) => {
      if (Array.isArray(data)) setCrafts(data);
    }).catch(() => {});
  };

  useEffect(() => {
    loadCrafts();
  }, []);

  const craftItem = async (recipe: CraftRecipe) => {
    setCraftingId(recipe.id);
    try {
      const { data } = await craftApi.craft(recipe.id);
      toast.success(data.message || "Craftado!");
      loadCrafts();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Falha ao craftar.");
    } finally {
      setCraftingId(null);
    }
  };

  useEffect(() => {
    raidApi.status().then(({ data }) => {
      if (Array.isArray(data)) {
        const mapById: Record<string, RaidStatusEntry> = {};
        for (const entry of data) mapById[entry.map.id] = entry;
        setRaidStatus(mapById);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) {
      setLoading(true);
      mapsApi.list()
        .then(({ data }) => setMaps(data))
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    mapsApi.get(slug).then(({ data }) => {
      setMap(data);
      const socket = getSocket();
      if (socket) socket.emit("map:join", data.id);
    }).catch(() => {}).finally(() => setLoading(false));

    return () => {
      const socket = getSocket();
      if (socket) socket.emit("map:leave");
    };
  }, [slug]);

  useEffect(() => {
    questsApi.progress().then(({ data }) => {
      if (Array.isArray(data)) setQuestProgress(data);
    }).catch(() => {});
  }, [npc]);

  const openNpc = async (npcId: string) => {
    setNpcLoading(true);
    setNpc(null);
    setVendorTab("items");
    setLastRoll(null);
    setGachaData(null);
    setEnchantCategory("all");
    setEnchantMaxLevel(10);
    try {
      const { data } = await npcApi.get(npcId);
      setNpc(data);
      if (isGachaNpc(data.type)) loadGacha(npcId);
      if (isShopNpc(data.type) && !isEnchantNpc(data.type) && !isClassNpc(data.type)) {
        const offers = data.shopItems ?? [];
        const tabs = shopTabs(offers);
        if (tabs.length > 0) setVendorTab(tabs[0]);
      }
    } catch {
      toast.error("Failed to load NPC");
    } finally {
      setNpcLoading(false);
    }
  };

  const loadGacha = async (npcId: string) => {
    setGachaLoading(true);
    try {
      const { data } = await gachaApi.info(npcId);
      setGachaData(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao carregar o gacha.");
    } finally {
      setGachaLoading(false);
    }
  };

  const rollGacha = async () => {
    if (!npc) return;
    setRolling(true);
    try {
      const { data } = await gachaApi.roll(npc.id);
      setLastRoll(data);
      if (gachaData) setGachaData({ ...gachaData, tickets: data.ticketsLeft });
      loadGacha(npc.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha na rolagem.");
    } finally {
      setRolling(false);
    }
  };

  const buyTicket = async () => {
    if (!npc) return;
    setBuyingTicket(true);
    try {
      const { data } = await gachaApi.buyTicket(npc.id);
      toast.success(`Ticket comprado por ${data.cost} gold.`);
      loadGacha(npc.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao comprar ticket.");
    } finally {
      setBuyingTicket(false);
    }
  };

  const toggleBooster = async (owned: OwnedBooster) => {
    try {
      if (owned.equipped) {
        await gachaApi.unequip(owned.id);
      } else {
        await gachaApi.equip(owned.id);
      }
      if (npc) loadGacha(npc.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao equipar booster.");
    }
  };

  const buyItem = async (offer: { item?: { id: string } | null; enchantment?: { name: string } | null; enchantmentId?: string | null; itemId?: string | null; classId?: string | null; class?: { name: string } | null; price: string | number; currency?: string }) => {
    if (!npc) return;
    const isEnchantment = !!offer.enchantmentId;
    const isClass = !!offer.classId && !offer.itemId && !offer.enchantmentId;
    setBuyingItemId(isEnchantment ? offer.enchantmentId! : isClass ? offer.classId! : offer.itemId!);
    try {
      const payload = isEnchantment
        ? { enchantmentId: offer.enchantmentId!, quantity: 1 }
        : isClass
          ? { classId: offer.classId!, quantity: 1 }
          : { itemId: offer.itemId!, quantity: 1 };
      const { data } = await npcApi.buy(npc.id, payload);
      const currency = data.currency === "diamond" ? "diamantes" : "gold";
      toast.success(isClass ? `Classe ${data.item} desbloqueada e equipada!` : `${data.quantity}x ${data.item} comprado (${data.totalPrice} ${currency})`);
      if (currency === "diamantes") refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha na compra");
    } finally {
      setBuyingItemId(null);
    }
  };

  const acceptQuest = async (questId: string) => {
    try {
      await questsApi.accept(questId);
      toast.success("Quest aceita!");
      const { data } = await questsApi.progress();
      if (Array.isArray(data)) setQuestProgress(data);
      window.dispatchEvent(new Event("quests-changed"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to accept quest");
    }
  };

  const claimQuest = async (questId: string) => {
    try {
      const { data } = await questsApi.claim(questId);
      let msg = `Recompensa resgatada! +${data.xpGain ?? 0} XP, +${data.goldGain ?? 0} gold`;
      if (Array.isArray(data.items) && data.items.length > 0) {
        msg += ` • Itens: ${data.items.map((it: { itemName: string; quantity: number }) => `${it.quantity}x ${it.itemName}`).join(", ")}`;
      }
      toast.success(msg, { duration: 5000 });
      const { data: prog } = await questsApi.progress();
      if (Array.isArray(prog)) setQuestProgress(prog);
      window.dispatchEvent(new Event("quests-changed"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to claim rewards");
    }
  };

  const questStatus = (questId: string) => questProgress.find((p) => p.questId === questId)?.status;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!slug) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <MapIcon size={22} className="text-purple-400" /> Mapa Mundi
          </h1>
          <p className="text-sm text-gray-400 mt-1">Escolha um local para explorar.</p>
        </div>
        {maps.length === 0 && <p className="text-gray-500 text-sm">Nenhum mapa disponível.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {maps.map((m) => {
            const raid = raidStatus[m.id];
            const isRaid = m.type === "raid";
            return (
              <Link key={m.id} to={`/map/${m.slug}`} className="card-hover block p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-lg">{m.name}</h3>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isRaid && (
                      <span className="text-[10px] px-2 py-0.5 bg-red-500/15 text-red-400 rounded-md font-bold tracking-wider flex items-center gap-1">
                        <Swords size={10} /> RAID
                      </span>
                    )}
                    <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-md whitespace-nowrap">Lv.{m.requiredLevel}+</span>
                  </div>
                </div>
                {isRaid && raid && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-red-400">Tentativas: {raid.attemptsUsed}/{raid.maxAttempts}</span>
                    <span className="text-gray-500">• Reset em {formatRaidReset(raid.resetsInMs)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-dark-700 rounded-md capitalize">{m.region}</span>
                  <span className="flex items-center gap-1"><Skull size={12} /> {m.monsters?.length || 0} monstros</span>
                  <span className="flex items-center gap-1"><ScrollText size={12} /> {m.npcs?.length || 0} NPCs</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  if (!map) return <div className="text-center py-12 text-gray-400">Map not found</div>;

  const raid = raidStatus[map.id];
  const isRaid = map.type === "raid";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/map" className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            {map.name}
            {isRaid && (
              <span className="text-[10px] px-2 py-0.5 bg-red-500/15 text-red-400 rounded-md font-bold tracking-wider flex items-center gap-1">
                <Swords size={10} /> RAID
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400">{map.description}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs px-2 py-1 bg-dark-700 rounded-md">{map.region}</span>
          <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-md">Lv.{map.requiredLevel}+</span>
        </div>
      </div>

      {isRaid && (
        <div className={`panel p-4 border ${raid && raid.attemptsUsed >= raid.maxAttempts ? "border-red-500/40 bg-red-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Swords size={18} className="text-red-400" />
              <p className="font-display font-semibold text-sm">Tentativas de raid</p>
            </div>
            {raid ? (
              <>
                <span className="text-sm text-red-300 font-mono">
                  {raid.attemptsUsed} / {raid.maxAttempts} usadas
                </span>
                <span className="text-xs text-gray-400">
                  Reset em <span className="text-purple-300 font-mono">{formatRaidReset(raid.resetsInMs)}</span>
                </span>
                {raid.attemptsUsed >= raid.maxAttempts && (
                  <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded-md">
                    Tentativas esgotadas — volte após o reset!
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-500">Status indisponível</span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-4">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Skull size={16} className="text-red-400" /> Monsters
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {map.monsters?.map((mm) => (
                <Link
                  key={mm.id}
                  to={`/combat/${mm.monster.id}`}
                  className="card-hover flex items-center gap-3"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    mm.monster.isBoss ? "bg-red-500/20" : mm.monster.isElite ? "bg-yellow-500/20" : "bg-dark-700"
                  }`}>
                    <Skull size={20} className={mm.monster.isBoss ? "text-red-400" : mm.monster.isElite ? "text-yellow-400" : "text-gray-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{mm.monster.name}</p>
                    <p className="text-xs text-gray-500">
                      Lv.{mm.monster.level} • {mm.monster.element} • HP: {mm.monster.hp}
                    </p>
                  </div>
                  {mm.monster.isBoss && <span className="text-xs text-red-400 font-bold">BOSS</span>}
                </Link>
              ))}
              {(!map.monsters || map.monsters.length === 0) && (
                <p className="text-gray-500 text-sm col-span-2 py-4 text-center">No monsters in this area</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Store size={16} className="text-cyan-400" /> NPCs
            </h2>
            <div className="space-y-2">
              {map.npcs?.map((mn) => (
                <button
                  key={mn.id}
                  onClick={() => openNpc(mn.npc.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-dark-700/50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center">
                    {isEnchantNpc(mn.npc.type) ? <Sparkles size={16} className="text-purple-400" /> :
                     isClassNpc(mn.npc.type) ? <Swords size={16} className="text-orange-400" /> :
                     isShopNpc(mn.npc.type) ? <Store size={16} className="text-cyan-400" /> :
                     isQuestNpc(mn.npc.type) ? <ScrollText size={16} className="text-green-400" /> :
                     isGachaNpc(mn.npc.type) ? <Dices size={16} className="text-yellow-400" /> :
                     <Shield size={16} className="text-purple-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{mn.npc.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{mn.npc.type?.replace("_", " ")}</p>
                  </div>
                </button>
              ))}
              {(!map.npcs || map.npcs.length === 0) && (
                <p className="text-gray-500 text-sm py-2">Nenhum NPC nesta área.</p>
              )}
            </div>
          </div>

          <div className="panel p-4">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Navigation size={16} className="text-purple-400" /> Connections
            </h2>
            <div className="space-y-2">
              {map.connections?.map((conn) => (
                <Link
                  key={conn.id}
                  to={`/map/${conn.toMap.slug}`}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-700/50 transition-colors text-sm"
                >
                  <ArrowLeft size={14} className="text-gray-500" />
                  <span>{conn.toMap.name}</span>
                  {conn.requiredLevel > 1 && (
                    <span className="text-xs text-yellow-500 ml-auto">Lv.{conn.requiredLevel}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* NPC modal */}
      {npc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setNpc(null)}>
          <div className="panel w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display font-bold text-lg">{npc.name}</h2>
                <p className="text-xs text-gray-500 capitalize">{npc.type?.replace("_", " ")}</p>
              </div>
              <button onClick={() => setNpc(null)} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {isShopNpc(npc.type) && (
              <div className="space-y-2">
                {!isEnchantNpc(npc.type) && !isClassNpc(npc.type) && (() => {
                  const tabs = ([
                    { key: "items", label: "Itens", icon: ShoppingBag, count: npc.shopItems?.filter((o) => !o.enchantmentId).length ?? 0 },
                    { key: "enchantments", label: "Encantamentos", icon: Sparkles, count: npc.shopItems?.filter((o) => !!o.enchantmentId).length ?? 0 },
                    { key: "crafts", label: "Craftar", icon: Hammer, count: crafts.length },
                  ] as const).filter((t) => t.count > 0);
                  if (tabs.length === 0) return null;
                  return (
                    <div className="flex gap-2 flex-wrap border-b border-dark-700 pb-2">
                      {tabs.map((t) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.key}
                            onClick={() => setVendorTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              vendorTab === t.key
                                ? "bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/40 text-white"
                                : "bg-dark-800 border border-dark-600 text-gray-400 hover:text-white"
                            }`}
                          >
                            <Icon size={14} /> {t.label}
                            {t.count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400">{t.count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {(vendorTab === "items" || vendorTab === "enchantments") && (() => {
                  const isEnchView = isEnchantNpc(npc.type) || vendorTab === "enchantments";
                  const offers = (npc.shopItems ?? []).filter((o) =>
                    isEnchView ? !!o.enchantmentId : !o.enchantmentId
                  ).filter((o) => {
                    if (!isEnchView) return true;
                    if (enchantCategory !== "all" && o.enchantment?.category !== enchantCategory) return false;
                    if ((o.enchantment?.level ?? 1) > enchantMaxLevel) return false;
                    return true;
                  });
                  return (
                    <>
                    {isEnchView && (
                      <div className="mb-3 space-y-2">
                        <div className="flex gap-2 flex-wrap">
                          {(["all", "strength", "intellect", "endurance", "dexterity", "wisdom", "luck"] as const).map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setEnchantCategory(cat)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                                enchantCategory === cat
                                  ? "bg-purple-600 text-white"
                                  : "bg-dark-800 border border-dark-600 text-gray-400 hover:text-white"
                              }`}
                            >
                              {cat === "all" ? "Todas" : cat === "strength" ? "Força" : cat === "intellect" ? "Intelecto" : cat === "endurance" ? "Vigor" : cat === "dexterity" ? "Destreza" : cat === "wisdom" ? "Sabedoria" : "Sorte"}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-[11px] text-gray-500">Níveis:</label>
                          <select
                            value={enchantMaxLevel}
                            onChange={(e) => setEnchantMaxLevel(Number(e.target.value))}
                            className="input-rpg !py-1 !px-2 !text-xs w-28"
                          >
                            {[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((lv) => (
                              <option key={lv} value={lv}>até Nv. {lv}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-gray-600">O mesmo encantamento vale para arma, armadura, capa e elmo — anéis/colares não encantam.</span>
                        </div>
                      </div>
                    )}
                    {offers.length > 0 ? (
                      <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                      {offers.map((offer) => {
                      const isEnchantment = !!offer.enchantmentId;
                      const label = isEnchantment ? offer.enchantment?.name ?? "Encantamento" : offer.item?.name ?? "-";
                      const description = isEnchantment ? offer.enchantment?.description ?? "" : offer.item?.description ?? "";
                      const questIds = parseQuestIdList(offer.requiredQuestIds);
                      const questLocked = questIds.length > 0 && !questIds.every((id) => doneQuests.has(id));
                      const requiresVip = offer.requiredVip || offer.item?.requiredVip || offer.enchantment?.requiredVip;
                      const vipLocked = !!requiresVip && !vipActive;
                      const locked = questLocked || vipLocked;
                      return (
                        <div key={offer.id} className="card p-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden ${isEnchantment ? "bg-purple-500/20" : "bg-dark-700"}`}>
                            {isEnchantment ? (
                              offer.enchantment?.icon ? (
                                <EntityIcon src={offer.enchantment.icon} size={16} className="text-purple-400" imgClassName="w-full h-full object-contain p-0.5" />
                              ) : (
                                <ShoppingBag size={16} className="text-purple-400" />
                              )
                            ) : offer.item?.icon ? (
                              <EntityIcon src={offer.item.icon} size={16} className="text-cyan-400" imgClassName="w-full h-full object-contain" />
                            ) : (
                              <ShoppingBag size={16} className="text-cyan-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {label}
                              {isEnchantment && <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 align-middle">encantamento</span>}
                            </p>
                            <p className="text-[11px] text-gray-500 line-clamp-1">{description}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {!isEnchantment && offer.item?.type === "weapon" && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-300 rounded-md">
                                  DPS {Number(offer.item.dps || 0).toLocaleString()} · {Number(offer.item.attackSpeedMs) > 0 ? `${(Number(offer.item.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s"}
                                </span>
                              )}
                              {offer.item?.requiredVip && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md flex items-center gap-1">
                                  <Crown size={9} /> VIP
                                </span>
                              )}
                              {isEnchantment && offer.enchantment?.level && offer.enchantment.level > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded-md">
                                  Nv. {offer.enchantment.level}
                                </span>
                              )}
                              {isEnchantment && offer.enchantment && (() => {
                                const stats = effectiveEnchantmentStats(offer.enchantment);
                                return (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-300/90 rounded-md">
                                    {ENCH_STAT_LABELS.map(({ key, label }) => `${label} +${stats[key]}`).join(" · ")}
                                  </span>
                                );
                              })()}
                              {offer.enchantment?.requiredVip && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md flex items-center gap-1">
                                  <Crown size={9} /> VIP
                                </span>
                              )}
                              {offer.requiredVip && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md flex items-center gap-1">
                                  <Crown size={9} /> VIP
                                </span>
                              )}
                              {questLocked && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/15 text-sky-300 rounded-md flex items-center gap-1">
                                  <Lock size={9} /> Quest
                                </span>
                              )}
                              {offer.class && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded-md flex items-center gap-1">
                                  <Shield size={9} /> Classe: {offer.class.name}
                                </span>
                              )}
                              {Number(offer.requiredLevel) > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                                  Nv. {offer.requiredLevel}+
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-yellow-400">
                              {Number(offer.price).toLocaleString()} {offer.currency === "diamond" ? "💎" : "gold"}
                            </p>
                            {offer.currency === "diamond" && (
                              <p className="text-[10px] text-cyan-400/80">diamantes</p>
                            )}
                            <button
                              onClick={() => buyItem(offer)}
                              disabled={buyingItemId === (isEnchantment ? offer.enchantmentId : offer.itemId) || locked}
                              className="btn-secondary text-xs px-3 py-1 mt-1 disabled:opacity-50"
                              title={locked ? (questLocked ? "Requer concluir uma quest" : "Requer VIP") : undefined}
                            >
                              {buyingItemId === (isEnchantment ? offer.enchantmentId : offer.itemId) ? "..." : locked ? (questLocked ? "Quest bloqueada" : "VIP") : "Comprar"}
                            </button>
                          </div>
                        </div>
                      );
                      })}
                      </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {(isEnchantNpc(npc.type) || vendorTab === "enchantments") ? "Nenhum encantamento à venda." : "Nenhum item à venda."}
                    </p>
                  )}
                  </>
                  );
                })()}

                {!isEnchantNpc(npc.type) && !isClassNpc(npc.type) && vendorTab === "crafts" && (
                  crafts.length > 0 ? (
                    <div className="space-y-2">
                      {crafts.map((recipe) => {
                        const ings = parseIngredients(recipe.ingredients);
                        const questIds = parseQuestIdList(recipe.requiredQuestIds);
                        const craftLocked = questIds.length > 0 && !questIds.every((id) => doneQuests.has(id));
                        const r = recipe.resultItem;
                        const statKeys: { key: "strength" | "intellect" | "endurance" | "dexterity" | "wisdom" | "luck"; label: string }[] = [
                          { key: "strength", label: "Força" },
                          { key: "intellect", label: "Intelecto" },
                          { key: "endurance", label: "Vigor" },
                          { key: "dexterity", label: "Destreza" },
                          { key: "wisdom", label: "Sabedoria" },
                          { key: "luck", label: "Sorte" },
                        ];
                        const statBadges = r
                          ? statKeys.filter((s) => Number(r[s.key] || 0) > 0)
                          : [];
                        return (
                          <div key={recipe.id} className="card p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-600/40 to-amber-600/30 flex items-center justify-center overflow-hidden shrink-0">
                              {r?.icon ? (
                                <EntityIcon src={r.icon} size={18} className="text-orange-300" imgClassName="w-full h-full object-contain p-0.5" />
                              ) : (
                                <Hammer size={16} className="text-orange-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">
                                {r?.name ?? "Item"} <span className="text-gray-500">x{recipe.resultQuantity}</span>
                                {r?.rarity && (
                                  <span className={`text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full align-middle uppercase ${RARITY_CLASSES[r.rarity] || "bg-dark-700 text-gray-300"}`}>
                                    {r.rarity}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-gray-500 line-clamp-2">{r?.description || recipe.description}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {r?.type === "weapon" && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-300 rounded-md">
                                    DPS {Number(r.dps || 0).toLocaleString()} · {Number(r.attackSpeedMs) > 0 ? `${(Number(r.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s"}
                                  </span>
                                )}
                                {statBadges.map(({ key, label }) => (
                                  <span key={key} className="text-[10px] px-1.5 py-0.5 bg-dark-700 text-cyan-300 rounded-md">
                                    {label} +{r![key]}
                                  </span>
                                ))}
                                {Number(recipe.requiredLevel) > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                                    Nv. {recipe.requiredLevel}+
                                  </span>
                                )}
                                {ings.map((ing, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-dark-700 text-gray-300 rounded-md">
                                    {ing.quantity}x {ing.itemName}
                                  </span>
                                ))}
                                {craftLocked && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/15 text-sky-300 rounded-md flex items-center gap-1">
                                    <Lock size={9} /> Quest
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => craftItem(recipe)}
                              disabled={craftingId === recipe.id || craftLocked}
                              className="btn-secondary text-xs px-3 py-1 mt-1 shrink-0 disabled:opacity-50"
                              title={craftLocked ? "Requer concluir uma quest" : undefined}
                            >
                              {craftingId === recipe.id ? "..." : craftLocked ? "Quest bloqueada" : "Craftar"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Nenhuma receita disponível.</p>
                  )
                )}

              {isClassNpc(npc.type) && (() => {
                const classOffers = (npc.shopItems ?? []).filter((o) => !!o.classId && !o.itemId && !o.enchantmentId);
                return classOffers.length > 0 ? (
                  <div className="space-y-2">
                    {classOffers.map((offer) => {
                      const cls = offer.class;
                      if (!cls) return null;
                      const vipLocked = cls.requiredVip && !vipActive;
                      return (
                        <div key={offer.id} className="card p-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            {cls.icon ? (
                              <EntityIcon src={cls.icon} size={18} className="text-purple-400" imgClassName="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Swords size={16} className="text-purple-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {cls.name}
                              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 align-middle">classe</span>
                            </p>
                            <p className="text-[11px] text-gray-500 line-clamp-2">{cls.description}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] px-1.5 py-0.5 bg-dark-700 text-gray-300 rounded-md capitalize">{cls.role}</span>
                              {cls.requiredLevel > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">Nv. {cls.requiredLevel}+</span>
                              )}
                              {cls.requiredVip && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md flex items-center gap-1">
                                  <Crown size={9} /> VIP
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-yellow-400">{Number(offer.price).toLocaleString()} gold</p>
                            <button
                              onClick={() => buyItem(offer)}
                              disabled={buyingItemId === offer.classId || vipLocked}
                              className="btn-secondary text-xs px-3 py-1 mt-1 disabled:opacity-50"
                              title={vipLocked ? "Requer VIP" : undefined}
                            >
                              {buyingItemId === offer.classId ? "..." : vipLocked ? "VIP" : "Comprar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhuma classe à venda.</p>
                );
              })()}
              </div>
            )}

            {isQuestNpc(npc.type) && (
              <div className="space-y-2">
                {npc.quests && npc.quests.length > 0 ? (
                  npc.quests.map((q) => {
                    const status = questStatus(q.id);
                    return (
                      <div key={q.id} className="card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{q.title}</p>
                            <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{q.description}</p>
                            <p className="text-[11px] text-gray-500 mt-2">
                              <span className="text-purple-400">+{Number(q.xpReward)} XP</span> •{" "}
                              <span className="text-yellow-400">+{Number(q.goldReward)} gold</span>
                              {q.requiredLevel > 1 && <> • <span className="text-yellow-500">Lv.{q.requiredLevel}+</span></>}
                              {q.requiredRank > 1 && <> • <span className="text-orange-400">Rank {q.requiredRank}+</span></>}
                              {q.requiredQuestIds && (
                                <span className="flex items-center gap-1 text-sky-400">
                                  <Lock size={10} /> Cadeia: complete a quest anterior
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {!status && (
                              <button onClick={() => acceptQuest(q.id)} className="btn-primary text-xs px-3 py-1.5">
                                Aceitar
                              </button>
                            )}
                            {status === "active" && (
                              <span className="flex items-center gap-1 text-xs text-green-400 px-2 py-1">
                                <Clock size={12} /> Em progresso
                              </span>
                            )}
                            {status === "completed" && (
                              <button onClick={() => claimQuest(q.id)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                                <Gift size={12} /> Resgatar
                              </button>
                            )}
                            {status === "claimed" && (
                              <span className="flex items-center gap-1 text-xs text-gray-400 px-2 py-1">
                                <CheckCircle2 size={12} /> Concluída
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500">Nenhuma quest disponível.</p>
                )}
              </div>
            )}

            {isGachaNpc(npc.type) && (
              <div className="space-y-4">
                {gachaLoading && !gachaData ? (
                  <p className="text-sm text-gray-500">Carregando o gacha...</p>
                ) : gachaData?.config?.active === false ? (
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <Lock size={14} /> O gacha está temporariamente desativado.
                  </p>
                ) : gachaData ? (
                  <>
                    {/* Tickets */}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm font-medium">
                        <Ticket size={16} className="text-purple-400" />
                        {gachaData.tickets} {gachaData.tickets === 1 ? "ticket" : "tickets"}
                      </span>
                      <button
                        onClick={rollGacha}
                        disabled={rolling || gachaData.tickets < 1}
                        className="btn-primary text-xs px-4 py-2 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Dices size={14} /> {rolling ? "Rolando..." : "Rolar (1 ticket)"}
                      </button>
                      {gachaData.config && Number(gachaData.config.ticketCost) > 0 && (
                        <button
                          onClick={buyTicket}
                          disabled={buyingTicket}
                          className="btn-secondary text-xs px-3 py-2 flex items-center gap-2 disabled:opacity-50"
                        >
                          <Gem size={14} /> Comprar ticket ({Number(gachaData.config.ticketCost).toLocaleString()} gold)
                        </button>
                      )}
                    </div>
                    {gachaData.tickets < 1 && (
                      <p className="text-[11px] text-gray-500">Sem tickets? Compre mais ou espere novas formas de obtê-los (configurável).</p>
                    )}

                    {/* Última rolagem */}
                    {lastRoll && (
                      <div className={`card p-3 border ${BOOSTER_RARITY_BADGE[lastRoll.rarity] ?? "border-gray-600"}`}>
                        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-2">
                          <Sparkles size={12} className="text-yellow-400" /> Última rolagem — {lastRoll.rarityLabel}
                        </p>
                        <p className="text-sm font-medium mt-1">{lastRoll.booster.name}</p>
                        <p className="text-xs text-gray-400">{BOOST_LABELS[lastRoll.booster.boostType] ?? lastRoll.booster.boostType} +{lastRoll.booster.boostValue}%</p>
                      </div>
                    )}

                    {/* Catálogo por raridade */}
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Gem size={12} className="text-cyan-400" /> Possíveis recompensas
                      </p>
                      {gachaData.config?.slotChances && (() => {
                        const sc = gachaData.config.slotChances as Record<string, number>;
                        const ring = Number(sc.ring ?? 0);
                        const neck = Number(sc.necklace ?? 0);
                        const total = ring + neck;
                        if (total <= 0) return null;
                        return (
                          <p className="text-[11px] text-gray-500 mb-2">
                            Chance do prêmio ser <span className="text-yellow-400">Anel {Math.round((ring / total) * 100)}%</span> ·{" "}
                            <span className="text-orange-400">Colar {Math.round((neck / total) * 100)}%</span>
                          </p>
                        );
                      })()}
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {gachaData.catalog.map((b) => {
                          const chance = gachaData.config?.chances?.[b.rarity] ?? null;
                          return (
                            <div key={b.id} className="flex items-center gap-2 text-xs">
                              <span className={`px-2 py-0.5 rounded-full font-medium w-fit shrink-0 ${BOOSTER_RARITY_BADGE[b.rarity] ?? "bg-gray-600/30 text-gray-300"}`}>
                                {gachaData.rarityLabels?.[b.rarity] ?? b.rarity}
                              </span>
                              <span className="text-gray-300">{BOOST_LABELS[b.boostType] ?? b.boostType} +{b.boostValue}%</span>
                              {chance !== null && <span className="text-gray-500 ml-auto shrink-0">{chance}%</span>}
                            </div>
                          );
                        })}
                        {gachaData.catalog.length === 0 && <p className="text-xs text-gray-500">Catálogo vazio — aguarde o admin configurar.</p>}
                      </div>
                    </div>

                    {/* Meus boosters */}
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Crown size={12} className="text-yellow-400" /> Meus Anéis e Colares ({gachaData.owned.length})
                      </p>
                      {gachaData.owned.length > 0 ? (
                        <div className="space-y-1.5">
                          {gachaData.owned.map((ub) => (
                            <div key={ub.id} className={`card p-2.5 flex items-center gap-3 ${ub.equipped ? "border-purple-500/40" : ""}`}>
                              <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0">
                                <Gem size={14} className={ub.booster.type === "ring" ? "text-yellow-400" : "text-orange-400"} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {ub.booster.name}
                                  {ub.quantity > 1 && <span className="text-[10px] text-gray-400 ml-1">x{ub.quantity}</span>}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                  <span className={`px-1.5 py-px rounded-full text-[10px] mr-1 ${BOOSTER_RARITY_BADGE[ub.booster.rarity] ?? ""}`}>
                                    {gachaData.rarityLabels?.[ub.booster.rarity] ?? ub.booster.rarity}
                                  </span>
                                  {BOOST_LABELS[ub.booster.boostType] ?? ub.booster.boostType} +{ub.booster.boostValue}% • {ub.booster.type === "ring" ? "Anel" : "Colar"}
                                  {ub.equipped && <span className="text-purple-300 ml-1.5">• equipado</span>}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleBooster(ub)}
                                className={`text-xs px-3 py-1.5 rounded-lg shrink-0 ${ub.equipped ? "btn-secondary" : "btn-primary"}`}
                              >
                                {ub.equipped ? "Remover" : "Equipar"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Você ainda não rolou nenhum anel/colar. Use um ticket!</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Falha ao carregar o gacha.</p>
                )}
              </div>
            )}

            {npc.type && !isShopNpc(npc.type) && !isQuestNpc(npc.type) && !isGachaNpc(npc.type) && (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Lock size={14} /> Funcionalidade em breve.
              </p>
            )}
          </div>
        </div>
      )}

      {npcLoading && !npc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
