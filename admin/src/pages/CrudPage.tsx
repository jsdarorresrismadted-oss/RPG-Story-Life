import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import JsonField, { JsonFieldDef } from "../components/JsonField";
import IconPicker from "../components/IconPicker";
import MonsterSkillsField from "../components/MonsterSkillsField";
import WeaponBoosterField from "../components/WeaponBoosterField";

// Constantes para filtros de items
const TYPE_LABELS: Record<string, string> = {
  weapon: "Arma",
  helm: "Elmo",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
  consumable: "Consumível",
  material: "Material",
};

const RARITY_COLORS: Record<string, string> = {
  common: "bg-gray-600/30 text-gray-300",
  uncommon: "bg-green-600/30 text-green-300",
  rare: "bg-blue-600/30 text-blue-300",
  epic: "bg-purple-600/30 text-purple-300",
  legendary: "bg-yellow-600/30 text-yellow-300",
  mythic: "bg-red-600/30 text-red-300",
};

const ITEM_TYPES = ["weapon", "helm", "armor", "cape", "ring", "necklace", "consumable", "material"];
const ITEM_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

function itemCategory(it: { type?: string; subtype?: string }): string {
  if (it.type === "material" || (it.type === "consumable" && it.subtype === "material")) return "Materiais";
  if (it.type === "weapon" || it.type === "armor" || it.type === "helm" || it.type === "cape") return "Equipamentos";
  return "Outros";
}

export interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "boolean" | "json" | "icon" | "monster-skills" | "booster";
  options?: string[];
  optionsFrom?: string;
  optionsParams?: Record<string, string>;
  optionsFor?: { source: string; map: Record<string, string[]> };
  visibleIf?: { field: string; values: any[] };
  autoFrom?: string; // preenche este campo automaticamente com o "name" do item selecionado em `autoFrom`
  required?: boolean;
  defaultValue?: any;
  step?: string;
  placeholder?: string;
  hint?: string;
  iconCategories?: string[];
  jsonSchema?: JsonFieldDef;
  group?: string; // renderiza um cabeçalho de seção antes deste campo
}

export interface ColumnConfig {
  key: string;
  label: string;
  render?: (value: any, item?: any) => any;
}

export interface CrudConfig {
  key: string;
  title: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  extraActions?: (item: any) => React.ReactNode;
  headerActions?: (reload: () => void) => React.ReactNode;
  searchPlaceholder?: string;
  bulkMoveFields?: FieldConfig[]; // campos (select) permitidos na ação "Mover"
}

interface CrudPageProps {
  config: CrudConfig;
}

export const DELETE_TIPOS = [
  { value: 10, label: "10 — Erro / conteúdo inválido" },
  { value: 20, label: "20 — Descontinuado / obsoleto" },
  { value: 30, label: "30 — Substituído por outro" },
  { value: 40, label: "40 — Violação / moderação" },
  { value: 50, label: "50 — Teste / rascunho" },
];

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

export default function CrudPage({ config }: CrudPageProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<Record<string, any[]>>({});

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveField, setMoveField] = useState("");
  const [moveValue, setMoveValue] = useState("");
  const [busy, setBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteTipo, setDeleteTipo] = useState(10);

  // Filtros específicos para items
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [rarityFilter, setRarityFilter] = useState<string>("");

  useEffect(() => {
    const sources = config.fields.filter((f) => f.optionsFrom);
    if (sources.length === 0) return;
    sources.forEach((f) => {
      const params = f.optionsParams || {};
      (adminApi as any)[f.optionsFrom!]
        .list(params)
        .then(({ data }: any) =>
          setRemoteOptions((prev) => ({ ...prev, [f.optionsFrom!]: Array.isArray(data) ? data : [] }))
        )
        .catch(() => {});
    });
  }, [config.key]);

  const load = async (params?: Record<string, string>) => {
    setLoading(true);
    try {
      const { data } = await (adminApi as any)[config.key].list(params);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to load ${config.title}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params: Record<string, string> = {};
    if (config.key === "items") {
      if (typeFilter) params.type = typeFilter;
      if (rarityFilter) params.rarity = rarityFilter;
    }
    load(params);
  }, [config.key, typeFilter, rarityFilter]);

  const hasActiveField = config.fields.some((f) => f.name === "isActive");

  const filtered = useMemo(() => {
    let base = items;
    if (hasActiveField && !showInactive) {
      base = items.filter((it) => it.isActive !== false);
    }
    // Filtros locais para items (além dos filtros da API)
    if (config.key === "items") {
      if (typeFilter) base = base.filter((it) => it.type === typeFilter);
      if (rarityFilter) base = base.filter((it) => it.rarity === rarityFilter);
    }
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((it) => {
      if (it.id?.toLowerCase().includes(q)) return true;
      for (const col of config.columns) {
        const v = it[col.key];
        if (v != null && String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [items, search, config.columns, hasActiveField, showInactive, typeFilter, rarityFilter, config.key]);

  const selectedItems = useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected]
  );

  const buildDefaults = () => {
    const defaults: Record<string, any> = {};
    for (const field of config.fields) {
      if (field.jsonSchema) {
        defaults[field.name] = field.jsonSchema.mode === "record" ? {} : [];
      } else if (field.type === "monster-skills" || field.type === "booster") {
        defaults[field.name] = [];
      } else {
        defaults[field.name] = field.defaultValue ?? (field.type === "boolean" ? false : field.type === "number" ? 0 : "");
      }
    }
    return defaults;
  };

  const openCreate = () => {
    setEditing(null);
    setForm(buildDefaults());
    setModalOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const values: Record<string, any> = {};
    for (const field of config.fields) {
      const raw = item[field.name];
      if (field.type === "json") {
        if (field.jsonSchema) {
          let parsed = raw;
          if (typeof raw === "string" && raw.trim()) {
            try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
          }
          values[field.name] = parsed ?? (field.jsonSchema.mode === "record" ? {} : []);
        } else {
          values[field.name] = raw ? JSON.stringify(raw, null, 2) : "";
        }
      } else if (field.type === "monster-skills" || field.type === "booster") {
        let parsed: any = [];
        if (typeof raw === "string" && raw.trim()) {
          try { parsed = JSON.parse(raw); } catch { parsed = []; }
        } else if (Array.isArray(raw)) {
          parsed = raw;
        } else if (raw && typeof raw === "object") {
          parsed = [raw];
        }
        values[field.name] = parsed;
      } else if (field.type === "number") {
        values[field.name] = raw ?? 0;
      } else if (field.type === "boolean") {
        values[field.name] = !!raw;
      } else {
        values[field.name] = raw ?? "";
      }
    }
    setForm(values);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const isFieldVisible = (field: FieldConfig) => {
    if (!field.visibleIf) return true;
    const source = form[field.visibleIf.field];
    return field.visibleIf.values.some((v) => String(v) === String(source));
  };

  const buildPayload = () => {
    const payload: Record<string, any> = {};
    for (const field of config.fields) {
      if (!isFieldVisible(field)) {
        payload[field.name] = editing ? editing[field.name] ?? null : field.defaultValue ?? null;
        continue;
      }
      let value = form[field.name];
      if (field.type === "json") {
        payload[field.name] = field.jsonSchema ? JSON.stringify(value) : value && value.trim() ? value : null;
      } else if (field.type === "monster-skills") {
        payload[field.name] = Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
      } else if (field.type === "booster") {
        payload[field.name] = Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
      } else if (field.type === "number") {
        payload[field.name] = Number(value) || 0;
      } else if (field.type === "boolean") {
        payload[field.name] = !!value;
      } else {
        payload[field.name] = value;
      }
    }
    return payload;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing?.id) {
        await (adminApi as any)[config.key].update(editing.id, payload);
        toast.success(`${config.title}: updated`);
      } else {
        await (adminApi as any)[config.key].create(payload);
        toast.success(`${config.title}: created`);
      }
      closeModal();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (ids: string[]) => {
    setDeleteTargets(ids);
    setDeleteTipo(10);
    setDeleteOpen(true);
  };

  const handleDelete = (item: any) => openDeleteModal([item.id]);

  const confirmDelete = async () => {
    if (deleteTargets.length === 0) return;
    setBusy(true);
    try {
      if (deleteTargets.length > 1) {
        const { data } = await adminApi.bulkDelete(config.key, deleteTargets, deleteTipo);
        toast.success(`${data.deleted} deletado(s), ${data.disabled} desativado(s)`);
      } else {
        await (adminApi as any)[config.key].delete(deleteTargets[0], { params: { tipo: deleteTipo } });
        toast.success(`${config.title}: deleted`);
      }
      setDeleteOpen(false);
      clearSelection();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao deletar");
    } finally {
      setBusy(false);
    }
  };

  // ===== Seleção múltipla =====
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (filtered.length > 0 && filtered.every((it) => selected.has(it.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((it) => it.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  const bulkDelete = () => {
    const count = selectedItems.length;
    if (count === 0) return;
    openDeleteModal(selectedItems.map((it) => it.id));
  };

  const bulkDuplicate = async () => {
    const count = selectedItems.length;
    if (count === 0) return;
    setBusy(true);
    try {
      for (const it of selectedItems) {
        const payload = { ...it };
        delete payload.id;
        delete payload.createdAt;
        delete payload.updatedAt;
        if (payload.name) payload.name = `${payload.name} (copy)`;
        await (adminApi as any)[config.key].create(payload);
      }
      toast.success(`${count} duplicado(s)`);
      clearSelection();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao duplicar");
    } finally {
      setBusy(false);
    }
  };

  const bulkMove = async () => {
    const count = selectedItems.length;
    if (count === 0 || !moveField) return;
    setBusy(true);
    try {
      await Promise.all(
        selectedItems.map((it) => (adminApi as any)[config.key].update(it.id, { [moveField]: moveValue }))
      );
      toast.success(`${count} movido(s) para "${moveValue || "—"}"`);
      clearSelection();
      setMoveOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao mover");
    } finally {
      setBusy(false);
    }
  };

  const bulkToggleActive = async () => {
    const count = selectedItems.length;
    if (count === 0) return;
    const target = !(selectedItems[0]?.isActive ?? false);
    setBusy(true);
    try {
      await Promise.all(
        selectedItems.map((it) => (adminApi as any)[config.key].update(it.id, { isActive: target }))
      );
      toast.success(`${count} ${target ? "ativado(s)" : "desativado(s)"}`);
      clearSelection();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao atualizar");
    } finally {
      setBusy(false);
    }
  };

  // ===== Campos permitidos na ação "Mover" =====
  const moveCandidates = config.bulkMoveFields || config.fields.filter((f) => f.type === "select");

  const openMove = () => {
    const first = moveCandidates[0];
    if (first) {
      setMoveField(first.name);
      setMoveValue(first.options?.[0] ?? "");
    } else {
      setMoveField("");
      setMoveValue("");
    }
    setMoveOpen(true);
  };

  const moveFieldOptions = (field?: FieldConfig) => {
    if (!field) return [];
    if (field.optionsFrom) return remoteOptions[field.optionsFrom] || [];
    return field.options || [];
  };

  const moveOptionLabel = (opt: any) => {
    if (typeof opt === "string") return opt;
    return opt.slug && opt.slug !== opt.name ? `${opt.name} (${opt.slug})` : opt.name;
  };

  const renderField = (field: FieldConfig) => {
    const value = form[field.name];
    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={value ?? ""}
            onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
            className={`${inputClass} resize-y`}
            rows={3}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
      case "select": {
        const options = field.optionsFrom
          ? remoteOptions[field.optionsFrom] || []
          : field.optionsFor
            ? field.optionsFor.map[form[field.optionsFor.source]] || []
            : field.options || [];
        const optionLabel = (opt: any) => {
          if (typeof opt === "string") return opt;
          return opt.slug && opt.slug !== opt.name ? `${opt.name} (${opt.slug})` : opt.name;
        };
        const groupItems = field.optionsFrom === "items" && options.length > 0 && !!options[0]?.type;
        return (
          <select
            value={value ?? ""}
            onChange={(e) => {
              const next = { ...form, [field.name]: e.target.value };
              if (field.optionsFor) {
                const allowed = field.optionsFor.map[next[field.optionsFor.source]] || [];
                if (!allowed.includes(next[field.name])) {
                  const target = config.fields.find((f) => f.optionsFor?.source === field.name);
                  if (target) next[target.name] = "";
                }
              }
              if (field.optionsFrom === "items") {
                for (const f of config.fields) {
                  if (f.autoFrom === field.name) {
                    const sel = options.find((o: any) => o.id === e.target.value);
                    next[f.name] = sel ? sel.name : "";
                  }
                }
              }
              setForm(next);
            }}
            className={inputClass}
            required={field.required}
          >
            <option value="">{field.optionsFrom ? "Nenhum" : "Select..."}</option>
            {groupItems ? (
              (() => {
                const groups: Record<string, any[]> = {};
                for (const opt of options) {
                  const cat = itemCategory(opt);
                  (groups[cat] ||= []).push(opt);
                }
                return Object.entries(groups).map(([cat, opts]) => (
                  <optgroup key={cat} label={cat}>
                  {opts.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </optgroup>
              ));
            })()
          ) : (
            options.map((opt: any) => (
              <option key={typeof opt === "string" ? opt : opt.id} value={typeof opt === "string" ? opt : opt.id}>
                {optionLabel(opt)}
              </option>
            ))
          )}
          {value && !options.some((o: any) => (typeof o === "string" ? o : o.id) === value) && (
            <option value={value}>{value} (atual)</option>
          )}
          </select>
        );
      }
      case "icon":
        return <IconPicker value={value ?? ""} onChange={(v) => setForm({ ...form, [field.name]: v })} categories={field.iconCategories} />;
      case "boolean":
        return (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => setForm({ ...form, [field.name]: e.target.checked })}
              className="w-4 h-4 accent-accent-500"
            />
            <span className="text-sm text-gray-400">{value ? "Yes" : "No"}</span>
          </div>
        );
      case "number":
        return (
          <input
            type="number"
            step={field.step || "1"}
            value={value ?? 0}
            onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
            className={inputClass}
            required={field.required}
          />
        );
      case "monster-skills":
        return (
          <MonsterSkillsField
            value={value}
            onChange={(v) => setForm({ ...form, [field.name]: v })}
          />
        );
      case "booster":
        return (
          <WeaponBoosterField
            value={value}
            onChange={(v) => setForm({ ...form, [field.name]: v })}
          />
        );
      case "json":
        if (field.jsonSchema) {
          return (
            <JsonField
              schema={field.jsonSchema}
              value={value}
              onChange={(v) => setForm({ ...form, [field.name]: v })}
            />
          );
        }
        return (
          <textarea
            value={value ?? ""}
            onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
            className={`${inputClass} resize-y font-mono text-xs`}
            rows={5}
            placeholder='{"key": "value"}'
          />
        );
      default:
        return (
          <input
            type="text"
            value={value ?? ""}
            disabled={!!field.autoFrom}
            onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
            className={field.autoFrom ? `${inputClass} opacity-70 cursor-not-allowed` : inputClass}
            placeholder={field.placeholder}
            required={field.required && !field.autoFrom}
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{config.title}</h1>
        <div className="flex items-center gap-2">
          {config.headerActions && config.headerActions(load)}
          {filtered.length > 0 && (
            <button
              onClick={() => {
                setSelected(new Set(filtered.map((it) => it.id)));
                openDeleteModal(filtered.map((it) => it.id));
              }}
              disabled={busy}
              title="Seleciona todos e abre o tipo de exclusão"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50"
            >
              Deletar todos ({filtered.length})
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <span className="text-lg leading-none">+</span> New
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={config.searchPlaceholder || `Buscar ${config.title}...`}
            className={`${inputClass} pl-9`}
          />
        </div>
        {/* Filtros específicos para Items */}
        {config.key === "items" && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${inputClass} w-auto`}
            >
              <option value="">Todos os tipos</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
              ))}
            </select>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
              className={`${inputClass} w-auto`}
            >
              <option value="">Todas as raridades</option>
              {ITEM_RARITIES.map((r) => (
                <option key={r} value={r}>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${RARITY_COLORS[r] ?? "bg-gray-700 text-gray-300"}`}>{r}</span>
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {hasActiveField && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 accent-accent-500"
              />
              Ver inativos
            </label>
          )}
          <span>{items.length} registro(s)</span>
          {search.trim() && <span>• {filtered.length} resultado(s)</span>}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-accent-600/10 border border-accent-500/40 rounded-xl px-3 py-2">
          <span className="text-sm font-medium text-accent-300">
            {selected.size} selecionado(s)
          </span>
          <div className="flex-1" />
          <button
            onClick={bulkDuplicate}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
          >
            Duplicar
          </button>
          {moveCandidates.length > 0 && (
            <button
              onClick={openMove}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
            >
              Mover
            </button>
          )}
          {config.fields.some((f) => f.name === "isActive") && (
            <button
              onClick={bulkToggleActive}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600/20 text-green-300 hover:bg-green-600/30 transition-colors disabled:opacity-50"
            >
              {selectedItems[0]?.isActive ? "Desativar" : "Ativar"}
            </button>
          )}
          <button
            onClick={bulkDelete}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50"
          >
            Deletar
          </button>
          <button
            onClick={clearSelection}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-dark-700 text-gray-300 hover:bg-dark-600 transition-colors disabled:opacity-50"
          >
            Limpar seleção
          </button>
        </div>
      )}

      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((it) => selected.has(it.id))}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-accent-500"
                  />
                </th>
                {config.columns.map((col) => (
                  <th key={col.key} className="text-left py-3 px-4 text-gray-400 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-dark-700 hover:bg-dark-800/50 ${selected.has(item.id) ? "bg-accent-600/10" : ""}`}
                >
                  <td className="py-2.5 px-4">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 accent-accent-500"
                    />
                  </td>
                  {config.columns.map((col) => (
                    <td key={col.key} className="py-2.5 px-4">
                      {col.render ? col.render(item[col.key], item) : item[col.key] ?? "-"}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    {config.extraActions && config.extraActions(item)}
                    <button
                      onClick={() => openEdit(item)}
                      className="text-blue-400 hover:text-blue-300 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {search.trim() ? "Nenhum resultado para a busca" : `No ${config.title.toLowerCase()} yet — click "New" to add one`}
            </p>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editing?.id ? `Edit ${config.title}` : `New ${config.title}`}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {config.fields.filter(isFieldVisible).map((field, index, visibleFields) => {
                  const prev = visibleFields[index - 1];
                  const showHeader = !!field.group && (!prev || prev.group !== field.group);
                  return (
                    <Fragment key={field.name}>
                      {showHeader && (
                        <div className="sm:col-span-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-400 border-b border-dark-700 pb-1.5">
                            {field.group}
                          </p>
                        </div>
                      )}
                      <div className={field.type === "textarea" || field.type === "json" || field.type === "icon" || field.type === "monster-skills" || field.type === "booster" ? "sm:col-span-2" : ""}>
                        <label className="block text-sm text-gray-400 mb-1.5">{field.label}</label>
                        {renderField(field)}
                        {field.hint && <p className="text-xs text-gray-500 mt-1">{field.hint}</p>}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing?.id ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteOpen(false)}
        >
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">
              Deletar {deleteTargets.length > 1 ? `${deleteTargets.length} registro(s)` : config.title}
            </h2>
            <p className="text-sm text-gray-400 mb-4">Escolha o tipo/motivo da exclusão:</p>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Tipo</label>
              <select
                value={deleteTipo}
                onChange={(e) => setDeleteTipo(Number(e.target.value))}
                className={inputClass}
              >
                {DELETE_TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-5">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? "Deletando..." : "Deletar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setMoveOpen(false)}
        >
          <div
            className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">Mover {selected.size} item(ns)</h2>
            <p className="text-sm text-gray-400 mb-4">Define um valor para os registros selecionados.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Campo</label>
                <select
                  value={moveField}
                  onChange={(e) => {
                    const f = moveCandidates.find((c) => c.name === e.target.value);
                    setMoveField(e.target.value);
                    setMoveValue(f?.options?.[0] ?? "");
                  }}
                  className={inputClass}
                >
                  {moveCandidates.map((f) => (
                    <option key={f.name} value={f.name}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Novo valor</label>
                <select
                  value={moveValue}
                  onChange={(e) => setMoveValue(e.target.value)}
                  className={inputClass}
                >
                  {moveFieldOptions(moveCandidates.find((f) => f.name === moveField)).map((opt: any) => (
                    <option key={typeof opt === "string" ? opt : opt.id} value={typeof opt === "string" ? opt : opt.id}>
                      {moveOptionLabel(opt)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-5">
              <button
                onClick={() => setMoveOpen(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={bulkMove}
                disabled={busy || !moveField}
                className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? "Movendo..." : "Mover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
