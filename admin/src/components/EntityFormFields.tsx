import JsonField, { JsonFieldDef } from "./JsonField";
import IconPicker from "./IconPicker";
import MonsterSkillsField from "./MonsterSkillsField";

export interface EntityField {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "boolean" | "icon" | "monster-skills" | "json";
  options?: string[];
  required?: boolean;
  defaultValue?: any;
  hint?: string;
  placeholder?: string;
  jsonSchema?: JsonFieldDef;
}

interface EntityFormFieldsProps {
  fields: EntityField[];
  form: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

export default function EntityFormFields({ fields, form, onChange }: EntityFormFieldsProps) {
  const set = (name: string, v: any) => onChange({ ...form, [name]: v });
  const wide = (t: string) => t === "textarea" || t === "icon" || t === "monster-skills" || t === "json";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((f) => (
        <div key={f.name} className={wide(f.type) ? "sm:col-span-2" : ""}>
          <label className="block text-sm text-gray-400 mb-1.5">
            {f.label}
            {f.required ? " *" : ""}
          </label>
          {f.type === "textarea" ? (
            <textarea
              className={`${inputClass} resize-y`}
              rows={3}
              value={form[f.name] ?? ""}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : f.type === "select" ? (
            <select className={inputClass} value={form[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
              <option value="">Selecione...</option>
              {(f.options || []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === "boolean" ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={!!form[f.name]}
                onChange={(e) => set(f.name, e.target.checked)}
                className="w-4 h-4 accent-accent-500"
              />
              <span className="text-sm text-gray-400">{form[f.name] ? "Sim" : "Não"}</span>
            </div>
          ) : f.type === "icon" ? (
            <IconPicker value={form[f.name] ?? ""} onChange={(v) => set(f.name, v)} />
          ) : f.type === "monster-skills" ? (
            <MonsterSkillsField value={form[f.name]} onChange={(v) => set(f.name, v)} />
          ) : f.type === "json" ? (
            <JsonField schema={f.jsonSchema!} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          ) : f.type === "number" ? (
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form[f.name] ?? 0}
              onChange={(e) => set(f.name, e.target.value === "" ? 0 : Number(e.target.value))}
            />
          ) : (
            <input
              type="text"
              className={inputClass}
              placeholder={f.placeholder}
              value={form[f.name] ?? ""}
              onChange={(e) => set(f.name, e.target.value)}
            />
          )}
          {f.hint && <p className="text-[11px] text-gray-600 mt-1">{f.hint}</p>}
        </div>
      ))}
    </div>
  );
}