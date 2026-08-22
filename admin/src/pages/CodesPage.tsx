import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Plus, Pencil, Trash2, X, Ticket } from "lucide-react";
import { adminApi } from "../api";
import { useCrudList } from "../lib/useCrud";
import { DataTable, DataTableColumn } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { SearchInput } from "../components/SearchInput";
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
  const { items: codes, loading, reload } = useCrudList("codes", () => adminApi.codes.list());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [editing, setEditing] = useState<RedeemCode | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RedeemCode | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return codes;
    const q = search.toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );
  }, [codes, search]);

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
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save code");
    }
  };

  const askDelete = (code: RedeemCode) => {
    setConfirmText("");
    setDeleteTarget(code);
  };

  const confirmDeleteCode = async () => {
    if (!deleteTarget) return;
    if (confirmText.trim().toUpperCase() !== deleteTarget.code.trim().toUpperCase()) return;
    try {
      await adminApi.codes.delete(deleteTarget.id);
      toast.success("Code deleted");
      setDeleteTarget(null);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete code");
    }
  };

  const columns: DataTableColumn[] = [
    {
      key: "id",
      label: "ID",
      render: (v: string) => (
        <span className="font-mono text-[11px] text-gray-500" title={v}>{String(v ?? "").slice(0, 8)}</span>
      ),
    },
    { key: "code", label: "Code", render: (v: string) => <span className="font-mono font-medium text-yellow-300">{v}</span> },
    { key: "description", label: "Description", render: (v: string) => <span className="text-gray-400 max-w-xs truncate block">{v || "-"}</span> },
    { key: "gold", label: "Gold", render: (v: any) => <span className="font-mono">{Number(v).toLocaleString()}</span> },
    { key: "sfCoins", label: "SF Coins", render: (v: any) => <span className="font-mono">{v}</span> },
    { key: "experience", label: "XP", render: (v: any) => <span className="font-mono">{Number(v).toLocaleString()}</span> },
    {
      key: "items",
      label: "Items",
      render: (_v: any, item: RedeemCode) => (
        <span className="text-xs text-gray-400">
          {(item.items || []).length > 0
            ? (item.items as any[]).map((i: any) => i.type === "class" ? `[CLASSE] ${i.itemName}` : `${i.itemName} x${i.quantity}`).join(", ")
            : "-"}
        </span>
      ),
    },
    { key: "uses", label: "Uses", render: (v: any, item: RedeemCode) => <span className="font-mono">{item.uses}/{item.maxUses}</span> },
    {
      key: "isActive",
      label: "Active",
      render: (v: boolean) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-400"}`}>
          {v ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ticket size={22} className="text-yellow-400" /> Redeem Codes
        </h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Buscar código..." />
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
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

      <DataTable
        columns={columns}
        rows={filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
        loading={loading}
        emptyMessage="No codes found"
        rowActions={(c) => (
          <>
            <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mr-3">
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => askDelete(c)} className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      />
      <Pagination
        page={page}
        pageCount={Math.ceil(filtered.length / PAGE_SIZE)}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />

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
    {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setDeleteTarget(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-red-500/40 rounded-xl p-6 w-full max-w-md space-y-4 mt-10"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <Trash2 size={18} /> Delete code
              </h2>
              <button type="button" onClick={() => setDeleteTarget(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-300">
              Excluir o código <span className="text-yellow-300 font-mono font-medium">{deleteTarget.code}</span>?
              Quem ainda não resgatou não poderá mais usar. <span className="text-red-400">Essa ação não pode ser desfeita.</span>
            </p>
            <label className="block text-xs text-gray-400">
              Digite o código para confirmar
              <input
                autoFocus
                className="input-rpg mt-1 w-full font-mono uppercase"
                placeholder={deleteTarget.code}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmText.trim().toUpperCase() === deleteTarget.code.trim().toUpperCase()) {
                    confirmDeleteCode();
                  }
                }}
              />
            </label>
            <button
              onClick={confirmDeleteCode}
              disabled={confirmText.trim().toUpperCase() !== deleteTarget.code.trim().toUpperCase()}
              className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Excluir definitivamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
