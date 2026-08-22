// Agrupamento de itens para selects (usado por FieldRenderer e CrudPage).
export function itemCategory(it: { type?: string; subtype?: string }): string {
  if (it.type === "material" || (it.type === "consumable" && it.subtype === "material")) return "Materiais";
  if (it.type === "weapon" || it.type === "armor" || it.type === "helm" || it.type === "cape") return "Equipamentos";
  return "Outros";
}

export function itemRoleGroup(it: any): string {
  if (it.inShop) return "🏪 Já na Loja";
  if (it.inDrop) return "🗡️ Drop de Mob";
  if (it.inQuest) return "📜 Em Quest";
  if (it.inCraft) return "⚒️ Em Craft";
  return "✨ Disponíveis";
}

// Agrupamento do seletor de craft (craftSelect): itens de quest vão para um
// grupo separado, marcados para o admin saber que também são usados em quests.
export function itemCraftGroup(it: any): string {
  if (it.usedInQuest) return "📜 Itens de Quest (também usáveis no craft)";
  return "✨ Outros itens de craft";
}
