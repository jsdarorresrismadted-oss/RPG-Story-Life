import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { adminApi } from "../api";

function itemCategory(it: { type?: string; subtype?: string }): string {
  if (it.type === "material" || (it.type === "consumable" && it.subtype === "material")) return "Materiais";
  if (it.type === "weapon" || it.type === "armor" || it.type === "helm" || it.type === "cape") return "Equipamentos";
  return "Outros";
}

export type JsonFieldDef =
  | { mode: "record"; keyPlaceholder?: string; valueType: "number" | "string"; valuePlaceholder?: string; addLabel?: string }
  | { mode: "string-array"; placeholder?: string; addLabel?: string }
  | {
      mode: "object-array";
      fields: { name: string; label: string; type: "text" | "number" | "select" | "effect-slug" | "item-select" | "boolean"; options?: string[]; placeholder?: string; step?: string; itemParams?: Record<string, string> }[];
      addLabel?: string;
    }
  | {
      mode: "fixed-record";
      fields?: { key: string; label: string; valueType?: "number" | "string"; placeholder?: string }[];
      groups?: { label: string; fields: { key: string; label: string; valueType?: "number" | "string"; placeholder?: string }[] }[];
    };

interface JsonFieldProps {
  schema: JsonFieldDef;
  value: any;
  onChange: (v: any) => void;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent-500 focus:outline-none";

const addBtnClass =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600/20 text-accent-400 border border-accent-600/30 hover:bg-accent-600/30 transition-colors";

const effectOptionsCache: { list: { slug: string; name: string }[] } = { list: [] };
const itemOptionsCache: { list: { id: string; name: string }[] } = { list: [] };

function useEffectOptions(schema: JsonFieldDef): { slug: string; name: string }[] {
  const needsEffectOptions = schema.mode === "object-array" && schema.fields.some((f) => f.type === "effect-slug");
  const [list, setList] = useState(effectOptionsCache.list);

  useEffect(() => {
    if (!needsEffectOptions) return;
    if (effectOptionsCache.list.length > 0) {
      setList(effectOptionsCache.list);
      return;
    }
    let active = true;
    adminApi.effects
      .list()
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : [];
        const mapped = items.map((e: any) => ({ slug: e.slug, name: e.name }));
        effectOptionsCache.list = mapped;
        if (active) setList(mapped);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsEffectOptions]);

  return list;
}

function useItemOptions(schema: JsonFieldDef): { id: string; name: string }[] {
  const itemFields = schema.mode === "object-array" ? schema.fields.filter((f) => f.type === "item-select") : [];
  const needsItemOptions = itemFields.length > 0;
  const [list, setList] = useState(itemOptionsCache.list);
  const params = itemFields[0]?.itemParams;

  useEffect(() => {
    if (!needsItemOptions) return;
    if (itemOptionsCache.list.length > 0 && !params) {
      setList(itemOptionsCache.list);
      return;
    }
    let active = true;
    adminApi.items
      .list(params)
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : [];
        const mapped = items.map((i: any) => ({ id: i.id, name: i.name, type: i.type, subtype: i.subtype, usedInQuest: i.usedInQuest }));
        if (!params) itemOptionsCache.list = mapped;
        if (active) setList(mapped);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [needsItemOptions, params]);

  return list;
}

export default function JsonField({ schema, value, onChange }: JsonFieldProps) {
  const effectOptions = useEffectOptions(schema);
  const itemOptions = useItemOptions(schema);

  if (schema.mode === "fixed-record") {
    const current: Record<string, any> =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const allFields = schema.fields ?? (schema.groups || []).flatMap((g) => g.fields);
    const knownKeys = new Set(allFields.map((f) => f.key));

    const setKnown = (key: string, raw: string) => {
      const next = { ...current };
      if (raw === "") {
        delete next[key];
      } else {
        const field = allFields.find((f) => f.key === key);
        next[key] = field?.valueType === "string" ? raw : Number(raw);
      }
      onChange(next);
    };

    const renderGrid = (fields: { key: string; label: string; valueType?: "number" | "string"; placeholder?: string }[]) => (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
            <input
              type={f.valueType === "string" ? "text" : "number"}
              step={f.valueType === "string" ? undefined : "any"}
              className={inputClass}
              placeholder={f.placeholder ?? (f.valueType === "string" ? "valor" : "0")}
              value={current[f.key] ?? ""}
              onChange={(e) => setKnown(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    );

    return (
      <div className="space-y-3">
        {schema.groups
          ? schema.groups.map((g) => (
              <div key={g.label}>
                <div className="text-xs font-semibold text-accent-400 uppercase tracking-wide mb-1.5">
                  {g.label}
                </div>
                {renderGrid(g.fields)}
              </div>
            ))
          : renderGrid(schema.fields || [])}
      </div>
    );
  }

  if (schema.mode === "record") {
    const entries: [string, any][] = Object.entries(
      value && typeof value === "object" && !Array.isArray(value) ? value : {}
    );
    const isNumber = schema.valueType === "number";

    const update = (key: string, v: any) => {
      const next: Record<string, any> = {};
      for (const [k, val] of entries) if (k !== key) next[k] = val;
      if (v !== "" && v !== null && v !== undefined) next[key] = v;
      onChange(next);
    };

    const add = () => {
      const next: Record<string, any> = {};
      for (const [k, val] of entries) next[k] = val;
      next[""] = isNumber ? 0 : "";
      onChange(next);
    };

    return (
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k + "-" + v} className="flex items-center gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder={schema.keyPlaceholder || "key"}
              value={k}
              onChange={(e) => update(k, v)}
            />
            <input
              type={isNumber ? "number" : "text"}
              step={isNumber ? "any" : undefined}
              className={`${inputClass} w-28`}
              placeholder={schema.valuePlaceholder || (isNumber ? "0" : "value")}
              value={v}
              onChange={(e) =>
                update(k, isNumber ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value)
              }
            />
            <button
              type="button"
              onClick={() => update(k, "")}
              className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
              title="Remove"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder={schema.keyPlaceholder || "key"}
              value=""
              onChange={(e) => update(e.target.value, isNumber ? 0 : "")}
            />
            <input type={isNumber ? "number" : "text"} step={isNumber ? "any" : undefined} className={`${inputClass} w-28`} placeholder={isNumber ? "0" : "value"} value="" onChange={() => {}} disabled />
            <button type="button" disabled className="text-gray-700 cursor-not-allowed">
              <X size={16} />
            </button>
          </div>
        )}
        <button type="button" onClick={add} className={addBtnClass}>
          <Plus size={14} /> {schema.addLabel || "Adicionar"}
        </button>
      </div>
    );
  }

  if (schema.mode === "string-array") {
    const list = Array.isArray(value) ? value : [];

    return (
      <div className="space-y-2">
        {list.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder={schema.placeholder || "valor"}
              value={item ?? ""}
              onChange={(e) => {
                const next = [...list];
                next[idx] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== idx))}
              className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
              title="Remove"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...list, ""])} className={addBtnClass}>
          <Plus size={14} /> {schema.addLabel || "Adicionar"}
        </button>
      </div>
    );
  }

  const list = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-3">
      {list.map((item: any, idx: number) => (
        <div key={idx} className="border border-dark-600 rounded-lg p-3 space-y-2 relative">
          <button
            type="button"
            onClick={() => onChange(list.filter((_, i) => i !== idx))}
            className="absolute top-2 right-2 text-gray-500 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <X size={16} />
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
            {schema.fields.map((f) => (
              <div key={f.name}>
                <label className="block text-[11px] text-gray-500 mb-1">{f.label}</label>
                {f.type === "effect-slug" ? (
                  <select
                    className={inputClass}
                    value={item?.[f.name] ?? ""}
                    onChange={(e) => {
                      const next = [...list];
                      next[idx] = { ...(item || {}), [f.name]: e.target.value };
                      onChange(next);
                    }}
                  >
                    <option value="">Selecione...</option>
                    {effectOptions.map((opt) => (
                      <option key={opt.slug} value={opt.slug}>
                        {opt.name}
                      </option>
                    ))}
                    {item?.[f.name] && !effectOptions.some((o) => o.slug === item[f.name]) && (
                      <option value={item[f.name]}>{item[f.name]} (não catalogado)</option>
                    )}
                  </select>
                ) : f.type === "item-select" ? (
                  <select
                    className={inputClass}
                    value={item?.[f.name] ?? ""}
                    onChange={(e) => {
                      const next = [...list];
                      next[idx] = { ...(item || {}), [f.name]: e.target.value };
                      onChange(next);
                    }}
                  >
                    <option value="">Selecione...</option>
                     {(() => {
                      const useCraft = itemOptions.length > 0 && (itemOptions[0] as any)?.usedInQuest !== undefined;
                      const groups: Record<string, { id: string; name: string }[]> = {};
                      for (const opt of itemOptions) {
                        const cat = useCraft
                          ? ((opt as any).usedInQuest ? "📜 Itens de Quest (também usáveis no craft)" : "✨ Outros itens de craft")
                          : itemCategory(opt as any);
                        (groups[cat] ||= []).push(opt as any);
                      }
                      return Object.entries(groups).map(([cat, opts]) => (
                        <optgroup key={cat} label={cat}>
                          {opts.map((opt) => (
                            <option key={opt.id} value={opt.name}>
                              {opt.name}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                    {item?.[f.name] && !itemOptions.some((o) => o.name === item[f.name]) && (
                      <option value={item[f.name]}>{item[f.name]} (não catalogado)</option>
                    )}
                  </select>
                ) : f.type === "select" ? (
                  <select
                    className={inputClass}
                    value={item?.[f.name] ?? ""}
                    onChange={(e) => {
                      const next = [...list];
                      next[idx] = { ...(item || {}), [f.name]: e.target.value };
                      onChange(next);
                    }}
                  >
                    <option value="">Selecione...</option>
                    {(f.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : f.type === "boolean" ? (
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={!!item?.[f.name]}
                      onChange={(e) => {
                        const next = [...list];
                        next[idx] = { ...(item || {}), [f.name]: e.target.checked };
                        onChange(next);
                      }}
                      className="w-4 h-4 accent-purple-500"
                    />
                    <span className="text-xs text-gray-400">{item?.[f.name] ? "Sim" : "Não"}</span>
                  </label>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? (f.step ?? "any") : undefined}
                    className={inputClass}
                    placeholder={f.placeholder}
                    value={item?.[f.name] ?? ""}
                    onChange={(e) => {
                      const next = [...list];
                      next[idx] = {
                        ...(item || {}),
                        [f.name]: f.type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value,
                      };
                      onChange(next);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const empty: Record<string, any> = {};
          for (const f of schema.fields) empty[f.name] = f.type === "number" ? 0 : f.type === "boolean" ? false : "";
          onChange([...list, empty]);
        }}
        className={addBtnClass}
      >
        <Plus size={14} /> {schema.addLabel || "Adicionar"}
      </button>
    </div>
  );
}
