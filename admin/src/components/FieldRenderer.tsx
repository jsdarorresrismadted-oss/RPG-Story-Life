import JsonField, { JsonFieldDef } from "./JsonField";
import IconPicker from "./IconPicker";
import MonsterSkillsField from "./MonsterSkillsField";
import WeaponBoosterField from "./WeaponBoosterField";
import { inputClass } from "./ui";
import { FieldConfig } from "../configs/types";
import { itemCategory, itemRoleGroup } from "../lib/itemGroups";

interface FieldRendererProps {
  field: FieldConfig;
  value: any;
  options?: any[]; // opções remotas (quando field.optionsFrom)
  form?: Record<string, any>; // formulário completo (para autoFrom / optionsFor)
  fields?: FieldConfig[]; // todos os campos do form (para autoFrom / optionsFor)
  onChange: (value: any) => void; // altera apenas este campo
  onFormChange?: (next: Record<string, any>) => void; // altera o formulário cruzado
}

export default function FieldRenderer({
  field,
  value,
  options,
  form,
  fields,
  onChange,
  onFormChange,
}: FieldRendererProps) {
  const setLocal = (v: any) => {
    if (onFormChange && form && fields) {
      const next = { ...form, [field.name]: v };
      if (field.optionsFor) {
        const allowed = field.optionsFor.map[next[field.optionsFor.source]] || [];
        if (!allowed.includes(next[field.name])) {
          const target = fields.find((f) => f.optionsFor?.source === field.name);
          if (target) next[target.name] = "";
        }
      }
      if (field.optionsFrom === "items") {
        for (const f of fields) {
          if (f.autoFrom === field.name) {
            const sel = (options || []).find((o: any) => o.id === v);
            next[f.name] = sel ? sel.name : "";
          }
        }
      }
      onFormChange(next);
    } else {
      onChange(v);
    }
  };

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-y`}
          rows={3}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "select": {
      const opts = field.optionsFrom ? options || [] : field.optionsFor ? field.optionsFor.map[form?.[field.optionsFor.source] ?? ""] || [] : field.options || [];
      const optionLabel = (opt: any) => {
        if (typeof opt === "string") return opt;
        return opt.slug && opt.slug !== opt.name ? `${opt.name} (${opt.slug})` : opt.name;
      };
      const groupByRole = field.optionsFrom === "items" && opts.length > 0 && opts[0]?.inShop !== undefined;
      const groupItems = field.optionsFrom === "items" && opts.length > 0 && !!opts[0]?.type && !groupByRole;
      return (
        <select
          value={value ?? ""}
          onChange={(e) => setLocal(e.target.value)}
          className={inputClass}
          required={field.required}
        >
          <option value="">{field.optionsFrom ? "Nenhum" : "Select..."}</option>
          {groupByRole ? (
            (() => {
              const groups: Record<string, any[]> = {};
              for (const opt of opts) {
                const cat = itemRoleGroup(opt);
                (groups[cat] ||= []).push(opt);
              }
              return Object.entries(groups).map(([cat, g]) => (
                <optgroup key={cat} label={cat}>
                  {g.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </optgroup>
              ));
            })()
          ) : groupItems ? (
            (() => {
              const groups: Record<string, any[]> = {};
              for (const opt of opts) {
                const cat = itemCategory(opt);
                (groups[cat] ||= []).push(opt);
              }
              return Object.entries(groups).map(([cat, g]) => (
                <optgroup key={cat} label={cat}>
                  {g.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </optgroup>
              ));
            })()
          ) : (
            opts.map((opt: any) => (
              <option key={typeof opt === "string" ? opt : opt.id} value={typeof opt === "string" ? opt : opt.id}>
                {optionLabel(opt)}
              </option>
            ))
          )}
          {value && !opts.some((o: any) => (typeof o === "string" ? o : o.id) === value) && (
            <option value={value}>{value} (atual)</option>
          )}
        </select>
      );
    }
    case "icon":
      return <IconPicker value={value ?? ""} onChange={(v) => onChange(v)} categories={field.iconCategories} />;
    case "boolean":
      return (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
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
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={inputClass}
          required={field.required}
        />
      );
    case "monster-skills":
      return <MonsterSkillsField value={value} onChange={(v) => onChange(v)} />;
    case "booster":
      return <WeaponBoosterField value={value} onChange={(v) => onChange(v)} />;
    case "json":
      if (field.jsonSchema) {
        return <JsonField schema={field.jsonSchema} value={value} onChange={(v) => onChange(v)} />;
      }
      return (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
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
          onChange={(e) => onChange(e.target.value)}
          className={field.autoFrom ? `${inputClass} opacity-70 cursor-not-allowed` : inputClass}
          placeholder={field.placeholder}
          required={field.required && !field.autoFrom}
        />
      );
  }
}
