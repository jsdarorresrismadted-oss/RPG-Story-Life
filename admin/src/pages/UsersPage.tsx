import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { RefreshCw, ShieldCheck, ShieldOff, Trash2, Pencil, X, Plus, Minus, Eye, Trophy } from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  level: number;
  experience?: string | number;
  gold: string | number;
  sfCoins: number;
  pvpCoins: number;
  gc: number;
  isOnline: boolean;
  isBanned: boolean;
  createdAt: string;
  _count?: { characters: number };
}

interface AdminCharacter {
  id: string;
  name: string;
  level: number;
  experience: string | number;
  classId: string;
  class: { id: string; name: string; slug: string };
  classProgress?: {
    id: string;
    rank: number;
    isActive: boolean;
    gameClass: { id: string; name: string; slug: string };
  }[];
}

interface AdminInventoryEntry {
  id: string;
  quantity: number;
  isEquipped: boolean;
  item: { id: string; name: string; type: string; rarity: string };
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [addItemName, setAddItemName] = useState("");
  const [addItemQty, setAddItemQty] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.users.list();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadClasses = async () => {
    try {
      const { data } = await adminApi.classes.list();
      setClasses(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadClasses();
  }, []);

  const toggleAdmin = async (user: AdminUser) => {
    const newRole = user.role === "admin" ? "player" : "admin";
    try {
      await adminApi.users.update(user.id, { role: newRole });
      toast.success(`${user.username} is now ${newRole}`);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update role");
    }
  };

  const toggleBan = async (user: AdminUser) => {
    try {
      await adminApi.users.update(user.id, { isBanned: !user.isBanned });
      toast.success(`${user.username} ${user.isBanned ? "unbanned" : "banned"}`);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update ban");
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Delete user "${user.username}"? This removes all their characters, inventory and data.`)) return;
    try {
      await adminApi.users.delete(user.id);
      toast.success(`${user.username} deleted`);
      if (detail?.id === user.id) setDetail(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete user");
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await adminApi.users.update(editing.id, {
        displayName: editing.displayName,
        email: editing.email,
        role: editing.role,
        level: Number(editing.level),
        experience: Number(editing.experience ?? 0),
        gold: Number(editing.gold),
        sfCoins: Number(editing.sfCoins),
        pvpCoins: Number(editing.pvpCoins),
        gc: Number(editing.gc),
        isBanned: editing.isBanned,
      });
      toast.success("User updated");
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update user");
    }
  };

  const openDetail = async (user: AdminUser) => {
    setDetail(user);
    try {
      const { data } = await adminApi.users.get(user.id);
      setDetailData(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load user details");
    }
  };

  const updateChar = (id: string, patch: Partial<AdminCharacter>) => {
    setDetailData((d: any) => ({
      ...d,
      characters: (d.characters || []).map((c: AdminCharacter) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    }));
  };

  const saveCharacter = async (char: AdminCharacter) => {
    if (!detail) return;
    try {
      await adminApi.users.characters.update(detail.id, char.id, {
        name: char.name,
        level: Number(char.level),
        experience: Number(char.experience ?? 0),
        classId: char.classId,
      });
      toast.success("Character updated");
      openDetail(detail);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update character");
    }
  };

  const addInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !addItemName.trim()) return;
    try {
      await adminApi.users.inventory.add(detail.id, {
        itemName: addItemName.trim(),
        quantity: Number(addItemQty) || 1,
      });
      toast.success("Item added");
      setAddItemName("");
      setAddItemQty(1);
      openDetail(detail);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add item");
    }
  };

  const removeInventory = async (entry: AdminInventoryEntry) => {
    if (!detail) return;
    if (!window.confirm(`Remove ${entry.quantity}x ${entry.item.name}?`)) return;
    try {
      await adminApi.users.inventory.remove(detail.id, entry.id);
      toast.success("Item removed");
      openDetail(detail);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to remove item");
    }
  };

  const rankMax = async (char: AdminCharacter) => {
    if (!detail) return;
    if (!window.confirm(`Set ALL classes of "${char.name}" to max rank (10)?`)) return;
    try {
      await adminApi.users.characters.rankMax(detail.id, char.id);
      toast.success(`${char.name}: all classes at rank 10`);
      openDetail(detail);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to set max rank");
    }
  };

  const modalBg = "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-dark-800 border border-dark-600 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">User</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Role</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Level</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Gold</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">SF Coins</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">PVP</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">GC</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Characters</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Joined</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                  <td className="py-2.5 px-4">
                    <button className="text-left hover:text-accent-400" onClick={() => openDetail(u)}>
                      <p className="font-medium text-white">{u.username}</p>
                      <p className="text-xs text-gray-500">{u.email || u.displayName || "-"}</p>
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === "admin" || u.role === "owner"
                          ? "bg-accent-500/20 text-accent-400"
                          : "bg-gray-600/20 text-gray-400"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">{u.level}</td>
                  <td className="py-2.5 px-4 font-mono">{Number(u.gold).toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-mono">{u.sfCoins}</td>
                  <td className="py-2.5 px-4 font-mono">{u.pvpCoins}</td>
                  <td className="py-2.5 px-4 font-mono">{u.gc}</td>
                  <td className="py-2.5 px-4">{u._count?.characters ?? 0}</td>
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${u.isOnline ? "bg-green-500" : "bg-gray-600"}`} />
                      {u.isBanned ? (
                        <span className="text-red-400">Banned</span>
                      ) : u.isOnline ? (
                        <span className="text-green-400">Online</span>
                      ) : (
                        <span className="text-gray-500">Offline</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => openDetail(u)}
                      title="View inventory, classes and details"
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white mr-3"
                    >
                      <Eye size={14} /> Details
                    </button>
                    <button
                      onClick={() => setEditing(u)}
                      title="Edit user"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mr-3"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      onClick={() => toggleAdmin(u)}
                      className="inline-flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 mr-3"
                    >
                      {u.role === "admin" ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                      {u.role === "admin" ? "Revoke admin" : "Make admin"}
                    </button>
                    <button
                      onClick={() => toggleBan(u)}
                      className={`text-xs mr-3 ${u.isBanned ? "text-green-400 hover:text-green-300" : "text-red-400 hover:text-red-300"}`}
                    >
                      {u.isBanned ? "Unban" : "Ban"}
                    </button>
                    <button
                      onClick={() => deleteUser(u)}
                      title="Delete user"
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && users.length === 0 && (
            <p className="text-center text-gray-500 py-8">No users found</p>
          )}
        </div>
      </div>

      {editing && (
        <div className={modalBg} onClick={() => setEditing(null)}>
          <form
            onSubmit={saveEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 w-full max-w-lg space-y-4 mt-10"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit {editing.username}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2 text-xs text-gray-400">
                Display name
                <input
                  className="input-rpg mt-1 w-full"
                  value={editing.displayName || ""}
                  onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Email
                <input
                  className="input-rpg mt-1 w-full"
                  value={editing.email || ""}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Role
                <select
                  className="input-rpg mt-1 w-full"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                >
                  <option value="player">player</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              </label>
              <label className="block text-xs text-gray-400">
                Level
                <input
                  type="number"
                  min={1}
                  className="input-rpg mt-1 w-full"
                  value={editing.level}
                  onChange={(e) => setEditing({ ...editing, level: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Experience
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={Number(editing.experience ?? 0)}
                  onChange={(e) => setEditing({ ...editing, experience: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Gold
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={Number(editing.gold)}
                  onChange={(e) => setEditing({ ...editing, gold: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                SF Coins
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={editing.sfCoins}
                  onChange={(e) => setEditing({ ...editing, sfCoins: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                PVP Coins
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={editing.pvpCoins}
                  onChange={(e) => setEditing({ ...editing, pvpCoins: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                GC
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={editing.gc}
                  onChange={(e) => setEditing({ ...editing, gc: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={editing.isBanned}
                onChange={(e) => setEditing({ ...editing, isBanned: e.target.checked })}
              />
              Banned
            </label>
            <button type="submit" className="btn-primary w-full">Save changes</button>
          </form>
        </div>
      )}

      {detail && (
        <div className={modalBg} onClick={() => setDetail(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 w-full max-w-3xl space-y-5 mt-10"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {detail.username}
                <span className="text-sm font-normal text-gray-500 ml-3">
                  Level {detailData?.level ?? detail.level} - {Number(detailData?.gold ?? detail.gold).toLocaleString()} gold - {detailData?.sfCoins ?? detail.sfCoins} SF Coins - {detailData?.pvpCoins ?? detail.pvpCoins} PVP - {detailData?.gc ?? detail.gc} GC
                </span>
              </h2>
              <button type="button" onClick={() => setDetail(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Characters ({detailData?.characters?.length ?? 0})</h3>
              {(!detailData?.characters || detailData.characters.length === 0) && (
                <p className="text-sm text-gray-500">No characters</p>
              )}
              <div className="space-y-3">
                {(detailData?.characters || []).map((c: AdminCharacter) => (
                  <div key={c.id} className="border border-dark-600 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.class?.name}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="block text-[11px] text-gray-400 col-span-2">
                        Name
                        <input
                          className="input-rpg mt-1 w-full text-sm"
                          value={c.name}
                          onChange={(e) => updateChar(c.id, { name: e.target.value })}
                        />
                      </label>
                      <label className="block text-[11px] text-gray-400">
                        Level
                        <input
                          type="number"
                          min={1}
                          className="input-rpg mt-1 w-full text-sm"
                          value={c.level}
                          onChange={(e) => updateChar(c.id, { level: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[11px] text-gray-400">
                        XP
                        <input
                          type="number"
                          min={0}
                          className="input-rpg mt-1 w-full text-sm"
                          value={Number(c.experience ?? 0)}
                          onChange={(e) => updateChar(c.id, { experience: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[11px] text-gray-400 col-span-2 sm:col-span-1">
                        Class
                        <select
                          className="input-rpg mt-1 w-full text-sm"
                          value={c.classId}
                          onChange={(e) => updateChar(c.id, { classId: e.target.value })}
                        >
                          {classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => saveCharacter(c)}
                        className="col-span-2 sm:col-span-1 px-3 py-2 text-xs bg-accent-500/20 text-accent-300 rounded-lg hover:bg-accent-500/30"
                      >
                        Save
                      </button>
                    </div>
                    {c.classProgress && c.classProgress.length > 0 && (
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-dark-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.classProgress.map((p) => (
                            <span
                              key={p.id}
                              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${
                                p.isActive
                                  ? "bg-accent-500/15 border-accent-500/40 text-accent-300"
                                  : "bg-dark-900 border-dark-600 text-gray-400"
                              }`}
                            >
                              {p.gameClass?.name || "?"}
                              <span className="font-mono">R{p.rank}</span>
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => rankMax(c)}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/20"
                          title="Set all classes to max rank (10)"
                        >
                          <Trophy size={12} /> Rank máx
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Inventory ({detailData?.inventory?.length ?? 0})</h3>
              <form onSubmit={addInventory} className="flex gap-2 mb-3">
                <input
                  className="input-rpg flex-1 text-sm"
                  placeholder="Item name (ex: Espada de Ferro)"
                  value={addItemName}
                  onChange={(e) => setAddItemName(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  className="input-rpg w-20 text-sm"
                  value={addItemQty}
                  onChange={(e) => setAddItemQty(Number(e.target.value))}
                />
                <button type="submit" className="btn-primary text-sm">
                  <Plus size={14} className="inline mr-1" /> Add
                </button>
              </form>
              {(!detailData?.inventory || detailData.inventory.length === 0) && (
                <p className="text-sm text-gray-500">Empty inventory</p>
              )}
              <div className="space-y-1.5">
                {(detailData?.inventory || []).map((inv: AdminInventoryEntry) => (
                  <div key={inv.id} className="flex items-center justify-between border border-dark-600 rounded-lg px-3 py-2">
                    <p className="text-sm text-white">
                      {inv.item.name}
                      <span className="text-xs text-gray-500 ml-2">
                        x{inv.quantity} · {inv.item.type} · {inv.item.rarity}
                      </span>
                    </p>
                    <button
                      onClick={() => removeInventory(inv)}
                      className="text-red-400 hover:text-red-300"
                      title="Remove"
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
