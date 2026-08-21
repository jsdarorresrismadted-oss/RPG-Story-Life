import { CrudConfig, boolBadge, idColumn, RARITY_COLORS } from "../shared";

export const boostersConfig: CrudConfig = {
  key: "boosters",
  title: "Gacha — Anéis e Colares (Boosters)",
  columns: [
    idColumn,
    { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
    {
      key: "type",
      label: "Tipo",
      render: (v) => (v === "ring" ? "💍 Anel" : v === "necklace" ? "📿 Colar" : v),
    },
    {
      key: "rarity",
      label: "Raridade",
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RARITY_COLORS[v] || "bg-gray-600/30 text-gray-300"}`}>
          {v}
        </span>
      ),
    },
    { key: "boostType", label: "Boost" },
    { key: "boostValue", label: "Valor", render: (v) => <span className="text-green-400 text-xs">+{v}%</span> },
    { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
  ],
  fields: [
    { name: "name", label: "Nome", type: "text", required: true },
    { name: "slug", label: "Slug", type: "text", required: true, hint: "Unique, lowercase" },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "icon", label: "Ícone (URL)", type: "text" },
    { name: "type", label: "Tipo", type: "select", required: true, defaultValue: "ring", options: ["ring", "necklace"], hint: "Anel ou Colar — só um de cada pode estar equipado" },
    { name: "rarity", label: "Raridade", type: "select", required: true, defaultValue: "common", options: ["common", "uncommon", "rare", "epic", "legendary", "mythic"] },
    { name: "boostType", label: "Tipo de Boost", type: "select", required: true, defaultValue: "damage", options: ["defense", "damage", "dropChance", "xp", "gold", "classXp"] },
    { name: "boostValue", label: "Valor do Boost (%)", type: "number", required: true, defaultValue: 5, hint: "Máx. por raridade: Comum 5%, Incomum 10%, Raro 15%, Épico 20%, Lendário 25%, Mítico 30%" },
    { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
  ],
};
