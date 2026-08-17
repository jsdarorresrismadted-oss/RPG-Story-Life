import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Search, Sparkles, Table2, Trash2, Eye, Plus, Loader2, Pencil } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { adminApi } from "../api";
import IconPicker from "../components/IconPicker";
import {
  ENCHANTMENT_CATEGORIES,
  computeEnchantmentValues,
  defaultEnchantmentScale,
  clampLevel,
  isVipLevel,
  ENCHANT_MAX_LEVEL,
  ENCHANT_STEP_PER_LEVEL,
} from "../enchantmentFormula";

const RARITY_OPTIONS = [
  { value: "common", label: "Comum" },
  { value: "uncommon", label: "Incomum" },
  { value: "rare", label: "Raro" },
  { value: "epic", label: "Épico" },
  { value: "legendary", label: "Lendário" },
  { value: "mythic", label: "Mítico" },
];

// Encantamentos valem SOMENTE para arma, elmo, armadura e capa — anéis/colares nunca encantam.
const SLOT_OPTIONS = [
  { value: "weapon", label: "Arma" },
  { value: "helm", label: "Elmo" },
  { value: "armor", label: "Armadura" },
  { value: "cape", label: "Capa" },
];

const STAT_LABELS: Record<string, string> = {
  strength: "Força",
  intellect: "Intelecto",
  endurance: "Resistência",
  dexterity: "Destreza",
  wisdom: "Sabedoria",
  luck: "Sorte",
};

const CATEGORY_COLORS: Record<string, string> = {
  strength: "bg-red-500/20 text-red-300",
  intellect: "bg-blue-500/20 text-blue-300",
  endurance: "bg-yellow-500/20 text-yellow-300",
  dexterity: "bg-green-500/20 text-green-300",
  wisdom: "bg-purple-500/20 text-purple-300",
  luck: "bg-orange-500/20 text-orange-300",
};

const RARITY_COLORS: Record<string, string> = {
  common: "bg-gray-600/30 text-gray-300",
  uncommon: "bg-green-600/30 text-green-300",
  rare: "bg-blue-600/30 text-blue-300",
  epic: "bg-purple-600/30 text-purple-300",
  legendary: "bg-yellow-600/30 text-yellow-300",
  mythic: "bg-red-600/30 text-red-300",
};

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";
const labelClass = "block text-sm text-gray-400 mb-1.5";

interface Enchantment {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  category: string;
  rarity: string;
  level: number;
  price: number;
  compatibleSlots: string;
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  dps?: number;
  attackSpeedMs?: number;
  isActive: boolean;
  computedStats?: Record<string, number>;
}

function parseSlots(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

const emptyForm = () => ({
  name: "",
  slug: "",
  description: "",
  icon: "",
  category: "strength",
  rarity: "common",
  level: 1,
  price: 0,
  compatibleSlots: [] as string[],
  strength: 10,
  intellect: 5,
  endurance: 5,
  dexterity: 5,
  wisdom: 5,
  luck: 5,
  dps: 10,
  attackSpeedMs: 2000,
  isActive: true,
});

export default function EnchantmentsPage() {
  const [items, setItems] = useState<Enchantment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterRarity, setFilterRarity] = useState("");
  const [filterMinLevel, setFilterMinLevel] = useState("");
  const [filterMaxLevel, setFilterMaxLevel] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Enchantment | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [progressionItem, setProgressionItem] = useState<Enchantment | null>(null);
  const [progression, setProgression] = useState<Array<{ level: number; stats: Record<string, number> }>>([]);
  const [loadingProgression, setLoadingProgression] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.enchantments.list();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao carregar encantamentos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.slug.toLowerCase().includes(q)) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterRarity && e.rarity !== filterRarity) return false;
      if (filterMinLevel !== "" && (Number(e.level) || 0) < Number(filterMinLevel)) return false;
      if (filterMaxLevel !== "" && (Number(e.level) || 999) > Number(filterMaxLevel)) return false;
      return true;
    });
  }, [items, search, filterCategory, filterRarity, filterMinLevel, filterMaxLevel]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item: Enchantment) => {
    setEditing(item);
    setForm({
      name: item.name,
      slug: item.slug,
      description: item.description,
      icon: item.icon ?? "",
      category: ENCHANTMENT_CATEGORIES.includes(item.category) ? item.category : "strength",
      rarity: item.rarity,
      level: Number(item.level) || 1,
      price: Number(item.price) || 0,
      compatibleSlots: parseSlots(item.compatibleSlots),
      strength: Number(item.strength) || 1,
      intellect: Number(item.intellect) || 1,
      endurance: Number(item.endurance) || 1,
      dexterity: Number(item.dexterity) || 1,
      wisdom: Number(item.wisdom) || 1,
      luck: Number(item.luck) || 1,
      dps: Number(item.dps) || 10,
      attackSpeedMs: Number(item.attackSpeedMs) || 2000,
      isActive: !!item.isActive,
    });
    setModalOpen(true);
  };

  const handleDuplicate = async (item: Enchantment) => {
    try {
      const { data } = await adminApi.enchantments.create({
        name: `${item.name} (cópia)`,
        slug: `${item.slug}-copy`,
        description: item.description,
        icon: item.icon,
        category: item.category,
        rarity: item.rarity,
        level: Number(item.level) || 1,
        price: Number(item.price) || 0,
        compatibleSlots: item.compatibleSlots,
        strength: Number(item.strength) || 1,
        intellect: Number(item.intellect) || 1,
        endurance: Number(item.endurance) || 1,
        dexterity: Number(item.dexterity) || 1,
        wisdom: Number(item.wisdom) || 1,
        luck: Number(item.luck) || 1,
        dps: Number(item.dps) || 10,
        attackSpeedMs: Number(item.attackSpeedMs) || 2000,
        isActive: false,
      });
      toast.success(`"${data.name}" criado (inativo)`);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao duplicar");
    }
  };

  const handleDelete = async (item: Enchantment) => {
    if (!window.confirm(`Excluir o encantamento "${item.name}"? Itens encantados com ele perderão o vínculo.`)) return;
    try {
      await adminApi.enchantments.delete(item.id);
      toast.success("Encantamento excluído");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const openProgression = async (item: Enchantment) => {
    setProgressionItem(item);
    setProgression([]);
    setLoadingProgression(true);
    try {
      const { data } = await adminApi.enchantments.progression(item.id);
      setProgression(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao carregar progressão");
    } finally {
      setLoadingProgression(false);
    }
  };

  const toggleSlot = (slot: string) => {
    const current: string[] = form.compatibleSlots || [];
    setForm({
      ...form,
      compatibleSlots: current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot],
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        level: clampLevel(Number(form.level) || 1),
        price: Number(form.price) || 0,
        dps: Math.max(1, Math.round(Number(form.dps) || 10)),
        attackSpeedMs: Math.max(500, Math.min(2600, Math.round(Number(form.attackSpeedMs) || 2000))),
        requiredVip: isVipLevel(clampLevel(Number(form.level) || 1)),
        compatibleSlots: form.compatibleSlots,
      };
      if (editing?.id) {
        await adminApi.enchantments.update(editing.id, payload);
        toast.success("Encantamento atualizado");
      } else {
        await adminApi.enchantments.create(payload);
        toast.success("Encantamento criado");
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => computeEnchantmentValues(form), [form]);

  const applyDefaultScale = async () => {
    try {
      const lvl = clampLevel(Number(form.level) || 1);
      const { data } = await adminApi.enchantments.scale(form.category, lvl);
      setForm({ ...form, ...data });
      toast.success(`Escala padrão aplicada para o nível ${lvl}${data.requiredVip ? " (VIP)" : ""}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao obter a escala padrão");
    }
  };

  const [syncingShop, setSyncingShop] = useState(false);
  const handleSyncShop = async () => {
    setSyncingShop(true);
    try {
      const { data } = await adminApi.enchantments.syncShop();
      toast.success(data.message || "Loja de encantamentos atualizada!");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao sincronizar a loja");
    } finally {
      setSyncingShop(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Encantamentos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Definidos por atributo principal (6) e nível (1–150). Os valores de cada nível são calculados
            pela fórmula do sistema a partir da base (nível 1) — nunca aleatórios. Cada encantamento também
            carrega <span className="text-amber-400">DPS</span> (só arma: 10 no nível 1, +2 por nível até 308) e{" "}
            <span className="text-cyan-400">velocidade de ataque</span>. Ao aplicar, os atributos do
            encantamento <span className="text-yellow-400">substituem</span> os do equipamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncShop}
            disabled={syncingShop}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncingShop ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {syncingShop ? "Sincronizando..." : "Adicionar todos na loja"}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Novo encantamento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou slug..."
            className={inputClass + " pl-9"}
          />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={inputClass}>
          <option value="">Todas as categorias</option>
          {ENCHANTMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{STAT_LABELS[c]}</option>
          ))}
        </select>
        <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)} className={inputClass}>
          <option value="">Todas as raridades</option>
          {RARITY_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={ENCHANT_MAX_LEVEL}
          value={filterMinLevel}
          onChange={(e) => setFilterMinLevel(e.target.value)}
          placeholder="Nível mín."
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          max={ENCHANT_MAX_LEVEL}
          value={filterMaxLevel}
          onChange={(e) => setFilterMaxLevel(e.target.value)}
          placeholder="Nível máx."
          className={inputClass}
        />
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left py-3 px-4 text-gray-400 font-medium"></th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Nome</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Atributo principal</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Raridade</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Nível</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Valores no nível</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Slots</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Preço</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Active</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const stats = item.computedStats ?? computeEnchantmentValues(item);
                return (
                  <tr key={item.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                    <td className="py-2.5 px-4">
                      {item.icon ? (
                        item.icon.startsWith("/") || item.icon.startsWith("http") ? (
                          <img src={item.icon} alt="" className="w-9 h-9 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
                        ) : (
                          (() => {
                            const Icon = (LucideIcons as Record<string, any>)[item.icon] || Sparkles;
                            return <Icon size={18} className="text-purple-400" />;
                          })()
                        )
                      ) : (
                        <Sparkles size={18} className="text-purple-400/60" />
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-white">{item.name}</span>
                      <span className="block text-[11px] text-gray-500">{item.slug}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${CATEGORY_COLORS[item.category] || "bg-dark-700 text-gray-300"}`}>
                        {STAT_LABELS[item.category] || item.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${RARITY_COLORS[item.rarity] || "bg-gray-700 text-gray-300"}`}>
                        {item.rarity}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300 font-medium">{item.level}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {Object.entries(stats).map(([k, v]) => {
                          if (k === "attackSpeedMs") {
                            return (
                              <span
                                key={k}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono"
                                title={`Velocidade de ataque: ${(Number(v) / 1000).toFixed(1)}s`}
                              >
                                ⏱ {(Number(v) / 1000).toFixed(1)}s
                              </span>
                            );
                          }
                          if (k === "dps") {
                            return (
                              <span
                                key={k}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono"
                                title="Dano por segundo (encantamento de arma)"
                              >
                                +{v} DPS
                              </span>
                            );
                          }
                          return (
                            <span
                              key={k}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${k === item.category ? "bg-accent-500/20 text-accent-300 font-semibold" : "bg-dark-900 text-gray-400"}`}
                              title={k === item.category ? `${STAT_LABELS[k]} (principal)` : STAT_LABELS[k]}
                            >
                              {v}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-xs text-gray-400">{parseSlots(item.compatibleSlots).map((s) => SLOT_OPTIONS.find((o) => o.value === s)?.label ?? s).join(", ") || "-"}</span>
                    </td>
                    <td className="py-2.5 px-4 text-yellow-400 text-xs">{Number(item.price).toLocaleString()}</td>
                    <td className="py-2.5 px-4">
                      <button
                        onClick={async () => {
                          try {
                            await adminApi.enchantments.update(item.id, { isActive: !item.isActive });
                            load();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message || "Falha ao alternar");
                          }
                        }}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          item.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-400"
                        }`}
                        title="Clique para ativar/desativar"
                      >
                        {item.isActive ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openProgression(item)}
                        title="Ver progressão 1-150"
                        className="text-green-400 hover:text-green-300 mr-3 inline-flex items-center gap-1"
                      >
                        <Table2 size={14} /> Progressão
                      </button>
                      <button onClick={() => openEdit(item)} title="Editar" className="text-blue-400 hover:text-blue-300 mr-3 inline-flex items-center gap-1">
                        <Pencil size={14} /> Editar
                      </button>
                      <button onClick={() => handleDuplicate(item)} title="Duplicar" className="text-purple-400 hover:text-purple-300 mr-3 inline-flex items-center gap-1">
                        <Copy size={14} /> Duplicar
                      </button>
                      <button onClick={() => handleDelete(item)} title="Excluir" className="text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                        <Trash2 size={14} /> Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 py-10">
              {items.length === 0 ? 'Nenhum encantamento ainda — clique em "Novo encantamento".' : "Nenhum resultado com os filtros atuais."}
            </p>
          )}
          {loading && <p className="text-center text-gray-500 py-10">Loading...</p>}
        </div>
      </div>

      {/* Modal de criação/edição */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !saving && setModalOpen(false)}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles size={18} className="text-purple-400" />
                {editing?.id ? `Editar: ${editing.name}` : "Novo encantamento"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nome *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="ex.: Titã do Inferno" />
                </div>
                <div>
                  <label className={labelClass}>Slug *</label>
                  <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} className={inputClass} placeholder="ex.: titan-do-inferno" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Descrição</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass + " resize-y"} rows={2} />
                </div>
                <div>
                  <label className={labelClass}>Ícone</label>
                  <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} categories={["Encantamento", "Skills"]} />
                </div>
                <div>
                  <label className={labelClass}>Atributo principal *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                    {ENCHANTMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{STAT_LABELS[c]} (cresce mais rápido)</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">O atributo principal sempre recebe o maior valor em todos os níveis.</p>
                </div>
                <div>
                  <label className={labelClass}>Raridade *</label>
                  <select value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })} className={inputClass}>
                    {RARITY_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">Crescimento por nível: Comum 1% · Incomum 1,5% · Raro 2% · Épico 2,5% · Lendário 3% · Mítico 4% (+2% no principal).</p>
                </div>
                <div>
                  <label className={labelClass}>Nível (1–150) *</label>
                  <input
                    type="number"
                    min={1}
                    max={ENCHANT_MAX_LEVEL}
                    required
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: parseInt(e.target.value) || 1 })}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Valores exibidos/vendidos neste nível — a progressão completa é calculada pela fórmula.</p>
                </div>
                <div>
                  <label className={labelClass}>Preço (ouro)</label>
                  <input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Equipamentos compatíveis</label>
                  <div className="flex flex-wrap gap-2">
                    {SLOT_OPTIONS.map((s) => {
                      const checked = (form.compatibleSlots || []).includes(s.value);
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => toggleSlot(s.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            checked ? "bg-accent-500/20 border-accent-500 text-accent-300" : "border-dark-600 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between border-b border-dark-700 pb-1.5 mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-400">
                      Base dos atributos (nível 1) — nunca zerados
                    </p>
                    <button
                      type="button"
                      onClick={applyDefaultScale}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-700 hover:bg-dark-600 text-accent-300 font-medium transition-colors"
                      title="Preenche atributos, DPS e velocidade pela escala padrão do nível escolhido"
                    >
                      ✨ Escala padrão do nível
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.keys(STAT_LABELS).map((k) => (
                      <div key={k}>
                        <label className={labelClass}>
                          {STAT_LABELS[k]}
                          {k === form.category && <span className="text-[10px] text-accent-400 ml-1">(principal)</span>}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={form[k]}
                          onChange={(e) => setForm({ ...form, [k]: parseInt(e.target.value) || 1 })}
                          className={inputClass}
                        />
                      </div>
                    ))}
                    <div>
                      <label className={labelClass}>DPS base (só arma) <span className="text-[10px] text-amber-400">10 no Nv.1, +2 por nível</span></label>
                      <input
                        type="number"
                        min={1}
                        value={form.dps}
                        onChange={(e) => setForm({ ...form, dps: parseInt(e.target.value) || 1 })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Velocidade base (ms)
                        {isVipLevel(clampLevel(Number(form.level) || 1)) && <span className="text-[10px] text-cyan-400 ml-1">sugerida 1500</span>}
                      </label>
                      <input
                        type="number"
                        min={500}
                        max={2600}
                        step={100}
                        value={form.attackSpeedMs}
                        onChange={(e) => setForm({ ...form, attackSpeedMs: parseInt(e.target.value) || 2000 })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 bg-dark-900/60 border border-dark-600 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2">
                    <Eye size={12} className="inline mr-1 text-accent-400" />
                    Valores calculados no <span className="text-white font-medium">nível {clampLevel(Number(form.level) || 1)}</span> (fórmula do sistema):
                    {isVipLevel(clampLevel(Number(form.level) || 1)) && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold align-middle">VIP</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(preview).map(([k, v]) => {
                      if (k === "attackSpeedMs") {
                        return (
                          <span key={k} className="text-[11px] px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 font-mono">
                            Veloc.: <span className="font-semibold">{(Number(v) / 1000).toFixed(1)}s</span>
                          </span>
                        );
                      }
                      if (k === "dps") {
                        return (
                          <span key={k} className="text-[11px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 font-mono">
                            DPS: <span className="font-semibold">+{v}</span>
                          </span>
                        );
                      }
                      return (
                        <span key={k} className={`text-[11px] px-2 py-1 rounded-md ${k === form.category ? "bg-accent-500/20 text-accent-300 font-semibold" : "bg-dark-800 text-gray-300"}`}>
                          {STAT_LABELS[k]}: <span className="font-mono">+{v}</span>
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-2">
                    No nível 100, {STAT_LABELS[form.category]} chega a ~
                    {(() => {
                      const base = Number(form[form.category]) || 1;
                      return Math.max(1, base + ENCHANT_STEP_PER_LEVEL * (ENCHANT_MAX_LEVEL - 1));
                    })()}
                    (base +2 por nível). A cada 2 níveis um encantamento é <span className="text-cyan-400">VIP</span> (2, 4, 6... — alterna normal/VIP): velocidade sugerida 1,5s e requer assinatura VIP.
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 accent-accent-500"
                    />
                    Ativo (comprável/aplicável)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || (form.compatibleSlots || []).length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? "Salvando..." : editing?.id ? "Salvar alterações" : "Criar encantamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de progressão */}
      {progressionItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setProgressionItem(null)}>
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Table2 size={18} className="text-green-400" />
                Progressão de {progressionItem.name}
                <span className="text-xs font-normal text-gray-400">
                  {STAT_LABELS[progressionItem.category]} · {progressionItem.rarity} · níveis 1–150
                </span>
              </h2>
              <button onClick={() => setProgressionItem(null)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Valores calculados automaticamente pela fórmula do sistema (base nível 1 × crescimento por raridade).
              O atributo principal (verde) cresce mais rápido e permanece sempre superior.
              Níveis <span className="text-cyan-400">VIP</span> (múltiplos de 5): +5 de DPS em vez de +2.
            </p>
            <div className="overflow-y-auto flex-1 border border-dark-700 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-dark-800">
                  <tr className="border-b border-dark-600">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Nível</th>
                    {Object.keys(STAT_LABELS).map((k) => (
                      <th key={k} className={`text-right py-2 px-2 font-medium ${k === progressionItem.category ? "text-accent-400" : "text-gray-400"}`}>
                        {STAT_LABELS[k]}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-amber-400">DPS</th>
                    <th className="text-right py-2 px-2 font-medium text-cyan-400">Veloc.</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProgression && (
                    <tr><td colSpan={9} className="py-8 text-center text-gray-500">Calculando níveis...</td></tr>
                  )}
                  {!loadingProgression &&
                    progression.map((row) => {
                      const isVip = row.level % 5 === 0;
                      return (
                        <tr key={row.level} className={`border-b border-dark-800 ${isVip ? "bg-cyan-500/5" : ""} ${row.level === (Number(progressionItem.level) || 1) ? "bg-accent-600/10" : ""}`}>
                          <td className={`py-1.5 px-3 font-mono ${row.level === (Number(progressionItem.level) || 1) ? "text-accent-300 font-bold" : "text-gray-400"}`}>
                            {row.level}{isVip && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold align-middle">VIP</span>}
                            {row.level === (Number(progressionItem.level) || 1) ? " ◄ atual" : ""}
                          </td>
                          {Object.keys(STAT_LABELS).map((k) => (
                            <td key={k} className={`text-right py-1.5 px-2 font-mono ${k === progressionItem.category ? "text-accent-300 font-semibold" : "text-gray-300"}`}>
                              {row.stats[k] ?? "-"}
                            </td>
                          ))}
                          <td className="text-right py-1.5 px-2 font-mono text-amber-300">{row.stats.dps ?? "-"}</td>
                          <td className="text-right py-1.5 px-2 font-mono text-cyan-300">{((Number(row.stats.attackSpeedMs) || 0) / 1000).toFixed(1)}s</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
