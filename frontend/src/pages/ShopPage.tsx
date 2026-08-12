import { useEffect, useState } from "react";
import { shopApi, authApi, questsApi } from "../services/api";
import {
  ShoppingBag, Gem, Crown, Trophy, Coins, Sparkles, Package, Swords, Layers, Lock,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";
import { EntityIcon } from "../components/EntityIcon";

interface ShopEnchantment {
  name: string;
  description: string;
  rarity: string;
  minRank: number;
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  requiredVip?: boolean;
}

interface ShopItem {
  id: string;
  name: string;
  description?: string;
  icon?: string | null;
  type: string;
  rarity: string;
  rank?: number;
  level?: number;
  requiredVip?: boolean;
  dps?: number;
  attackSpeedMs?: number;
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  sellPrice?: number;
  craftRecipes?: CraftRecipeRaw[];
}

interface CraftRecipeRaw {
  id: string;
  name: string;
  description?: string;
  resultQuantity?: number;
  goldCost?: number | string;
  ingredients?: string;
}

interface ShopClass {
  id: string;
  name: string;
  icon?: string | null;
  role: string;
  requiredLevel?: number;
  requiredVip?: boolean;
}

interface ShopProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: "diamond_pack" | "vip" | "pass_premium" | "enchantment" | "item" | "class";
  currency: "diamond" | "money" | "gold";
  price: number;
  diamondAmount: number;
  vipDays: number;
  quantity: number;
  requiredLevel?: number;
  requiredVip?: boolean;
  requiredQuestIds?: string | null;
  enchantmentId?: string | null;
  enchantment?: ShopEnchantment | null;
  itemId?: string | null;
  item?: ShopItem | null;
  classId?: string | null;
  gameClass?: ShopClass | null;
  icon?: string | null;
}

type TabKey = "items" | "classes" | "offers";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "items", label: "Itens", icon: Package },
  { key: "classes", label: "Classes", icon: Swords },
  { key: "offers", label: "Ofertas", icon: Layers },
];

const rarityColor: Record<string, string> = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-orange-400",
  mythic: "text-red-400",
  artifact: "text-cyan-400",
};

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

function productVip(product: ShopProduct): boolean {
  if (product.requiredVip) return true;
  if (product.type === "item") return !!product.item?.requiredVip;
  if (product.type === "enchantment") return !!product.enchantment?.requiredVip;
  if (product.type === "class") return !!product.gameClass?.requiredVip;
  return false;
}

function productSubtitle(product: ShopProduct): string | null {
  if (product.type === "item") {
    return null;
  }
  if (product.type === "enchantment" && product.enchantment) {
    const e = product.enchantment;
    const parts = [
      e.strength ? `Força +${e.strength}` : null,
      e.intellect ? `Intelecto +${e.intellect}` : null,
      e.endurance ? `Vigor +${e.endurance}` : null,
      e.dexterity ? `Destreza +${e.dexterity}` : null,
      e.wisdom ? `Sabedoria +${e.wisdom}` : null,
      e.luck ? `Sorte +${e.luck}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" • ") : null;
  }
  if (product.type === "class" && product.gameClass) {
    return product.gameClass.requiredLevel && product.gameClass.requiredLevel > 1
      ? `Requer nível ${product.gameClass.requiredLevel} • ${product.gameClass.role || "Classe"}`
      : product.gameClass.role || "Classe";
  }
  return null;
}

export function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ShopProduct | null>(null);
  const [buying, setBuying] = useState(false);
  const [tab, setTab] = useState<TabKey>("items");
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [doneQuests, setDoneQuests] = useState<Set<string>>(new Set());
  const { user, setUser } = useAuthStore();

  useEffect(() => {
    shopApi
      .list()
      .then(({ data }) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
    questsApi
      .progress()
      .then(({ data }) => {
        if (Array.isArray(data)) {
          setDoneQuests(
            new Set(data.filter((q: any) => q.status === "completed" || q.status === "claimed").map((q: any) => q.questId))
          );
        }
      })
      .catch(() => {});
  }, []);

  const refreshUser = async () => {
    try {
      const { data } = await authApi.me();
      if (data) setUser(data);
    } catch {}
  };

  const handlePurchase = async () => {
    if (!confirm) return;
    setBuying(true);
    try {
      const { data } = await shopApi.purchase(confirm.id);
      toast.success(`Compra realizada! ${data.detail}`);
      if (data.note) toast(data.note, { icon: "🛒" });
      setConfirm(null);
      refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha na compra");
    } finally {
      setBuying(false);
    }
  };

  const vipActive = !!user?.vipUntil && new Date(user.vipUntil).getTime() > Date.now();

  const characterLevel = user?.characters?.[0]?.level ?? user?.level ?? 0;

  const questLocked = (product: ShopProduct) => {
    const ids = parseQuestIdList(product.requiredQuestIds);
    return ids.length > 0 && !ids.every((id) => doneQuests.has(id));
  };

  const levelLocked = (product: ShopProduct) =>
    Number(product.requiredLevel) > 0 && characterLevel < Number(product.requiredLevel);

  const productLocked = (product: ShopProduct) =>
    (productVip(product) && !vipActive) || questLocked(product) || levelLocked(product);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const byTab = (key: TabKey) => {
    if (key === "items") return products.filter((p) => p.type === "item");
    if (key === "classes") return products.filter((p) => p.type === "class");
    return products.filter((p) => ["diamond_pack", "vip", "pass_premium"].includes(p.type));
  };

  const currencyLabel = (currency: string) =>
    currency === "diamond" ? "diamantes" : currency === "gold" ? "de ouro" : "R$";

  const priceLabel = (product: ShopProduct) => {
    if (product.currency === "diamond") return `${product.price} 💎`;
    if (product.currency === "gold") return `${product.price} de ouro`;
    return `R$ ${(product.price / 100).toFixed(2)}`;
  };

  const enoughFor = (product: ShopProduct) => {
    if (product.currency === "diamond") return (user?.diamonds ?? 0) >= product.price;
    if (product.currency === "gold") return (user?.gold ?? 0) >= product.price;
    return true;
  };

  const productIcon = (product: ShopProduct) => {
    if (product.icon) return <EntityIcon src={product.icon} size={18} className="text-gray-300" imgClassName="w-6 h-6 object-contain" />;
    if (product.type === "item" && product.item?.icon) return <EntityIcon src={product.item.icon} size={18} className="text-gray-300" imgClassName="w-6 h-6 object-contain" />;
    if (product.type === "class" && product.gameClass?.icon) return <EntityIcon src={product.gameClass.icon} size={18} className="text-red-400" imgClassName="w-6 h-6 object-contain" />;
    if (product.type === "item") return <Package size={18} className="text-gray-400" />;
    if (product.type === "class") return <Swords size={18} className="text-red-400" />;
    return null;
  };

  const CORE_STAT_LABELS: { key: string; label: string; color: string }[] = [
    { key: "strength", label: "Força", color: "text-orange-400" },
    { key: "intellect", label: "Intelecto", color: "text-blue-400" },
    { key: "endurance", label: "Vigor", color: "text-red-400" },
    { key: "dexterity", label: "Destreza", color: "text-green-400" },
    { key: "wisdom", label: "Sabedoria", color: "text-purple-400" },
    { key: "luck", label: "Sorte", color: "text-yellow-400" },
  ];

  const craftRecipeOf = (item?: ShopItem | null) => {
    if (!item || !Array.isArray(item.craftRecipes) || item.craftRecipes.length === 0) return null;
    const r = item.craftRecipes[0];
    let ingredients: { itemName: string; quantity: number }[] = [];
    try { ingredients = JSON.parse(r.ingredients || "[]"); } catch { ingredients = []; }
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      resultQuantity: r.resultQuantity ?? 1,
      goldCost: Number(r.goldCost || 0),
      ingredients: Array.isArray(ingredients) ? ingredients : [],
    };
  };

  const renderItemDetail = (product: ShopProduct) => {
    const item = product.item;
    if (!item) return null;
    const recipe = craftRecipeOf(item);
    const enough = enoughFor(product);
    const locked = productLocked(product);
    const inGameCurrency = product.currency === "diamond" || product.currency === "gold";
    return (
      <div className="panel p-4 space-y-3 lg:sticky lg:top-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600/30 to-blue-600/20 border border-purple-500/20 flex items-center justify-center shrink-0">
            {productIcon(product) ?? <Package size={20} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display font-bold">{item.name}</p>
              {item.rarity && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md capitalize ${rarityColor[item.rarity] || "text-gray-400"}`}>
                  {item.rarity}
                </span>
              )}
              {productVip(product) && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                  <Crown size={9} /> VIP
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 capitalize">{item.type} {item.rank ? `• Rank ${item.rank}` : ""} {item.level && item.level > 1 ? `• Nv. ${item.level}` : ""}</p>
          </div>
        </div>

        <p className="text-sm text-gray-400">{item.description}</p>

        {(item.type === "weapon" || item.dps) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-dark-800/50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase">Dano (DPS)</p>
              <p className="text-sm font-mono text-orange-300">{Number(item.dps || 0).toLocaleString("pt-BR")}</p>
            </div>
            <div className="bg-dark-800/50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase">Velocidade</p>
              <p className="text-sm font-mono text-orange-300">
                {Number(item.attackSpeedMs) > 0 ? `${(Number(item.attackSpeedMs) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "2s"}
              </p>
            </div>
          </div>
        )}

        {item.type !== "consumable" && CORE_STAT_LABELS.some(({ key }) => Number((item as any)[key]) > 0) && (
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase mb-1.5">Atributos</p>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {CORE_STAT_LABELS.map(({ key, label, color }) => {
                const value = Number((item as any)[key] ?? 0);
                if (!value) return null;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className={`text-xs ${color}`}>{label}</span>
                    <span className="font-mono text-green-400">+{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recipe && (
          <div className="bg-dark-800/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-orange-400" /> Materiais de craft
            </p>
            <div className="space-y-1">
              {recipe.ingredients.length === 0 && <p className="text-[11px] text-gray-600">—</p>}
              {recipe.ingredients.map((ing) => (
                <div key={ing.itemName} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{ing.itemName}</span>
                  <span className="font-mono text-gray-400">{ing.quantity}x</span>
                </div>
              ))}
              {recipe.goldCost > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-dark-700">
                  <span className="text-yellow-300 flex items-center gap-1"><Coins size={11} /> Ouro</span>
                  <span className="font-mono text-gray-300">{recipe.goldCost.toLocaleString("pt-BR")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between bg-dark-800/50 rounded-lg p-3">
          <span className="text-xs text-gray-400">Valor</span>
          <span className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
            {product.currency === "diamond" ? <Gem size={14} className="text-cyan-300" /> : <Coins size={14} className="text-yellow-400" />}
            {priceLabel(product)}
          </span>
        </div>

        <button
          onClick={() => setConfirm(product)}
          disabled={locked || (inGameCurrency && !enough)}
          className={`w-full text-sm px-3 py-2.5 rounded-lg font-medium transition-colors ${
            locked
              ? "bg-dark-700 text-gray-500"
              : inGameCurrency
              ? enough
                ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90"
                : "bg-dark-700 text-gray-500"
              : "btn-primary"
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            {locked ? (
              <>
                <Lock size={14} />
                {questLocked(product) ? "Requer quest" : levelLocked(product) ? `Requer Nv. ${product.requiredLevel}` : "Requer VIP"}
              </>
            ) : (
              <>
                {product.currency === "diamond" ? <Gem size={14} className="text-cyan-300" /> : <Coins size={14} className="text-yellow-400" />}
                Comprar por {priceLabel(product)}
              </>
            )}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ShoppingBag size={24} className="text-purple-400" /> Loja
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5">
            <Coins size={14} className="text-yellow-400" /> {(user?.gold ?? 0).toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5">
            <Gem size={14} className="text-cyan-400" /> {user?.diamonds ?? 0}
          </span>
          {vipActive ? (
            <span className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg px-3 py-1.5">
              <Crown size={14} /> VIP até {new Date(user.vipUntil!).toLocaleDateString()}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-gray-400">
              <Crown size={14} /> Sem VIP
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-dark-600 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = byTab(t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? "bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/40 text-white" : "bg-dark-800 border border-dark-600 text-gray-400 hover:text-white"
              }`}
            >
              <Icon size={16} className={tab === t.key ? "text-purple-300" : ""} /> {t.label}
              {count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400">{count}</span>}
            </button>
          );
        })}
      </div>

      {byTab(tab).length > 0 ? (
        tab === "items" ? (
          <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {byTab("items").map((product) => {
                return (
                  <button
                    key={product.id}
                    onClick={() => setSelected(product)}
                    className={`panel p-4 text-left transition-all ${
                      selected?.id === product.id ? "border-purple-500/60 ring-1 ring-purple-500/40" : "hover:border-purple-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600/30 to-blue-600/20 border border-purple-500/20 flex items-center justify-center">
                        {productIcon(product) ?? <Package size={18} className="text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        {product.item?.rarity && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md capitalize ${rarityColor[product.item.rarity] || "text-gray-400"}`}>
                            {product.item.rarity}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-yellow-300 font-medium flex items-center gap-1">
                        {product.currency === "diamond" ? <Gem size={12} className="text-cyan-300" /> : <Coins size={12} className="text-yellow-400" />}
                        {priceLabel(product)}
                      </span>
                      <span className="text-[10px] text-gray-500">Detalhes ›</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {selected && selected.type === "item" && renderItemDetail(selected)}
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {byTab(tab).map((product) => {
            const isVip = productVip(product);
            const subtitle = productSubtitle(product);
            const enough = enoughFor(product);
            const inGameCurrency = product.currency === "diamond" || product.currency === "gold";
            const locked = productLocked(product);
            return (
              <div key={product.id} className="panel p-4 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600/30 to-blue-600/20 border border-purple-500/20 flex items-center justify-center">
                    {productIcon(product) ?? <Package size={18} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{product.name}</p>
                      {isVip && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                          <Crown size={9} /> VIP
                        </span>
                      )}
                      {product.type === "item" && product.quantity > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-dark-700 text-gray-300 rounded-md">{product.quantity}x</span>
                      )}
                      {product.type === "item" && product.item?.rarity && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md capitalize ${rarityColor[product.item.rarity] || "text-gray-400"}`}>
                          {product.item.rarity}
                        </span>
                      )}
                      {Number(product.requiredLevel) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                          Nv. {product.requiredLevel}+
                        </span>
                      )}
                      {questLocked(product) && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-sky-500/15 text-sky-300 rounded-md">
                          <Lock size={9} /> Quest
                        </span>
                      )}
                    </div>
                    {subtitle && <p className="text-[11px] text-green-400">{subtitle}</p>}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-4 flex-1">{product.description}</p>
                <button
                  onClick={() => setConfirm(product)}
                  disabled={locked || (inGameCurrency && !enough)}
                  className={`w-full text-sm px-3 py-2 rounded-lg font-medium transition-colors ${
                    locked
                      ? "bg-dark-700 text-gray-500"
                      : inGameCurrency
                      ? enough
                        ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90"
                        : "bg-dark-700 text-gray-500"
                      : "btn-primary"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {locked ? (
                      <>
                        <Lock size={14} />
                        {questLocked(product) ? "Requer quest" : levelLocked(product) ? `Requer Nv. ${product.requiredLevel}` : "Requer VIP"}
                      </>
                    ) : (
                      <>
                        {product.currency === "diamond" ? <Gem size={14} className="text-cyan-300" /> : <Coins size={14} className="text-yellow-400" />}
                        {priceLabel(product)}
                      </>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        )
      ) : (
        <div className="panel p-8 text-center text-gray-500">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-50" />
          <p>Nada aqui por enquanto.</p>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setConfirm(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-display font-bold mb-2">Confirmar compra</h3>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm text-gray-200">{confirm.name}</p>
              {productVip(confirm) && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 rounded-md">
                  <Crown size={9} /> VIP
                </span>
              )}
            </div>
            <div className="bg-dark-800/50 rounded-lg p-3 mb-4 text-sm">
              {confirm.type === "vip" && (
                <p className="text-yellow-300 flex items-center gap-1.5"><Crown size={14} /> {confirm.vipDays} dias de VIP (bônus ativos durante o período)</p>
              )}
              {confirm.type === "diamond_pack" && (
                <p className="text-cyan-300 flex items-center gap-1.5"><Gem size={14} /> +{confirm.diamondAmount} diamantes</p>
              )}
              {confirm.type === "pass_premium" && (
                <p className="text-purple-300 flex items-center gap-1.5"><Trophy size={14} /> Passe Premium da temporada</p>
              )}
              {confirm.type === "enchantment" && confirm.enchantment && (
                <p className="text-green-300 flex items-center gap-1.5"><Sparkles size={14} /> {confirm.enchantment.name} — vai para sua mochila para aplicar em equipamentos compatíveis.</p>
              )}
              {confirm.type === "item" && (
                <p className="text-blue-300 flex items-center gap-1.5"><Package size={14} /> {Math.max(1, confirm.quantity || 1)}x {confirm.item?.name || confirm.name} — vai para seu inventário.</p>
              )}
              {confirm.type === "class" && (
                <p className="text-red-300 flex items-center gap-1.5"><Swords size={14} /> {confirm.gameClass?.name || confirm.name} — desbloqueada para seus personagens.</p>
              )}
              <p className="text-gray-400 mt-2 flex items-center gap-1.5">
                {confirm.currency === "diamond" ? <Gem size={14} /> : <Coins size={14} />}
                Custo: {confirm.currency === "diamond" ? `${confirm.price} diamantes` : confirm.currency === "gold" ? `${confirm.price} de ouro` : `R$ ${(confirm.price / 100).toFixed(2)}`}
              </p>
              {confirm.currency === "diamond" && (user?.diamonds ?? 0) < confirm.price && (
                <p className="text-red-400 text-xs mt-2">Saldo insuficiente de diamantes.</p>
              )}
              {confirm.currency === "gold" && (user?.gold ?? 0) < confirm.price && (
                <p className="text-red-400 text-xs mt-2">Ouro insuficiente.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handlePurchase}
                disabled={buying || ((confirm.currency === "diamond" && (user?.diamonds ?? 0) < confirm.price) || (confirm.currency === "gold" && (user?.gold ?? 0) < confirm.price))}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {buying ? "Comprando..." : `Comprar por ${priceLabel(confirm)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
