import { CrudConfig, boolBadge, idColumn, jsonPreview, CATEGORY_BADGE, CORE_STAT_FIELDS } from "../shared";

export const statModelsConfig: CrudConfig = {
  key: "statModels",
  title: "Stat Models",
  columns: [
    idColumn,
    { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
    { key: "slug", label: "Slug", render: (v) => <span className="text-xs text-gray-500">{v}</span> },
    {
      key: "category",
      label: "Categoria",
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${CATEGORY_BADGE[v] || "bg-dark-700 text-gray-300"}`}>
          {v || "-"}
        </span>
      ),
    },
    { key: "coreStats", label: "Core Stats", render: jsonPreview },
    { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "slug", label: "Slug", type: "text", required: true, hint: "Unique, lowercase" },
    { name: "description", label: "Description", type: "textarea", required: true },
    {
      name: "category",
      label: "Categoria de combate",
      type: "select",
      defaultValue: "hybrid",
      options: ["melee", "caster", "hybrid", "support", "tank"],
      hint: "Define o estilo de combate da identidade",
    },
    {
      name: "coreStats",
      label: "Status Class base (nível 1)",
      type: "json",
      jsonSchema: { mode: "fixed-record", fields: CORE_STAT_FIELDS },
      hint: "ÚNICOS atributos configuráveis: os 6 Status Class, fixos no nível 1 (não crescem por nível). A Combat Engine converte automaticamente: flat (Attack/Spell Power, Max Health, Mana) = +0,5 por ponto; chances/boosts/resistências/penetração = +0,25% por ponto.",
    },
    { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
  ],
};
