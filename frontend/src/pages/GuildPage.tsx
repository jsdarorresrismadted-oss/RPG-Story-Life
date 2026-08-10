import { useEffect, useState, useCallback } from "react";
import { guildApi, itemsApi } from "../services/api";
import { Guild, GuildShopItem, Item } from "../types";
import { Users, Shield, Plus, LogOut, Trophy, Star, Coins, Crown, ChevronUp, ChevronDown, Trash2, ShoppingCart, Gem } from "lucide-react";
import { EntityIcon } from "../components/EntityIcon";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { getSocket } from "../services/socket";

interface FullGuild extends Guild {
  members?: any[];
  bank?: any;
  shop?: GuildShopItem[];
}

export function GuildPage() {
  const { user } = useAuthStore();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [myGuild, setMyGuild] = useState<any>(null);
  const [guild, setGuild] = useState<FullGuild | null>(null);
  const [requirements, setRequirements] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", tag: "", description: "" });
  const [tab, setTab] = useState<"members" | "shop" | "info">("members");
  const [depositAmt, setDepositAmt] = useState("");
  const [shopItemId, setShopItemId] = useState("");
  const [shopPrice, setShopPrice] = useState("");
  const [allItems, setAllItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    try {
      const [guildsRes, myRes] = await Promise.all([
        guildApi.list().catch(() => ({ data: [] })),
        guildApi.mine().catch(() => ({ data: null })),
      ]);
      setGuilds(guildsRes.data);
      setMyGuild(myRes.data);
      if (myRes.data?.guildId) {
        const detail = await guildApi.get(myRes.data.guildId).catch(() => null);
        setGuild(detail?.data || null);
      } else {
        setGuild(null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      guildApi.requirements().catch(() => ({ data: null })),
      itemsApi.list().catch(() => ({ data: [] })),
    ]).then(([req, items]) => {
      setRequirements(req.data);
      setAllItems(items.data);
    });
    load();
  }, [load]);

  const refreshGuild = async (guildId: string) => {
    const detail = await guildApi.get(guildId).catch(() => null);
    if (detail) setGuild(detail.data);
    const my = await guildApi.mine().catch(() => null);
    if (my) setMyGuild(my.data);
    getSocket()?.emit("chat:refresh");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await guildApi.create(form);
      toast.success("Guild criada!");
      setShowCreate(false);
      setForm({ name: "", tag: "", description: "" });
      getSocket()?.emit("chat:refresh");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao criar guilda");
    }
  };

  const handleJoin = async (id: string) => {
    try {
      await guildApi.join(id);
      toast.success("Entrou na guilda!");
      getSocket()?.emit("chat:refresh");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao entrar");
    }
  };

  const handleLeave = async () => {
    try {
      await guildApi.leave(myGuild.guildId);
      toast.success("Você saiu da guilda");
      getSocket()?.emit("chat:refresh");
      setMyGuild(null);
      setGuild(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao sair");
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.floor(Number(depositAmt) || 0);
    if (amt <= 0) return;
    try {
      await guildApi.deposit(myGuild.guildId, amt);
      toast.success(`${amt} ouro depositado — +${amt} contribuição`);
      setDepositAmt("");
      await refreshGuild(myGuild.guildId);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha no depósito");
    }
  };

  const handlePromote = async (memberId: string) => {
    try {
      const { data } = await guildApi.promote(guild!.id, memberId);
      toast.success(data.message);
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleDemote = async (memberId: string) => {
    try {
      const { data } = await guildApi.demote(guild!.id, memberId);
      toast.success(data.message);
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleKick = async (memberId: string) => {
    try {
      await guildApi.kick(guild!.id, memberId);
      toast.success("Membro expulso");
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleRankUp = async (memberId: string) => {
    try {
      const { data } = await guildApi.rankUpMember(guild!.id, memberId);
      toast.success(data.message);
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await guildApi.addShopItem(guild!.id, { itemId: shopItemId, price: Number(shopPrice) || 100 });
      toast.success("Item adicionado ao shop da guilda");
      setShopItemId("");
      setShopPrice("");
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleRemoveShop = async (shopItemId: string) => {
    try {
      await guildApi.removeShopItem(guild!.id, shopItemId);
      toast.success("Item removido do shop");
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const handleBuyShop = async (shopItemId: string) => {
    try {
      const { data } = await guildApi.buyShopItem(guild!.id, shopItemId);
      toast.success(`Compra realizada: ${data.item}`);
      await refreshGuild(guild!.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha");
    }
  };

  const myRole = guild?.members?.find((m) => m.user?.username === user?.username)?.role
    || myGuild?.role
    || "member";
  const canManage = myRole === "leader" || myRole === "officer";
  const isLeader = myRole === "leader";
  const myContribution = Number(myGuild?.contribution || 0);
  const bankGold = Number(guild?.bank?.[0]?.gold ?? 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  // ===== Sem guilda: listar/criar/entrar =====
  if (!guild) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Users size={24} className="text-cyan-400" /> Guildas
          </h1>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Criar Guilda
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="panel p-4 space-y-3">
            {requirements && (
              <div className="bg-dark-800 border border-amber-500/30 rounded-lg p-3 text-sm">
                <p className="text-amber-300 font-medium mb-1">Requisitos para criar guilda:</p>
                <p className="text-gray-300">
                  Nível {requirements.requiredLevel} • {Number(requirements.requiredGold).toLocaleString()} Ouro • {Number(requirements.requiredDiamonds).toLocaleString()} Diamantes
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-rpg" placeholder="Nome da guilda" required />
              <input value={form.tag} onChange={e => setForm({...form, tag: e.target.value})} className="input-rpg" placeholder="TAG" maxLength={5} required />
            </div>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-rpg" placeholder="Descrição" rows={2} required />
            <button type="submit" className="btn-primary w-full">Criar Guilda</button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {guilds.map(g => (
            <div key={g.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-lg">{g.name}</h3>
                  <p className="text-xs text-gray-500">[{g.tag}] • Nível {g.level}</p>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Users size={14} className="text-gray-500" />
                  <span>{g.memberCount}/{g.maxMembers}</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 line-clamp-2 mb-3">{g.description}</p>
              <button onClick={() => handleJoin(g.id)} className="btn-secondary w-full text-sm">
                Entrar
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===== Com guilda: dashboard =====
  const roleBadge = (role: string) => {
    if (role === "leader") return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-px"><Crown size={10} /> Líder</span>;
    if (role === "officer") return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded px-1.5 py-px"><Star size={10} /> Oficial</span>;
    return <span className="text-[10px] font-bold text-gray-500 bg-dark-800 border border-dark-600 rounded px-1.5 py-px">Membro</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Users size={24} className="text-cyan-400" /> {guild.name}
        </h1>
        <button onClick={handleLeave} className="btn-danger flex items-center gap-2">
          <LogOut size={16} /> Sair
        </button>
      </div>

      {/* Resumo */}
      <div className="panel p-4 border-cyan-500/30 bg-cyan-500/5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400">Nível</p>
            <p className="font-display font-bold text-xl flex items-center gap-2"><Trophy size={16} className="text-amber-400" /> {guild.level}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Membros</p>
            <p className="font-display font-bold text-xl">{guild.memberCount}/{guild.maxMembers}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Cofre</p>
            <p className="font-display font-bold text-xl flex items-center gap-2"><Coins size={16} className="text-yellow-400" /> {bankGold.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Minha contribuição</p>
            <p className="font-display font-bold text-xl flex items-center gap-2"><Gem size={16} className="text-cyan-400" /> {myContribution.toLocaleString()}</p>
          </div>
        </div>

        {/* Depósito */}
        <form onSubmit={handleDeposit} className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <label className="text-xs text-gray-400 shrink-0">Depositar ouro (1 ouro = 1 contribuição):</label>
          <input
            value={depositAmt}
            onChange={e => setDepositAmt(e.target.value)}
            type="number" min={1}
            className="input-rpg w-40"
            placeholder="Quantidade"
          />
          <button type="submit" className="btn-secondary text-sm">Depositar</button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab("members")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "members" ? "bg-purple-600 text-white" : "bg-dark-800 text-gray-400 hover:bg-dark-700"}`}>Membros</button>
        <button onClick={() => setTab("shop")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "shop" ? "bg-purple-600 text-white" : "bg-dark-800 text-gray-400 hover:bg-dark-700"}`}>Shop da Guilda</button>
        <button onClick={() => setTab("info")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "info" ? "bg-purple-600 text-white" : "bg-dark-800 text-gray-400 hover:bg-dark-700"}`}>Sobre</button>
      </div>

      {tab === "members" && (
        <div className="panel p-4 space-y-2">
          <h2 className="font-display font-bold text-lg flex items-center gap-2"><Shield size={18} className="text-purple-400" /> Membros</h2>
          {guild.members?.map((m) => {
            const mRole = m.role || m.user?.role || "member";
            const isSelf = m.user?.username === user?.username;
            return (
              <div key={m.id} className="flex items-center justify-between bg-dark-800/50 border border-dark-600 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-xs font-bold text-amber-300">{m.rank ?? m.guildRank ?? 1}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-sm truncate ${isSelf ? "text-purple-300" : "text-gray-200"}`}>
                        {m.user?.displayName || m.user?.username}
                      </p>
                      {roleBadge(mRole)}
                    </div>
                    <p className="text-xs text-gray-500">Nível {m.user?.level} • Contribuição {Number(m.contribution || 0).toLocaleString()}</p>
                  </div>
                </div>
                {canManage && !isSelf && mRole !== "leader" && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRankUp(m.userId)} title="Subir rank" className="p-1.5 bg-dark-700 hover:bg-dark-600 rounded text-amber-300">
                      <ChevronUp size={14} />
                    </button>
                    {isLeader && (
                      <>
                        {mRole === "member" ? (
                          <button onClick={() => handlePromote(m.userId)} title="Promover a Oficial" className="p-1.5 bg-dark-700 hover:bg-dark-600 rounded text-purple-300">
                            <Star size={14} />
                          </button>
                        ) : (
                          <button onClick={() => handleDemote(m.userId)} title="Rebaixar a Membro" className="p-1.5 bg-dark-700 hover:bg-dark-600 rounded text-gray-400">
                            <ChevronDown size={14} />
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => handleKick(m.userId)} title="Expulsar" className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "shop" && (
        <div className="panel p-4 space-y-4">
          <h2 className="font-display font-bold text-lg flex items-center gap-2"><ShoppingCart size={18} className="text-cyan-400" /> Shop da Guilda</h2>
          <p className="text-xs text-gray-400">Compre itens usando seus pontos de contribuição. O líder e oficiais adicionam itens ao shop.</p>

          {canManage && (
            <form onSubmit={handleAddShop} className="flex flex-col sm:flex-row gap-2 bg-dark-800/50 border border-dark-600 rounded-lg p-3">
              <select value={shopItemId} onChange={e => setShopItemId(e.target.value)} className="input-rpg flex-1" required>
                <option value="">Selecione um item...</option>
                {allItems.map((it) => (
                  <option key={it.id} value={it.id}>{it.name} (Nv {it.level})</option>
                ))}
              </select>
              <input value={shopPrice} onChange={e => setShopPrice(e.target.value)} type="number" min={1} className="input-rpg w-36" placeholder="Preço (contribuição)" required />
              <button type="submit" className="btn-primary text-sm shrink-0"><Plus size={14} /> Adicionar</button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {guild.shop?.map((s) => (
              <div key={s.id} className="card p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="w-10 h-10 bg-dark-800 rounded-lg flex items-center justify-center text-xl">{s.item?.icon ? <EntityIcon src={s.item.icon} className="text-white" imgClassName="w-8 h-8 object-contain" /> : "🎁"}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{s.item?.name}</p>
                    <p className="text-xs text-gray-500">Nível {s.item?.level} • {s.item?.type}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1"><Gem size={12} /> {Number(s.price).toLocaleString()}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleBuyShop(s.id)} className="btn-primary text-xs px-3 py-1">Comprar</button>
                    {canManage && (
                      <button onClick={() => handleRemoveShop(s.id)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded text-red-400">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!guild.shop || guild.shop.length === 0) && (
              <p className="text-sm text-gray-500 col-span-full">O shop da guilda ainda está vazio.</p>
            )}
          </div>
        </div>
      )}

      {tab === "info" && (
        <div className="panel p-4 space-y-3">
          <h2 className="font-display font-bold text-lg">Sobre a guilda</h2>
          <p className="text-gray-300">{guild.description}</p>
          <p className="text-sm text-gray-500">Criada para aventureiros unidos. Contribua com ouro para subir de rank e ganhar pontos no shop.</p>
        </div>
      )}
    </div>
  );
}
