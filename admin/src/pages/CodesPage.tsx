import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { RefreshCw, Plus, Pencil, Trash2, X, Ticket } from "lucide-react";
import JsonField from "../components/JsonField";

interface RedeemCode {
  id: string;
  code: string;
  description: string | null;
  gold: string | number;
  sfCoins: number;
  experience: string | number;
  items: any;
  maxUses: number;
  uses: number;
  isActive: boolean;
  expiresAt: string | null;
}

const emptyForm = {
  code: "",
  description: "",
  gold: 0,
  sfCoins: 0,
  experience: 0,
  items: [] as any[],
  maxUses: 500,
  isActive: true,
};

export default function CodesPage() {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RedeemCode | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.codes.list();
      setCodes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load codes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditing({ id: "", code: "", description: null, gold: 0, sfCoins: 0, experience: 0, items: [], maxUses: 500, uses: 0, isActive: true, expiresAt: null });
  };

  const openEdit = (code: RedeemCode) => {
    setEditing(code);
    setForm({
      code: code.code,
      description: code.description || "",
      gold: Number(code.gold),
      sfCoins: code.sfCoins,
      experience: Number(code.experience),
      items: Array.isArray(code.items) ? code.items : [],
      maxUses: code.maxUses,
      isActive: code.isActive,
    });
  };

  const validate = () => {
    if (!form.code.trim()) return "Code is required";
    if (!Array.isArray(form.items)) return "Items must be a list";
    for (const entry of form.items) {
      if (!entry.itemName) return 'Each reward must have "itemName"';
      if (entry.type !== "class" && !entry.quantity) return 'Each item must have "quantity"';
    }
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      gold: Number(form.gold) || 0,
      sfCoins: Number(form.sfCoins) || 0,
      experience: Number(form.experience) || 0,
      items: form.items.filter((i: any) => i.itemName || i.quantity),
      maxUses: Math.max(1, Number(form.maxUses) || 1),
      isActive: form.isActive,
    };
    try {
      if (editing?.id) {
        await adminApi.codes.update(editing.id, payload);
        toast.success("Code updated");
      } else {
        await adminApi.codes.create(payload);
        toast.success("Code created");
      }
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save code");
    }
  };

  const remove = async (code: RedeemCode) => {
    if (!window.confirm(`Delete code "${code.code}"?`)) return;
    try {
      await adminApi.codes.delete(code.id);
      toast.success("Code deleted");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete code");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ticket size={22} className="text-yellow-400" /> Redeem Codes
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-dark-800 border border-dark-600 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button onClick={openNew} className="btn-primary text-sm">
            <Plus size={14} className="inline mr-1" /> New code
          </button>
        </div>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">ID</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Code</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Description</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Gold</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">SF Coins</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">XP</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Items</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Uses</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Active</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-[11px] text-gray-500" title={c.id}>{String(c.id ?? "").slice(0, 8)}</span>
                  </td>
                  <td className="py-2.5 px-4 font-mono font-medium text-yellow-300">{c.code}</td>
                  <td className="py-2.5 px-4 text-gray-400 max-w-xs truncate">{c.description || "-"}</td>
                  <td className="py-2.5 px-4 font-mono">{Number(c.gold).toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-mono">{c.sfCoins}</td>
                  <td className="py-2.5 px-4 font-mono">{Number(c.experience).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-400">
                    {(c.items || []).length > 0
                      ? (c.items as any[]).map((i: any) => i.type === "class" ? `[CLASSE] ${i.itemName}` : `${i.itemName} x${i.quantity}`).join(", ")
                      : "-"}
                  </td>
                  <td className="py-2.5 px-4 font-mono">{c.uses}/{c.maxUses}</td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-400"}`}>
                      {c.isActive ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(c)}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mr-3"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && codes.length === 0 && (
            <p className="text-center text-gray-500 py-8">No codes found</p>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 w-full max-w-lg space-y-4 mt-10"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Edit code" : "New code"}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-gray-400">
                Code
                <input
                  className="input-rpg mt-1 w-full font-mono uppercase"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                />
              </label>
              <label className="block text-xs text-gray-400">
                Max uses
                <input
                  type="number"
                  min={1}
                  className="input-rpg mt-1 w-full"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                />
              </label>
              <label className="block col-span-2 text-xs text-gray-400">
                Description
                <input
                  className="input-rpg mt-1 w-full"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Gold
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={form.gold}
                  onChange={(e) => setForm({ ...form, gold: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                SF Coins
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={form.sfCoins}
                  onChange={(e) => setForm({ ...form, sfCoins: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Experience
                <input
                  type="number"
                  min={0}
                  className="input-rpg mt-1 w-full"
                  value={form.experience}
                  onChange={(e) => setForm({ ...form, experience: e.target.value })}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Active
                <select
                  className="input-rpg mt-1 w-full"
                  value={String(form.isActive)}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
                  <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Recompensas (itens ou classes)</label>
                <JsonField
                  schema={{
                    mode: "object-array",
                    addLabel: "Adicionar recompensa",
                    fields: [
                      { name: "type", label: "Tipo", type: "select", options: ["item", "class"] },
                      { name: "itemName", label: "Nome (Item ou Classe)", type: "text", placeholder: "Pocao de Vida / Mago" },
                      { name: "quantity", label: "Quantidade (só item)", type: "number" },
                    ],
                  }}
                  value={form.items}
                  onChange={(v) => setForm({ ...form, items: v })}
                />
                <p className="text-[11px] text-gray-500 mt-1">Tipo "class" desbloqueia a classe pelo nome exato (ex.: "Mago").</p>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">Save code</button>
          </form>
        </div>
      )}
    </div>
  );
}
