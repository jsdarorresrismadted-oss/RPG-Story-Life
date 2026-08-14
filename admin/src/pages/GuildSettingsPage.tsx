import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Save, RefreshCw, Swords, Plus, Trash2, ShoppingCart, Trophy, Users } from "lucide-react";

interface GuildSettings {
  requiredLevel: number;
  requiredGold: number;
  requiredSfCoins: number;
}

interface GuildLite {
  id: string;
  name: string;
  tag: string;
  level: number;
  memberCount: number;
}

interface ShopEntry {
  id: string;
  item: { id: string; name: string; icon?: string | null; type?: string; level?: number; rarity?: string } | null;
  price: string | number;
}

interface QuestEntry {
  id: string;
  title: string;
  description: string;
  type: string;
  targetName: string;
  targetCount: number;
  xpReward: string | number;
  goldReward: string | number;
  gcReward: string | number;
  expiresAt: string;
  completedCount: number;
  claimedCount: number;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

export default function GuildSettingsPage() {
  const [settings, setSettings] = useState<GuildSettings>({ requiredLevel: 2, requiredGold: 200, requiredSfCoins: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [guilds, setGuilds] = useState<GuildLite[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [allItems, setAllItems] = useState<any[]>([]);
  const [itemIdToAdd, setItemIdToAdd] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [addingShop, setAddingShop] = useState(false);
  const [shopItems, setShopItems] = useState<ShopEntry[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [quests, setQuests] = useState<QuestEntry[]>([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.settings.guild();
      setSettings({
        requiredLevel: Number(data.requiredLevel ?? 2),
        requiredGold: Number(data.requiredGold ?? 200),
        requiredSfCoins: Number(data.requiredSfCoins ?? 0),
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadGuilds = async () => {
    setGuildsLoading(true);
    try {
      const { data } = await adminApi.guilds.list();
      setGuilds(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load guilds");
    } finally {
      setGuildsLoading(false);
    }
  };

  const loadAllItems = async () => {
    try {
      const { data } = await adminApi.items.list();
      setAllItems(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadShop = async (guildId: string) => {
    if (!guildId) return setShopItems([]);
    setShopLoading(true);
    try {
      const { data } = await adminApi.guilds.shop.list(guildId);
      setShopItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load guild shop");
    } finally {
      setShopLoading(false);
    }
  };

  const loadQuests = async (guildId: string) => {
    if (!guildId) return setQuests([]);
    setQuestsLoading(true);
    try {
      const { data } = await adminApi.guilds.quests.list(guildId);
      setQuests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load guild quests");
    } finally {
      setQuestsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadGuilds();
    loadAllItems();
  }, []);

  useEffect(() => {
    loadShop(selectedGuildId);
    loadQuests(selectedGuildId);
  }, [selectedGuildId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.settings.updateGuild({
        requiredLevel: Number(settings.requiredLevel),
        requiredGold: Number(settings.requiredGold),
        requiredSfCoins: Number(settings.requiredSfCoins),
      });
      toast.success("Guild requirements saved");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAddShopItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedGuildId || !itemIdToAdd) return;
    setAddingShop(true);
    try {
      await adminApi.guilds.shop.add(selectedGuildId, { itemId: itemIdToAdd, price: Number(itemPrice) || 100 });
      toast.success("Item adicionado ao shop da guilda");
      setItemIdToAdd("");
      setItemPrice("");
      await loadShop(selectedGuildId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add item");
    } finally {
      setAddingShop(false);
    }
  };

  const handleRemoveShopItem = async (shopItemId: string) => {
    if (!selectedGuildId) return;
    try {
      await adminApi.guilds.shop.remove(selectedGuildId, shopItemId);
      toast.success("Item removido do shop da guilda");
      await loadShop(selectedGuildId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to remove item");
    }
  };

  const handleRegenerate = async () => {
    if (!selectedGuildId) return;
    setRegenerating(true);
    try {
      const { data } = await adminApi.guilds.quests.regenerate(selectedGuildId);
      toast.success(data.message || "Quests regeneradas");
      await loadQuests(selectedGuildId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to regenerate quests");
    } finally {
      setRegenerating(false);
    }
  };

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Swords size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Guild Settings</h1>
            <p className="text-sm text-gray-500">Requirements, guild shop (staff) and guild quests</p>
          </div>
        </div>
        <button
          onClick={() => {
            load();
            loadGuilds();
          }}
          disabled={loading || guildsLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-dark-800 border border-dark-600 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading || guildsLoading ? "animate-spin" : ""} />
          Reload
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-600 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Requisitos para criar guilda</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required Level</label>
            <input
              type="number"
              min={0}
              value={settings.requiredLevel}
              onChange={(e) => setSettings({ ...settings, requiredLevel: Number(e.target.value) })}
              className={inputClass}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Minimum player level to create a guild</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required Gold</label>
            <input
              type="number"
              min={0}
              value={settings.requiredGold}
              onChange={(e) => setSettings({ ...settings, requiredGold: Number(e.target.value) })}
              className={inputClass}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Gold required to create a guild</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required SF Coins</label>
            <input
              type="number"
              min={0}
              value={settings.requiredSfCoins}
              onChange={(e) => setSettings({ ...settings, requiredSfCoins: Number(e.target.value) })}
              className={inputClass}
              required
            />
            <p className="text-xs text-gray-500 mt-1">SF Coins required to create a guild</p>
          </div>
        </div>

        <div className="bg-dark-900/50 border border-dark-600 rounded-lg p-4 text-sm text-gray-400">
          Players below these requirements will see an error when trying to create a guild.
          Changes apply immediately to all players.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-cyan-400" />
            <h2 className="text-lg font-bold">Shop da Guilda &amp; Quests</h2>
          </div>
          <select
            value={selectedGuildId}
            onChange={(e) => setSelectedGuildId(e.target.value)}
            className={inputClass + " sm:w-80"}
          >
            <option value="">Selecione uma guilda...</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} [{g.tag}] • Nv {g.level} • {g.memberCount} membros
              </option>
            ))}
          </select>
        </div>

        {!selectedGuild && (
          <p className="text-sm text-gray-500">Escolha uma guilda acima para gerenciar o shop (itens colocados pelo staff) e ver as quests ativas.</p>
        )}

        {selectedGuild && (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart size={15} className="text-cyan-400" /> Shop da Guilda — {selectedGuild.name} (preço em GC)
              </h3>

              <form onSubmit={handleAddShopItem} className="flex flex-col sm:flex-row gap-2 bg-dark-900/50 border border-dark-600 rounded-lg p-3">
                <select value={itemIdToAdd} onChange={(e) => setItemIdToAdd(e.target.value)} className={inputClass + " flex-1"} required>
                  <option value="">Selecione um item...</option>
                  {allItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} (Nv {it.level} • {it.type})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  className={inputClass + " sm:w-36"}
                  placeholder="Preço (GC)"
                  required
                />
                <button type="submit" disabled={addingShop} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0">
                  <Plus size={14} />
                  {addingShop ? "Adicionando..." : "Adicionar"}
                </button>
              </form>

              {shopLoading ? (
                <p className="text-sm text-gray-500">Carregando shop...</p>
              ) : shopItems.length === 0 ? (
                <p className="text-sm text-gray-500">O shop desta guilda está vazio — adicione itens acima.</p>
              ) : (
                <div className="space-y-2">
                  {shopItems.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-dark-900/50 border border-dark-600 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg">{s.item?.icon ? "🛡️" : "🎁"}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{s.item?.name ?? "Item removido"}</p>
                          <p className="text-xs text-gray-500">Nível {s.item?.level ?? "-"} • {s.item?.type ?? "-"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-emerald-300">{Number(s.price).toLocaleString()} GC</span>
                        <button
                          onClick={() => handleRemoveShopItem(s.id)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded text-red-400"
                          title="Remover do shop"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <Trophy size={15} className="text-emerald-400" /> Quests da Guilda — {selectedGuild.name}
                </h3>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating || questsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
                  {regenerating ? "Gerando..." : "Gerar novo lote"}
                </button>
              </div>

              {questsLoading ? (
                <p className="text-sm text-gray-500">Carregando quests...</p>
              ) : quests.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma quest ativa. Clique em "Gerar novo lote".</p>
              ) : (
                <div className="space-y-2">
                  {quests.map((q) => (
                    <div key={q.id} className="bg-dark-900/50 border border-dark-600 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white truncate">{q.title}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-dark-700 text-gray-300 shrink-0">
                          {q.type === "kill" ? "Caçada" : q.type === "collect" ? "Coleta" : "PvP"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{q.description}</p>
                      <div className="flex items-center justify-between text-xs mt-1.5">
                        <span className="text-gray-400">
                          Progresso: <span className="font-mono text-gray-200">{q.completedCount}/{q.targetCount} membros concluíram</span> • <span className="font-mono text-emerald-300">{q.claimedCount}</span> resgataram
                        </span>
                        <span className="flex items-center gap-2 text-gray-400">
                          <span className="text-emerald-300">{Number(q.gcReward).toLocaleString()} GC</span>
                          <span className="text-purple-300">{Number(q.xpReward).toLocaleString()} XP</span>
                          <span className="text-yellow-300">{Number(q.goldReward).toLocaleString()} ouro</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}