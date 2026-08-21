import FieldRenderer from "./FieldRenderer";
import { FieldConfig } from "../configs/types";

// Subconjunto de FieldConfig usado por formulários customizados (Shops, NPCs, etc).
export interface EntityField extends Omit<
  FieldConfig,
  "optionsFrom" | "optionsParams" | "optionsFor" | "visibleIf" | "autoFrom" | "iconCategories" | "group"
> {}

interface EntityFormFieldsProps {
  fields: EntityField[];
  form: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}

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
          <FieldRenderer field={f as FieldConfig} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          {f.hint && <p className="text-[11px] text-gray-600 mt-1">{f.hint}</p>}
        </div>
      ))}
    </div>
  );
}
