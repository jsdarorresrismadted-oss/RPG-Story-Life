import { JsonFieldDef } from "../components/JsonField";

// Tipos unificados de configuração de CRUD.
// Antes duplicados entre CrudPage (FieldConfig) e EntityFormFields (EntityField);
// agora fonte única para ambos os renderizadores.

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
  group?: string; // agrupa campos em seções (Accordion) no formulário
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
