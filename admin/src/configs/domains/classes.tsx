import AiClassGenerator from "../../components/AiClassGenerator";
import {
  CrudConfig,
  boolBadge,
  idColumn,
  passivesLink,
} from "../shared";

export const classesConfig: CrudConfig = {
  key: "classes",
  title: "Classes",
  headerActions: (reload) => <AiClassGenerator onGenerated={reload} />,
  columns: [
    idColumn,
    { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
    { key: "role", label: "Role" },
    { key: "combatType", label: "Combat" },
    { key: "rankMax", label: "Max Rank" },
    {
      key: "isStarter",
      label: "Starter",
      render: (v) => boolBadge(v, "bg-accent-500/20 text-accent-400", "bg-gray-600/20 text-gray-400"),
    },
    {
      key: "price",
      label: "Preço",
      render: (v) =>
        v > 0 ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{v} gold</span>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    { key: "requiredLevel", label: "Min Nv." },
    {
      key: "requiredVip",
      label: "VIP",
      render: (v) => boolBadge(v, "bg-purple-500/20 text-purple-400", "bg-gray-600/20 text-gray-400"),
    },
    {
      key: "statModelId",
      label: "Stat Model",
      render: (v) =>
        v ? (
          <span className="font-mono text-[11px] text-gray-500" title={v}>
            {String(v).slice(0, 8)}
          </span>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    {
      key: "_passives",
      label: "Passivas",
      render: (_v, item) => passivesLink(item),
    },
  ],
  extraActions: (item) => (
    <span className="mr-3 inline-flex">
      {passivesLink(item)}
    </span>
  ),
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "slug", label: "Slug", type: "text", required: true, placeholder: "e.g. cavaleiro", hint: "Lowercase, no spaces, unique" },
    { name: "description", label: "Description", type: "textarea", required: true },
    { name: "icon", label: "Icon", type: "icon", iconCategories: ["Classes"], placeholder: "/icons/64x64/Classes/..." },
    {
      name: "role",
      label: "Role",
      type: "select",
      required: true,
      defaultValue: "hybrid",
      options: ["tank", "dps", "healer", "support", "hybrid"],
    },
    {
      name: "combatType",
      label: "Combat Type",
      type: "select",
      required: true,
      defaultValue: "melee",
      options: ["melee", "ranged", "caster"],
    },
    { name: "rankMax", label: "Max Rank", type: "number", defaultValue: 10 },
    {
      name: "statModelId",
      label: "Stat Model",
      type: "select",
      optionsFrom: "statModels",
      hint: "Modelo de atributos da classe (deixe vazio para nenhum)",
    },
    {
      name: "resource",
      label: "Resource",
      type: "json",
      jsonSchema: {
        mode: "record",
        valueType: "number",
        addLabel: "Adicionar recurso",
        keyPlaceholder: "manaOnHit, manaOnKill, manaRegenPerTick…",
        valuePlaceholder: "valor",
      },
    },
    { name: "isStarter", label: "Starter Class (available on character creation)", type: "boolean", defaultValue: false },
    { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
    { name: "price", label: "Preço (ouro)", type: "number", defaultValue: 0, hint: "Ouro cobrado ao equipar a classe (0 = grátis). Só cobra na primeira vez." },
    { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 1, hint: "Nível do personagem para equipar a classe" },
    { name: "requiredVip", label: "Exclusiva para VIP", type: "boolean", defaultValue: false, hint: "Só quem já comprou VIP pode equipar" },
    { name: "sortOrder", label: "Sort Order", type: "number", defaultValue: 0 },
  ],
};
