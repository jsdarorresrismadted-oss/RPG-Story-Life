import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

interface Monster {
  id: string;
  name: string;
  level: number;
  isBoss?: boolean;
}

interface Item {
  id: string;
  name: string;
  icon?: string | null;
  rarity?: string;
}

interface DropRow {
  id: string;
  itemId: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
  minLevel: number;
  maxLevel: number;
  isGuaranteed: boolean;
  item?: Item;
}

const DEFAULT_FORM = {
  itemId: "",
  dropChance: 10,
  minQuantity: 1,
  maxQuantity: 1,
  minLevel: 1,
  maxLevel: 99,
  isGuaranteed: false,
};

export default function MonsterDropsPage() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Monster | null>(null);
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDrops, setLoadingDrops] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({ ...DEFAULT_FORM });
  const [editing, setEditing] = useState<DropRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [monstersRes, itemsRes] = await Promise.all([
        adminApi.monsters.list(),
        adminApi.items.list(),
      ]);
      setMonsters(Array.isArray(monstersRes.data) ? monstersRes.data : []);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
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

  const loadDrops = async (monsterId: string) => {
    setLoadingDrops(true);
    try {
      const res = await adminApi.monsters.drops.list(monsterId);
      setDrops(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load drops");
    } finally {
      setLoadingDrops(false);
    }
  };

  const filteredMonsters = useMemo(() => {
    if (!filter.trim()) return monsters;
    const q = filter.toLowerCase();
    return monsters.filter((m) => m.name.toLowerCase().includes(q));
  }, [monsters, filter]);

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setEditing(null);
  };

  const openEdit = (d: DropRow) => {
    setEditing(d);
    setForm({
      itemId: d.itemId,
      dropChance: Number(d.dropChance) ?? 10,
      minQuantity: Number(d.minQuantity) || 1,
      maxQuantity: Number(d.maxQuantity) || 1,
      minLevel: Number(d.minLevel) || 1,
      maxLevel: Number(d.maxLevel) || 99,
      isGuaranteed: !!d.isGuaranteed,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !form.itemId) {
      toast.error("Escolha um item");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        itemId: form.itemId,
        dropChance: Number(form.dropChance) ?? 1,
        minQuantity: Number(form.minQuantity) || 1,
        maxQuantity: Number(form.maxQuantity) || 1,
        minLevel: Number(form.minLevel) || 1,
        maxLevel: Number(form.maxLevel) || 99,
        isGuaranteed: !!form.isGuaranteed,
      };
      if (editing?.id) {
        await adminApi.monsters.drops.update(editing.id, payload);
        toast.success("Drop atualizado");
      } else {
        await adminApi.monsters.drops.create(selected.id, payload);
        toast.success("Drop adicionado");
      }
      resetForm();
      await loadDrops(selected.id);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: DropRow) => {
    if (!window.confirm(`Remover o drop "${d.item?.name ?? d.itemId}" de "${selected?.name}"?`)) return;
    try {
      await adminApi.monsters.drops.delete(d.id);
      toast.success("Removido");
      if (selected) await loadDrops(selected.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Drops de Monstros</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quais itens cada monstro dropa e a taxa (%). A taxa de drop é controlada aqui.
          </p>
        </div>
        <button onClick={load} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Lista de monstros */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit">
          <div className="p-4 border-b border-dark-600">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar monstro..."
              className={inputClass}
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && <p className="text-center text-gray-500 py-8">Loading...</p>}
            {!loading && filteredMonsters.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum monstro — crie um na página Monsters</p>
            )}
            {filteredMonsters.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelected(m);
                  loadDrops(m.id);
                  resetForm();
                }}
                className={`w-full text-left px-4 py-3 border-b border-dark-700 transition-colors ${
                  selected?.id === m.id ? "bg-accent-600/20 border-l-2 border-l-accent-500" : "hover:bg-dark-700/50"
                }`}
              >
                <span className="font-medium text-white block">{m.name}</span>
                <span className="text-xs text-gray-500">
                  Nv {m.level}{m.isBoss ? " • BOSS" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhes do monstro selecionado */}
        {selected ? (
          <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">{selected.name}</h3>
                <p className="text-xs text-gray-500">Itens que este monstro dropa</p>
              </div>
              <button onClick={resetForm} className="text-xs text-accent-400 hover:text-accent-300">
                + Adicionar drop
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-b border-dark-700 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="col-span-2 sm:col-span-4">
                <label className={labelClass}>Item *</label>
                <select value={form.itemId ?? ""} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className={inputClass}>
                  <option value="">Selecionar item...</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.rarity ?? "?"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Taxa de drop (%)</label>
                <input type="number" step="0.1" min={0} max={100} value={form.dropChance ?? 10} onChange={(e) => setForm({ ...form, dropChance: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Qtd. mín.</label>
                <input type="number" min={1} value={form.minQuantity ?? 1} onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Qtd. máx.</label>
                <input type="number" min={1} value={form.maxQuantity ?? 1} onChange={(e) => setForm({ ...form, maxQuantity: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nível mín. do jogador</label>
                <input type="number" min={1} value={form.minLevel ?? 1} onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nível máx. do jogador</label>
                <input type="number" min={1} value={form.maxLevel ?? 99} onChange={(e) => setForm({ ...form, maxLevel: Number(e.target.value) })} className={inputClass} />
              </div>
              <div className="col-span-2 sm:col-span-3 flex items-center gap-2 h-9">
                <input
                  id="isGuaranteed"
                  type="checkbox"
                  checked={!!form.isGuaranteed}
                  onChange={(e) => setForm({ ...form, isGuaranteed: e.target.checked })}
                  className="w-4 h-4 accent-accent-500"
                />
                <label htmlFor="isGuaranteed" className="text-sm text-gray-300">Drop garantido (100%)</label>
              </div>
              <div className="flex justify-end gap-2">
                {editing && (
                  <button type="button" onClick={resetForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                )}
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? "Saving..." : editing?.id ? "Salvar alterações" : "Adicionar drop"}
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Item</th>
                    <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Chance</th>
                    <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Qtd</th>
                    <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Níveis</th>
                    <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Garantido</th>
                    <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDrops && (
                    <tr><td colSpan={6} className="py-6 text-center text-gray-500">Loading...</td></tr>
                  )}
                  {!loadingDrops && drops.map((d) => (
                    <tr key={d.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          {d.item?.icon ? (
                            <img src={d.item.icon} alt="" className="w-7 h-7 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
                          ) : null}
                          <span className="font-medium text-white">{d.item?.name ?? itemName(d.itemId)}</span>
                          {d.item?.rarity && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400 capitalize">{d.item.rarity}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">{d.dropChance}%</td>
                      <td className="py-2.5 px-4 font-mono text-xs">{d.minQuantity}–{d.maxQuantity}</td>
                      <td className="py-2.5 px-4 font-mono text-xs">{d.minLevel}–{d.maxLevel}</td>
                      <td className="py-2.5 px-4">
                        {d.isGuaranteed ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Sim</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(d)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                        <button onClick={() => handleDelete(d)} className="text-red-400 hover:text-red-300">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {!loadingDrops && drops.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">Nenhum drop configurado para este monstro</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-dark-800 border border-dark-600 rounded-xl flex items-center justify-center p-16">
            <p className="text-gray-500">Selecione um monstro para gerenciar os drops</p>
          </div>
        )}
      </div>
    </div>
  );
}
