import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, Link } from "react-router-dom";
import { mapsApi, npcApi, questsApi, raidApi, craftApi, authApi, gachaApi, inventoryApi } from "../services/api";
import { Map as MapType } from "../types";
import { getSocket } from "../services/socket";
import {
  ArrowLeft, Skull, Store, ScrollText, Navigation, Shield, Map as MapIcon,
  X, ShoppingBag, CheckCircle2, Clock, Gift, Lock, Swords, Hammer, Crown, Sparkles,
  Dices, Ticket, Gem, Package, Coins, Pen, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { effectiveEnchantmentStats } from "../lib/enchantmentStats";
import { EntityIcon } from "../components/EntityIcon";
import { QuestTracker } from "../components/QuestTracker";
import { EnchantItemPicker } from "../components/EnchantItemPicker";

const ENCH_STAT_LABELS: { key: string; label: string }[] = [
  { key: "strength", label: "Força" },
  { key: "intellect", label: "Intelecto" },
  { key: "endurance", label: "Vigor" },
  { key: "dexterity", label: "Destreza" },
  { key: "wisdom", label: "Sabedoria" },
  { key: "luck", label: "Sorte" },
];

const RARITY_BADGE: Record<string, string> = {
  common: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  uncommon: "bg-green-500/15 text-green-300 border-green-500/30",
  rare: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  epic: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  legendary: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  mythic: "bg-red-500/15 text-red-300 border-red-500/30",
  artifact: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

const RARITY_TEXT: Record<string, string> = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-orange-400",
  mythic: "text-red-400",
  artifact: "text-cyan-400",
};

const RARITY_ICON_FRAME: Record<string, string> = {
  common: "from-gray-700/40 to-gray-800/30 border-gray-600/50",
  uncommon: "from-green-600/30 to-emerald-800/20 border-green-500/40",
  rare: "from-blue-600/30 to-indigo-800/20 border-blue-500/40",
  epic: "from-purple-600/30 to-fuchsia-800/20 border-purple-500/40",
  legendary: "from-orange-600/30 to-amber-800/20 border-orange-500/40",
  mythic: "from-red-600/30 to-rose-800/20 border-red-500/40",
  artifact: "from-cyan-600/30 to-teal-800/20 border-cyan-500/40",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  weapon: "Arma",
  class: "Classe",
  helm: "Capacete",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
  consumable: "Consumível",
};

const CORE_STATS: { key: keyof UnifiedShopItem; label: string; color: string }[] = [
  { key: "strength", label: "Força", color: "text-orange-400" },
  { key: "intellect", label: "Intelecto", color: "text-blue-400" },
  { key: "endurance", label: "Vigor", color: "text-red-400" },
  { key: "dexterity", label: "Destreza", color: "text-green-400" },
  { key: "wisdom", label: "Sabedoria", color: "text-purple-400" },
  { key: "luck", label: "Sorte", color: "text-yellow-400" },
];

function itemStatRows(item: UnifiedShopItem): { label: string; value: string; valueColor: string }[] {
  const rows: { label: string; value: string; valueColor: string }[] = [];
  // Itens são cascas: DPS/velocidade/atributos só existem via encantamento.
  if (item.type === "weapon") {
    const ench = (item as any).enchantment;
    const enchStats = ench?.computedStats;
    if (Number(item.dps) > 0 || enchStats) {
      rows.push({
        label: "DPS",
        value: Number(enchStats?.dps || item.dps || 0).toLocaleString("pt-BR"),
        valueColor: "text-orange-300",
      });
      rows.push({
        label: "Intervalo de Ataque",
        value: `${
          (Number(enchStats?.attackSpeedMs || item.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
        }s`,
        valueColor: "text-orange-300",
      });
    } else {
      rows.push({ label: "Sem encantamento", value: "DPS mínimo", valueColor: "text-gray-500" });
    }
  } else if (item.type === "consumable") {
    try {
      const fx = JSON.parse(item.effects || "{}");
      for (const [k, v] of Object.entries(fx)) rows.push({ label: k, value: `+${v}`, valueColor: "text-green-400" });
    } catch {
      /* sem efeitos */
    }
  } else {
    const ench = (item as any).enchantment;
    const enchStats = ench?.computedStats;
    const src = enchStats || item;
    // Elmo/armadura/capa sem atributos recebem o MÍNIMO por nível (1-5), como as armas.
    const min = ["helm", "armor", "cape"].includes(item.type)
      ? Math.min(5, 1 + Math.floor((Number((item as any).level) || 1) / 30))
      : 0;
    for (const { key, label, color } of CORE_STATS) {
      const v = Number((src as any)[key] || 0) || min;
      if (v > 0) rows.push({ label, value: `+${v}`, valueColor: color });
    }
    if (!enchStats && min === 0) {
      for (const { key, label } of CORE_STATS) {
        if (Number((item as any)[key] || 0) === 0) {
          rows.push({ label: "Sem encantamento", value: "sem atributos", valueColor: "text-gray-500" });
          break;
        }
      }
    }
  }
  return rows;
}

interface NpcShopEnchantment {
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  requiredVip?: boolean;
  level?: number;
  rarity?: string;
  category?: string;
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  computedStats?: Record<string, number>;
}

interface NpcShopClass {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  role: string;
  requiredLevel: number;
  requiredVip: boolean;
  price: string | number;
}

interface NpcShopItem {
  id: string;
  price: string | number;
  currency?: string;
  itemId?: string | null;
  enchantmentId?: string | null;
  classId?: string | null;
  requiredLevel?: number;
  requiredVip?: boolean;
  requiredQuestIds?: string | null;
  class?: NpcShopClass | null;
  item?: {
    id: string;
    name: string;
    description: string;
    type: string;
    rarity: string;
    icon?: string | null;
    level?: number;
    rank?: number;
    effects?: string | null;
    attackSpeedMs?: number;
    dps?: number;
    strength?: number;
    intellect?: number;
    endurance?: number;
    dexterity?: number;
    wisdom?: number;
    luck?: number;
    requiredVip?: boolean;
  } | null;
  enchantment?: NpcShopEnchantment | null;
}

interface NpcDetail {
  id: string;
  name: string;
  type: string;
  shopItems?: NpcShopItem[];
  quests?: { id: string; title: string; description: string; requiredLevel: number; requiredRank: number; requiredQuestIds?: string | null; xpReward: string | number; goldReward: string | number }[];
}

interface QuestProgressEntry {
  questId: string;
  status: "active" | "completed" | "claimed";
  progress?: any; // contadores por objetivo (JSON)
  quest?: any; // quest completa (objetivos, recompensas)
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
  requiredVip?: boolean;
  requiredQuestIds?: string | null;
  ingredients: string;
  goldCost?: number | string;
  isActive: boolean;
  resultItem?: CraftResultItem | null;
}

interface UnifiedShopItem {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  icon?: string | null;
  level: number;
  rank: number;
  effects?: string | null;
  dps: number;
  attackSpeedMs: number;
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
}

interface UnifiedShopEntry {
  item: UnifiedShopItem;
  buyOffer?: NpcShopItem;
  recipes: CraftRecipe[];
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

interface GachaData {
  npc: { id: string; name: string; description: string; type: string };
  config: { id: string; freeTickets: number; ticketCost: number; chances: Record<string, number>; slotChances?: Record<string, number>; active: boolean } | null;
  tickets: number;
  gold: number;
  catalog: GachaBooster[];
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

const WORLD_MAP_IMG = "/map/bf9dcec3-5bf2-49d7-9a5f-3ead21ba4c2a.png";

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
  const [shopSelectedId, setShopSelectedId] = useState<string | null>(null);
  const [inventoryByName, setInventoryByName] = useState<Record<string, number>>({});
  const [enchantCategory, setEnchantCategory] = useState<string>("all");
  const [enchantMaxLevel, setEnchantMaxLevel] = useState<number>(10);
  const [gachaData, setGachaData] = useState<GachaData | null>(null);
  const [gachaLoading, setGachaLoading] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<GachaRollResult | null>(null);
  const [enchantPick, setEnchantPick] = useState<NpcShopItem | null>(null);
  const [enchantPickItems, setEnchantPickItems] = useState<any[]>([]);
  const [enchantPickLoading, setEnchantPickLoading] = useState(false);
  const [applyingInvId, setApplyingInvId] = useState<string | null>(null);
  const [pinEditMode, setPinEditMode] = useState(false);
  const [pinEditingSlug, setPinEditingSlug] = useState<string | null>(null);
  const isStaff = user?.role === "admin" || user?.role === "owner";

  const savePin = async (mapSlug: string, left: number, top: number) => {
    const map = maps.find((m) => m.slug === mapSlug);
    if (!map) return;
    try {
      await mapsApi.updatePin(map.id, left, top);
      setMaps((prev) => prev.map((mm) => (mm.id === map.id ? { ...mm, pinLeft: left, pinTop: top } : mm)));
    } catch {
      toast.error("Falha ao salvar a posição do pino.");
    }
  };

  const doneQuests = new Set(
    questProgress.filter((q) => q.status === "completed" || q.status === "claimed").map((q) => q.questId)
  );
  const vipActive = !!user?.vipUntil && new Date(user.vipUntil).getTime() > Date.now();

  const refreshUser = async () => {
    try {
      const { data } = await authApi.me();
      if (data.user) setUser(data.user);
    } catch { /* ignore */ }
  };

  const loadInventory = () => {
    inventoryApi.list().then(({ data }) => {
      const map: Record<string, number> = {};
      for (const inv of Array.isArray(data) ? data : []) {
        const name = String(inv.item?.name || "").toLowerCase();
        if (!name) continue;
        map[name] = (map[name] ?? 0) + Number(inv.quantity || 0);
      }
      setInventoryByName(map);
    }).catch(() => {});
  };

  const ownedQty = (name: string) => inventoryByName[String(name).toLowerCase()] ?? 0;

  const normalizeShopItem = (it: any): UnifiedShopItem => ({
    id: it.id,
    name: it.name ?? "Item",
    description: it.description ?? "",
    type: it.type ?? "consumable",
    rarity: it.rarity ?? "common",
    icon: it.icon ?? null,
    level: Number(it.level || 1),
    rank: Number(it.rank || 1),
    effects: it.effects ?? null,
    dps: Number(it.dps || 0),
    attackSpeedMs: Number(it.attackSpeedMs || 0),
    strength: Number(it.strength || 0),
    intellect: Number(it.intellect || 0),
    endurance: Number(it.endurance || 0),
    dexterity: Number(it.dexterity || 0),
    wisdom: Number(it.wisdom || 0),
    luck: Number(it.luck || 0),
  });

  const buildShopEntries = (): UnifiedShopEntry[] => {
    if (!npc) return [];
    const byId = new Map<string, UnifiedShopEntry>();
    for (const offer of npc.shopItems ?? []) {
      if (!offer.itemId || offer.enchantmentId || offer.classId || !offer.item) continue;
      const entry = byId.get(offer.itemId) ?? { item: normalizeShopItem(offer.item), buyOffer: undefined, recipes: [] };
      entry.buyOffer = offer;
      byId.set(offer.itemId, entry);
    }
    for (const recipe of crafts) {
      if (!recipe.resultItem) continue;
      const entry = byId.get(recipe.resultItemId) ?? { item: normalizeShopItem(recipe.resultItem), buyOffer: undefined, recipes: [] };
      entry.recipes.push(recipe);
      byId.set(recipe.resultItemId, entry);
    }
    return Array.from(byId.values());
  };

  // Loja de itens aparece para qualquer NPC que tenha ofertas de item vinculadas,
  // independente do "type" (ex.: fornecedores/supridores criados pela IA).
  const npcHasItemShop =
    !!npc &&
    (isShopNpc(npc.type) ||
      (npc.shopItems ?? []).some((s: any) => s.itemId && !s.enchantmentId && !s.classId));

  // ===== Quest Card (3 telas: Oferta / Progresso / Conclusão) =====
  const parseJson = (v: any, fallback: any = []) => {
    try {
      const p = typeof v === "string" ? JSON.parse(v) : v;
      return Array.isArray(p) ? p : fallback;
    } catch {
      return fallback;
    }
  };
  const objKey = (o: any) => String(o?.id ?? `${o?.type}-${o?.itemName ?? o?.target ?? o?.itemId}`);
  const objLabel = (o: any) => o?.itemName ?? o?.target ?? o?.monsterName ?? o?.name ?? "Objetivo";

  const QuestCard = ({ q }: { q: any }) => {
    const status = questStatus(q.id);
    const entry = questProgress.find((p) => p.questId === q.id);
    const progress: Record<string, number> = parseJson(entry?.progress, {});
    const objectives = parseJson(q.objectives, []);
    const rewards = parseJson(q.itemRewards, []);
    const counts: any[] = objectives.map((o: any) => {
      const target = Number(o?.amount ?? o?.count ?? 1);
      const cur = Number(progress[objKey(o)] ?? 0);
      return { o, target, cur, done: cur >= target };
    });
    const allDone = objectives.length > 0 && counts.every((c) => c.done);

    const btnBase =
      "flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2";
    const primary = "bg-purple-600 hover:bg-purple-500 text-white";
    const ghost = "bg-dark-700 hover:bg-dark-600 text-gray-300";

    // Tela de CONCLUSÃO (recompensas)
    if (status === "completed" || status === "claimed") {
      return (
        <div className="card p-4 border border-purple-500/30">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-widest text-purple-400 font-semibold">Quest Complete</p>
            <h3 className="font-display font-bold text-lg mt-1 text-white">{q.title}</h3>
            <p className="text-[11px] text-emerald-400 mt-1">All objectives completed.</p>
          </div>
          {rewards.length > 0 && (
            <div className="mt-3 rounded-lg bg-dark-900/70 border border-dark-700 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Rewards</p>
              {rewards.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">🎁 {r.itemName ?? r.name ?? "Item"}</span>
                  {r.quantity ? <span className="text-gray-500">x{r.quantity}</span> : null}
                </div>
              ))}
              {(Number(q.goldReward) > 0 || Number(q.xpReward) > 0) && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-dark-700 mt-1">
                  <span className="text-yellow-400">🟡 {Number(q.goldReward).toLocaleString("pt-BR")} gold</span>
                  <span className="text-sky-400">🔵 {Number(q.xpReward).toLocaleString("pt-BR")} XP</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-3">
            {status === "completed" ? (
              <button onClick={() => claimQuest(q.id)} className={`${btnBase} ${primary} w-full`}>
                <Gift size={15} /> Claim Rewards
              </button>
            ) : (
              <span className="flex items-center justify-center gap-2 text-xs text-gray-400 py-2">
                <CheckCircle2 size={14} /> Concluída
              </span>
            )}
          </div>
        </div>
      );
    }

    // Tela de PROGRESSO (aceita, em andamento)
    if (status === "active") {
      return (
        <div className="card p-4 border border-purple-500/20">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-white">{q.title}</h3>
            <span className="text-[10px] uppercase tracking-wider text-green-400 flex items-center gap-1">
              <Clock size={11} /> Em progresso
            </span>
          </div>
          {q.description && <p className="text-[11px] text-gray-400 mt-1.5">{q.description}</p>}
          <div className="mt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Objetivos</p>
            {counts.map((c, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300">{objLabel(c.o)}</span>
                  <span className={`font-mono ${c.done ? "text-emerald-400" : "text-gray-400"}`}>
                    {Math.min(c.cur, c.target)} / {c.target}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-dark-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${Math.min(100, (c.cur / c.target) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            {allDone ? (
              <button onClick={() => claimQuest(q.id)} className={`${btnBase} ${primary} w-full`}>
                <Gift size={15} /> Turn In
              </button>
            ) : (
              <p className="text-center text-[11px] text-gray-500 py-1">Continue para completar os objetivos</p>
            )}
          </div>
        </div>
      );
    }

    // Tela de OFERTA (ainda não aceita)
    return (
      <div className="card p-4 border border-purple-500/20">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-purple-400 font-semibold">⚔ Quest Available</p>
          <h3 className="font-display font-bold text-lg mt-1 text-white">{q.title}</h3>
        </div>
        {q.description && (
          <p className="text-[11px] text-gray-400 mt-2 text-center italic">"{q.description}"</p>
        )}
        {objectives.length > 0 && (
          <div className="mt-3 rounded-lg bg-dark-900/70 border border-dark-700 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Itens necessários</p>
            {counts.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{objLabel(c.o)}</span>
                <span className="text-gray-500">0 / {c.target}</span>
              </div>
            ))}
          </div>
        )}
        {rewards.length > 0 && (
          <div className="mt-2 rounded-lg bg-dark-900/70 border border-dark-700 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Recompensas</p>
            {rewards.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">🎁 {r.itemName ?? r.name ?? "Item"}</span>
                {r.quantity ? <span className="text-gray-500">x{r.quantity}</span> : null}
              </div>
            ))}
            {(Number(q.goldReward) > 0 || Number(q.xpReward) > 0) && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-dark-700 mt-1">
                <span className="text-yellow-400">🟡 {Number(q.goldReward).toLocaleString("pt-BR")} gold</span>
                <span className="text-sky-400">🔵 {Number(q.xpReward).toLocaleString("pt-BR")} XP</span>
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={() => acceptQuest(q.id)} className={`${btnBase} ${primary}`}>
            <CheckCircle2 size={15} /> Accept
          </button>
          <button onClick={() => setNpc(null)} className={`${btnBase} ${ghost}`}>
            Decline
          </button>
        </div>
      </div>
    );
  };

  const loadCrafts = () => {
    craftApi.list().then(({ data }) => {
      if (Array.isArray(data)) setCrafts(data);
    }).catch(() => {});
  };

  useEffect(() => {
    loadCrafts();
    loadInventory();
  }, []);

  const craftItem = async (recipe: CraftRecipe) => {
    setCraftingId(recipe.id);
    try {
      const { data } = await craftApi.craft(recipe.id);
      toast.success(data.message || "Craftado!");
      loadCrafts();
      loadInventory();
      refreshUser();
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
    setShopSelectedId(null);
    setLastRoll(null);
    setGachaData(null);
    setEnchantCategory("all");
    setEnchantMaxLevel(10);
    try {
      const { data } = await npcApi.get(npcId);
      setNpc(data);
      if (isGachaNpc(data.type)) loadGacha(npcId);
      if (isShopNpc(data.type) && !isEnchantNpc(data.type) && !isClassNpc(data.type)) {
        loadInventory();
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

  const doBuy = async (offer: NpcShopItem, inventoryId?: string) => {
    if (!npc) throw new Error("NPC ausente");
    const isEnchantment = !!offer.enchantmentId;
    const isClass = !!offer.classId && !offer.itemId && !offer.enchantmentId;
    const payload = isEnchantment
      ? { enchantmentId: offer.enchantmentId!, quantity: 1, ...(inventoryId ? { inventoryId } : {}) }
      : isClass
        ? { classId: offer.classId!, quantity: 1 }
        : { itemId: offer.itemId!, quantity: 1 };
    const { data } = await npcApi.buy(npc.id, payload);
    return { data, isEnchantment, isClass };
  };

  const buyItem = async (offer: NpcShopItem) => {
    if (!npc) return;
    const isEnchantment = !!offer.enchantmentId;
    const isClass = !!offer.classId && !offer.itemId && !offer.enchantmentId;
    setBuyingItemId(isEnchantment ? offer.enchantmentId! : isClass ? offer.classId! : offer.itemId!);
    try {
      const { data } = await doBuy(offer);
      const currency = data.currency === "sf_coins" ? "SF Coins" : "gold";
      toast.success(isClass ? `Classe ${data.item} desbloqueada e equipada!` : `${data.quantity}x ${data.item} comprado (${data.totalPrice} ${currency})`);
      refreshUser();
      loadInventory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha na compra");
    } finally {
      setBuyingItemId(null);
    }
  };

  // Compra do encantamento com aplicação direta no item escolhido (categorias no modal)
  const openEnchantPick = async (offer: NpcShopItem) => {
    setEnchantPick(offer);
    setEnchantPickLoading(true);
    setEnchantPickItems([]);
    try {
      const { data } = await inventoryApi.list();
      const rows = Array.isArray(data) ? data : [];
      const ENCH_TYPES = ["weapon", "armor", "helm", "cape"];
      setEnchantPickItems(rows.filter((r: any) => ENCH_TYPES.includes(r.item?.type)));
    } catch {
      setEnchantPickItems([]);
    } finally {
      setEnchantPickLoading(false);
    }
  };

  const handleEnchantApply = async (offer: NpcShopItem, inventoryId: string) => {
    setApplyingInvId(inventoryId);
    try {
      const { data } = await doBuy(offer, inventoryId);
      toast.success(`Encantamento aplicado${data.appliedTo ? ` em ${data.appliedTo}` : ""}!`);
      refreshUser();
      loadInventory();
      setEnchantPick(null);
      setEnchantPickItems([]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao encantar");
    } finally {
      setApplyingInvId(null);
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <MapIcon size={22} className="text-purple-400" /> Mapa Mundi
            </h1>
            <p className="text-sm text-gray-400 mt-1">Escolha um local para explorar.</p>
          </div>
          {isStaff && maps.length > 0 && (
            <button
              type="button"
              onClick={() => setPinEditMode((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors ${
                pinEditMode ? "bg-purple-500 text-white hover:bg-purple-400" : "bg-dark-700 text-gray-300 hover:bg-dark-600"
              }`}
            >
              {pinEditMode ? <Check size={14} /> : <Pen size={14} />}
              {pinEditMode ? "Concluir" : "Ajustar posições"}
            </button>
          )}
        </div>
        {maps.length === 0 && <p className="text-gray-500 text-sm">Nenhum mapa disponível.</p>}
        {maps.length > 0 && (
          <div className="relative w-full rounded-xl overflow-hidden border border-dark-700 select-none">
            <img
              src={WORLD_MAP_IMG}
              alt="Mapa Mundi"
              draggable={false}
              className="w-full h-auto block"
              onDragStart={(e) => e.preventDefault()}
            />
            {maps.map((m) => {
              if (m.pinLeft == null || m.pinTop == null) return null;
              const isRaid = m.type === "raid";
              const editing = pinEditMode && pinEditingSlug === m.slug;
              const pinBody = (
                <>
                  <span
                    className={`block w-5 h-5 rounded-full border-2 shadow-lg transition-all ${
                      isRaid
                        ? "bg-red-600 border-red-300"
                        : editing
                          ? "bg-purple-500 border-purple-200 ring-2 ring-purple-300"
                          : "bg-blue-600 border-blue-200"
                    }`}
                  />
                  <span
                    className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs px-2 py-0.5 rounded-md font-bold border ${
                      isRaid ? "bg-red-950/90 text-red-300 border-red-800" : "bg-dark-950/90 text-gray-200 border-dark-700"
                    }`}
                  >
                    {m.name}
                  </span>
                </>
              );
              if (!pinEditMode) {
                return (
                  <Link
                    key={m.id}
                    to={`/map/${m.slug}`}
                    title={m.name}
                    className="absolute z-10 group focus:outline-none"
                    style={{ left: `${m.pinLeft}%`, top: `${m.pinTop}%` }}
                  >
                    <span className="flex items-center -translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform">
                      {pinBody}
                    </span>
                  </Link>
                );
              }
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinEditingSlug(pinEditingSlug === m.slug ? null : m.slug);
                  }}
                  className="absolute z-10 focus:outline-none cursor-crosshair"
                  style={{ left: `${m.pinLeft}%`, top: `${m.pinTop}%` }}
                >
                  <span className="flex items-center -translate-x-1/2 -translate-y-1/2">{pinBody}</span>
                </button>
              );
            })}
            {pinEditMode && (
              <div
                className="absolute inset-0 z-[5]"
                onClick={(e) => {
                  if (!pinEditingSlug) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  savePin(
                    pinEditingSlug,
                    ((e.clientX - rect.left) / rect.width) * 100,
                    ((e.clientY - rect.top) / rect.height) * 100
                  );
                }}
              />
            )}
          </div>
        )}
        {pinEditMode && (
          <p className="text-[11px] text-purple-300/80 leading-relaxed bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
            Clique em um pino para selecionar e depois clique no mapa para movê-lo. A nova posição vale para todos os jogadores.
          </p>
        )}
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
                  onClick={() => sessionStorage.setItem("combatOriginMapSlug", map.slug)}
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
          <QuestTracker />
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
      {createPortal(
        <>
      {npc && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setNpc(null)}>
          <div className="min-h-full flex justify-center">
          <div className={`panel w-full ${npcHasItemShop ? "max-w-6xl" : "max-w-lg"} max-h-[85vh] overflow-y-auto p-5 my-auto`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display font-bold text-lg">{npc.name}</h2>
                <p className="text-xs text-gray-500 capitalize">{npc.type?.replace("_", " ")}</p>
              </div>
              <button onClick={() => setNpc(null)} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {npcHasItemShop && (
              <div className="space-y-2">
                {!isEnchantNpc(npc.type) && !isClassNpc(npc.type) && (() => {
                  const entries = buildShopEntries();
                  const charLevel = user?.characters?.[0]?.level ?? user?.level ?? 0;
                  const gold = Number(user?.gold ?? 0);
                  const sfCoins = Number(user?.sfCoins ?? 0);
                  if (entries.length === 0) {
                    return <p className="text-sm text-gray-500">Nenhum item à venda neste vendedor.</p>;
                  }
                  const selected = entries.find((e) => e.item.id === shopSelectedId) ?? entries[0];
                  const statRows = itemStatRows(selected.item);
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr_280px] gap-3 items-start">
                      {/* PREVIEW */}
                      <div className="rounded-xl border border-dark-600 bg-gradient-to-b from-dark-800/70 to-dark-900/70 p-4 flex flex-col">
                        <div className="flex flex-col items-center text-center">
                          <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${RARITY_ICON_FRAME[selected.item.rarity] || RARITY_ICON_FRAME.common} border-2 flex items-center justify-center mb-3 shadow-lg`}>
                            {selected.item.icon ? (
                              <EntityIcon src={selected.item.icon} size={48} className="text-gray-100" imgClassName="w-16 h-16 object-contain" />
                            ) : (
                              <Package size={44} className="text-gray-400" />
                            )}
                          </div>
                          <h3 className="font-display font-bold text-lg leading-tight text-white">{selected.item.name}</h3>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                            <span className="text-[10px] uppercase tracking-wider text-gray-500">{ITEM_TYPE_LABELS[selected.item.type] || selected.item.type}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${RARITY_BADGE[selected.item.rarity] || RARITY_BADGE.common}`}>
                              {selected.item.rarity}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-700 border border-dark-600 text-yellow-300">Nv. {selected.item.level}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-4 text-center">{selected.item.description}</p>
                        {statRows.length > 0 && (
                          <div className="mt-4 rounded-lg bg-dark-900/70 border border-dark-700 p-3 space-y-1">
                            {statRows.map((row) => (
                              <div key={row.label} className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">{row.label}</span>
                                <span className={`font-mono ${row.valueColor}`}>{row.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* CUSTO / OBTENÇÃO */}
                      <div className="rounded-xl border border-dark-600 bg-dark-900/70 p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span className="flex items-center gap-1.5"><Coins size={12} className="text-yellow-400" /> Ouro</span>
                          <span className="font-mono text-yellow-300">{gold.toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span className="flex items-center gap-1.5"><Gem size={12} className="text-cyan-400" /> SF Coins</span>
                          <span className="font-mono text-cyan-300">{sfCoins.toLocaleString("pt-BR")}</span>
                        </div>

                        {selected.buyOffer && (() => {
                          const offer = selected.buyOffer!;
                          const price = Number(offer.price);
                          const isSfCoins = offer.currency === "sf_coins";
                          const enough = isSfCoins ? sfCoins >= price : gold >= price;
                          const questIds = parseQuestIdList(offer.requiredQuestIds);
                          const questLocked = questIds.length > 0 && !questIds.every((id) => doneQuests.has(id));
                          const vipLocked = !!(offer.requiredVip || offer.item?.requiredVip) && !vipActive;
                          const lvlLocked = Number(offer.requiredLevel) > 0 && charLevel < Number(offer.requiredLevel);
                          const locked = questLocked || vipLocked || lvlLocked;
                          const busy = buyingItemId === offer.itemId;
                          return (
                            <div className="rounded-lg border border-dark-700 bg-dark-800/60 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                                  {isSfCoins ? <Gem size={13} className="text-cyan-400" /> : <Coins size={13} className="text-yellow-400" />}
                                  {isSfCoins ? "SF Coins" : "Ouro"}
                                </span>
                                <span className={`font-mono text-base ${isSfCoins ? "text-cyan-200" : "text-yellow-200"}`}>{price.toLocaleString("pt-BR")}</span>
                              </div>
                              <button
                                onClick={() => buyItem(offer)}
                                disabled={locked || !enough || !!busy}
                                className={`w-full mt-2.5 text-xs px-3 py-2 rounded-lg font-semibold tracking-wider transition-colors ${
                                  locked
                                    ? "bg-dark-700 text-gray-500"
                                    : !enough
                                    ? "bg-dark-700 text-red-400"
                                    : "bg-gradient-to-r from-yellow-600 to-amber-500 text-black hover:opacity-90"
                                }`}
                              >
                                {busy ? "..." : locked ? (questLocked ? "Quest bloqueada" : vipLocked ? "Requer VIP" : `Requer Nv. ${offer.requiredLevel}`) : !enough ? (isSfCoins ? "SF Coins insuficientes" : "Ouro insuficiente") : "COMPRAR"}
                              </button>
                            </div>
                          );
                        })()}

                        {selected.buyOffer && selected.recipes.length > 0 && (
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-600">
                            <span className="flex-1 h-px bg-dark-700" /> OU <span className="flex-1 h-px bg-dark-700" />
                          </div>
                        )}

                        {selected.recipes.map((recipe) => {
                          const ings = parseIngredients(recipe.ingredients);
                          const questIds = parseQuestIdList(recipe.requiredQuestIds);
                          const questLocked = questIds.length > 0 && !questIds.every((id) => doneQuests.has(id));
                          const vipLocked = !!recipe.requiredVip && !vipActive;
                          const lvlLocked = Number(recipe.requiredLevel) > 0 && charLevel < Number(recipe.requiredLevel);
                          const goldCost = Number(recipe.goldCost || 0);
                          const matMet = ings.every((ing) => ownedQty(ing.itemName) >= ing.quantity);
                          const goldMet = gold >= goldCost;
                          const ready = !questLocked && !vipLocked && !lvlLocked && matMet && goldMet;
                          const busy = craftingId === recipe.id;
                          return (
                            <div key={recipe.id} className="rounded-lg border border-dark-700 bg-dark-800/60 p-3 space-y-1.5">
                              {ings.map((ing) => {
                                const have = ownedQty(ing.itemName);
                                const ok = have >= ing.quantity;
                                return (
                                  <div key={ing.itemName} className="flex items-center justify-between text-xs gap-2">
                                    <span className="text-gray-300">{ing.itemName}</span>
                                    <span className={`font-mono ${ok ? "text-green-400" : "text-red-400"}`}>
                                      {Math.min(have, ing.quantity).toLocaleString("pt-BR")} / {ing.quantity.toLocaleString("pt-BR")}
                                    </span>
                                  </div>
                                );
                              })}
                              {goldCost > 0 && (
                                <div className="flex items-center justify-between text-xs gap-2">
                                  <span className="text-gray-300 flex items-center gap-1.5"><Coins size={12} className="text-yellow-400" /> Ouro</span>
                                  <span className={`font-mono ${goldMet ? "text-green-400" : "text-red-400"}`}>
                                    {Math.min(gold, goldCost).toLocaleString("pt-BR")} / {goldCost.toLocaleString("pt-BR")}
                                  </span>
                                </div>
                              )}
                              <button
                                onClick={() => craftItem(recipe)}
                                disabled={!ready || busy}
                                className={`w-full mt-1.5 text-xs px-3 py-2 rounded-lg font-semibold tracking-wider transition-colors ${
                                  ready ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white hover:opacity-90" : "bg-dark-700 text-gray-500"
                                }`}
                              >
                                <span className="flex items-center justify-center gap-1.5">
                                  {busy ? (
                                    "Craftando..."
                                  ) : (
                                    <>
                                      {ready && <Hammer size={12} />}
                                      {ready ? "CRAFTAR" : questLocked ? "Quest bloqueada" : vipLocked ? "Requer VIP" : lvlLocked ? `Requer Nv. ${recipe.requiredLevel}` : "Requisitos pendentes"}
                                    </>
                                  )}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* LISTA DE ITENS */}
                      <div className="rounded-xl border border-dark-600 bg-dark-900/70 p-2 max-h-[60vh] overflow-y-auto">
                        <div className="px-2 pt-1.5 pb-2 text-[10px] uppercase tracking-widest text-gray-600 flex items-center justify-between">
                          <span>Itens</span>
                          <span className="text-gray-700">{entries.length}</span>
                        </div>
                        <div className="space-y-1">
                          {entries.map((entry) => {
                            const it = entry.item;
                            const active = selected.item.id === it.id;
                            return (
                              <button
                                key={it.id}
                                onClick={() => setShopSelectedId(it.id)}
                                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${
                                  active
                                    ? "bg-purple-600/15 border border-purple-500/40"
                                    : "hover:bg-dark-700/50 border border-transparent"
                                }`}
                              >
                                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${RARITY_ICON_FRAME[it.rarity] || RARITY_ICON_FRAME.common} border flex items-center justify-center overflow-hidden shrink-0`}>
                                  {it.icon ? (
                                    <EntityIcon src={it.icon} size={18} className="text-gray-100" imgClassName="w-6 h-6 object-contain" />
                                  ) : (
                                    <Package size={16} className="text-gray-400" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{it.name}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`text-[10px] uppercase ${RARITY_TEXT[it.rarity] || "text-gray-500"}`}>{it.rarity}</span>
                                    <span className="text-[10px] text-yellow-300">Lv. {it.level}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {isEnchantNpc(npc.type) && (() => {
                  const isEnchView = true;
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
                            {[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150].map((lv) => (
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
                              {!isEnchantment && offer.item?.type === "weapon" && (Number(offer.item.dps) > 0 || (offer.item as any)?.enchantment) && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-300 rounded-md">
                                  DPS {(() => {
                                    const enchStats = (offer.item as any)?.enchantment?.computedStats;
                                    return Number(enchStats?.dps || offer.item.dps || 0).toLocaleString("pt-BR");
                                  })()} · {(() => {
                                    const enchStats = (offer.item as any)?.enchantment?.computedStats;
                                    const speed = Number(enchStats?.attackSpeedMs || offer.item.attackSpeedMs);
                                    return speed > 0 ? `${(speed / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s";
                                  })()}
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
                                  <>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-300/90 rounded-md">
                                      {ENCH_STAT_LABELS.map(({ key, label }) => `${label} +${stats[key]}`).join(" · ")}
                                    </span>
                                    {Number(stats.dps || 0) > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-300 rounded-md">
                                        +{stats.dps} DPS
                                      </span>
                                    )}
                                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 rounded-md">
                                      ⏱ {((Number(stats.attackSpeedMs) || 2000) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s
                                    </span>
                                  </>
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
                              {Number(offer.price).toLocaleString()} {offer.currency === "sf_coins" ? "♦" : "gold"}
                            </p>
                            {offer.currency === "sf_coins" && (
                              <p className="text-[10px] text-cyan-400/80">SF Coins</p>
                            )}
                            <button
                              onClick={() => (isEnchantment ? openEnchantPick(offer) : buyItem(offer))}
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
                    <p className="text-sm text-gray-500">Nenhum encantamento à venda.</p>
                  )}
                  </>
                  );
                })()}

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
                  npc.quests.map((q: any) => <QuestCard key={q.id} q={q} />)
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
                    </div>
                    {gachaData.tickets < 1 && (
                      <p className="text-[11px] text-gray-500">Sem tickets? Compre na Loja do Game (guia Loja).</p>
                    )}

                    {/* Última rolagem */}
                    {lastRoll && (
                      <div className={`card p-3 border ${BOOSTER_RARITY_BADGE[lastRoll.rarity] ?? "border-gray-600"}`}>
                        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-2">
                          <Sparkles size={12} className="text-yellow-400" /> Última rolagem — {lastRoll.rarityLabel}
                        </p>
                        <p className="text-sm font-medium mt-1">{lastRoll.booster.name} <span className="text-[10px] text-cyan-300 ml-1">→ inventário</span></p>
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

                    {/* Drop vai para o inventário */}
                    <div className="rounded-lg bg-dark-900 border border-dark-600 p-3">
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Package size={12} className="text-cyan-400" /> O anel/colar rolado vai direto para o seu <span className="text-white font-semibold">Inventário</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Abra a aba <span className="text-gray-300">Inventário</span> para equipar no slot de anel ou colar.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Falha ao carregar o gacha.</p>
                )}
              </div>
            )}

            {npc.type && !npcHasItemShop && !isQuestNpc(npc.type) && !isGachaNpc(npc.type) && (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Lock size={14} /> Funcionalidade em breve.
              </p>
            )}
          </div>
          </div>
        </div>
      )}

      {npcLoading && !npc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {enchantPick && enchantPick.enchantment && (
        <EnchantItemPicker
          enchantment={enchantPick.enchantment}
          items={enchantPickItems}
          playerLevel={user?.characters?.[0]?.level ?? user?.level ?? 0}
          busyId={applyingInvId}
          loading={enchantPickLoading}
          onApply={(invId) => handleEnchantApply(enchantPick, invId)}
          onKeep={() => {
            const offer = enchantPick;
            setEnchantPick(null);
            setEnchantPickItems([]);
            buyItem(offer);
          }}
          onClose={() => {
            setEnchantPick(null);
            setEnchantPickItems([]);
          }}
        />
      )}
        </>,
        document.body
      )}
    </div>
  );
}
