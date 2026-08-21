import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { CrudConfig } from "../configs/types";

// ============================================================================
// Helpers compartilhados entre as configurações de CRUD (evita duplicação).
// ============================================================================

export const boolBadge = (
  v: any,
  yesClass = "bg-green-500/20 text-green-400",
  noClass = "bg-gray-600/20 text-gray-400"
) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v ? yesClass : noClass}`}>
    {v ? "Yes" : "No"}
  </span>
);

export const jsonPreview = (v: any) => (
  <span className="text-xs text-gray-500">{v ? JSON.stringify(v).slice(0, 40) : "-"}</span>
);

export const TYPE_LABELS: Record<string, string> = {
  weapon: "Arma",
  helm: "Elmo",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
  consumable: "Consumível",
  material: "Material",
};

export const TYPE_BADGE: Record<string, string> = {
  weapon: "bg-red-500/20 text-red-300",
  helm: "bg-sky-500/20 text-sky-300",
  armor: "bg-blue-500/20 text-blue-300",
  cape: "bg-purple-500/20 text-purple-300",
  ring: "bg-yellow-500/20 text-yellow-300",
  necklace: "bg-orange-500/20 text-orange-300",
  consumable: "bg-green-500/20 text-green-300",
  material: "bg-teal-500/20 text-teal-300",
};

export const RARITY_COLORS: Record<string, string> = {
  common: "bg-gray-600/30 text-gray-300",
  uncommon: "bg-green-600/30 text-green-300",
  rare: "bg-blue-600/30 text-blue-300",
  epic: "bg-purple-600/30 text-purple-300",
  legendary: "bg-yellow-600/30 text-yellow-300",
  mythic: "bg-red-600/30 text-red-300",
};

export const idColumn = {
  key: "id",
  label: "ID",
  render: (v: any) => (
    <span className="font-mono text-[11px] text-gray-500" title={v}>
      {String(v ?? "").slice(0, 8)}
    </span>
  ),
};

export const CORE_STAT_FIELDS = [
  { key: "strength", label: "Strength" },
  { key: "intellect", label: "Intellect" },
  { key: "endurance", label: "Endurance" },
  { key: "dexterity", label: "Dexterity" },
  { key: "wisdom", label: "Wisdom" },
  { key: "luck", label: "Luck" },
];

export const CATEGORY_BADGE: Record<string, string> = {
  melee: "bg-red-500/20 text-red-300",
  caster: "bg-blue-500/20 text-blue-300",
  hybrid: "bg-purple-500/20 text-purple-300",
  support: "bg-green-500/20 text-green-300",
  tank: "bg-yellow-500/20 text-yellow-300",
};

export const passivesLink = (item: any) => (
  <Link
    to={`/skills?class=${item.id}&tab=passives`}
    className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
    title="Editar passivas desta classe"
  >
    <Sparkles size={12} /> Passivas
  </Link>
);

export type { CrudConfig };
