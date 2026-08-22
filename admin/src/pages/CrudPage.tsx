import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { AccordionSection } from "../components/ui";
import FieldRenderer from "../components/FieldRenderer";
import { Modal, ConfirmationDialog } from "../components/Modal";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { SearchInput } from "../components/SearchInput";
import { FieldConfig, CrudConfig } from "../configs/types";

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
  const queryClient = useQueryClient();
  const reload = () => queryClient.invalidateQueries({ queryKey: ["crud", config.key] });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<Record<string, any[]>>({});

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveField, setMoveField] = useState("");
  const [moveValue, setMoveValue] = useState("");
  const [busy, setBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteTipo, setDeleteTipo] = useState(10);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

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

  useEffect(() => {
    setPage(0);
  }, [search, typeFilter, rarityFilter]);

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ["crud", config.key, typeFilter, rarityFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (config.key === "items") {
        if (typeFilter) params.type = typeFilter;
        if (rarityFilter) params.rarity = rarityFilter;
      }
      const { data } = await (adminApi as any)[config.key].list(params);
      return Array.isArray(data) ? data : [];
    },
  });

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
      reload();
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
      reload();
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
      reload();
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
      reload();
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
      reload();
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


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{config.title}</h1>
        <div className="flex items-center gap-2">
          {config.headerActions && config.headerActions(reload)}
          {filtered.length > 0 && (
            <button
              onClick={() => setConfirmAllOpen(true)}
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={config.searchPlaceholder || `Buscar ${config.title}...`}
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
                <option key={r} value={r}>{r}</option>
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

      <DataTable
        columns={config.columns}
        rows={filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
        loading={loading}
        emptyMessage={
          search.trim()
            ? "Nenhum resultado para a busca"
            : `No ${config.title.toLowerCase()} yet — click "New" to add one`
        }
        selected={selected}
        onToggleRow={toggleSelect}
        onToggleAll={toggleSelectAll}
        allSelected={filtered.length > 0 && filtered.every((it) => selected.has(it.id))}
        rowActions={(item) => (
          <>
            {config.extraActions && config.extraActions(item)}
            <button onClick={() => openEdit(item)} className="text-blue-400 hover:text-blue-300 mr-3">
              Edit
            </button>
            <button onClick={() => handleDelete(item)} className="text-red-400 hover:text-red-300">
              Delete
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

      {modalOpen && (
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={editing?.id ? `Edit ${config.title}` : `New ${config.title}`}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {(() => {
              const visibleFields = config.fields.filter(isFieldVisible);
              const sections: { name: string; fields: typeof visibleFields }[] = [];
              const order = new Map<string, number>();
              for (const f of visibleFields) {
                const g = f.group || "Geral";
                if (!order.has(g)) {
                  order.set(g, sections.length);
                  sections.push({ name: g, fields: [] });
                }
                sections[order.get(g)!].fields.push(f);
              }
              return sections.map((sec, si) => (
                <AccordionSection key={sec.name} title={sec.name} defaultOpen={si === 0}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sec.fields.map((field) => (
                      <div
                        key={field.name}
                        className={
                          field.type === "textarea" || field.type === "json" || field.type === "icon" || field.type === "monster-skills" || field.type === "booster"
                            ? "sm:col-span-2"
                            : ""
                        }
                      >
                        <label className="block text-sm text-gray-400 mb-1.5">{field.label}</label>
                        <FieldRenderer
                          field={field}
                          value={form[field.name]}
                          options={field.optionsFrom ? remoteOptions[field.optionsFrom] : undefined}
                          form={form}
                          fields={config.fields}
                          onChange={(v) => setForm({ ...form, [field.name]: v })}
                          onFormChange={setForm}
                        />
                        {field.hint && <p className="text-xs text-gray-500 mt-1">{field.hint}</p>}
                      </div>
                    ))}
                  </div>
                </AccordionSection>
              ));
            })()}
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
        </Modal>
      )}

      {deleteOpen && (
        <Modal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title={`Deletar ${deleteTargets.length > 1 ? `${deleteTargets.length} registro(s)` : config.title}`}
          maxWidth="max-w-md"
        >
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
        </Modal>
      )}

      <ConfirmationDialog
        open={confirmAllOpen}
        onClose={() => setConfirmAllOpen(false)}
        onConfirm={() => {
          setConfirmAllOpen(false);
          setSelected(new Set(filtered.map((it) => it.id)));
          openDeleteModal(filtered.map((it) => it.id));
        }}
        title="Deletar todos"
        message={`Tem certeza que deseja deletar ${filtered.length} registro(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Deletar todos"
      />

      {moveOpen && (
        <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title={`Mover ${selected.size} item(ns)`} maxWidth="max-w-md">
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
        </Modal>
      )}
    </div>
  );
}
