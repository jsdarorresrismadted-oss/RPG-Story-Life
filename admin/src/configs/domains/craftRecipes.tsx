import { CrudConfig, boolBadge, idColumn, jsonPreview } from "../shared";

export const craftRecipesConfig: CrudConfig = {
  key: "craftRecipes",
  title: "Craft (receitas)",
  columns: [
    idColumn,
    { key: "name", label: "Nome (do item)", render: (v) => <span className="font-medium text-white">{v}</span> },
    {
      key: "resultItemId",
      label: "Resultado",
      render: (v, item) => (
        <span className="text-xs text-gray-300">{(item as any)?.resultItem?.name || String(v ?? "").slice(0, 8)}</span>
      ),
    },
    { key: "resultQuantity", label: "Qtd." },
    { key: "requiredLevel", label: "Min Nv." },
    { key: "ingredients", label: "Ingredientes", render: (v) => jsonPreview(v) },
    { key: "isActive", label: "Ativo", render: (v) => boolBadge(v) },
  ],
  fields: [
    {
      name: "resultItemId",
      label: "Item resultado",
      type: "select",
      required: true,
      optionsFrom: "items",
      optionsParams: { unlinkedMaterials: "true", unlinkedEquipment: "true" },
      group: "Resultado do Craft",
      hint: "Apenas itens que NÃO dropam de mobs, NÃO estão em lojas, NÃO estão em quests e NÃO estão em outros crafts. O nome do craft será o nome deste item.",
    },
    { name: "name", label: "Nome (automático)", type: "text", autoFrom: "resultItemId", group: "Resultado do Craft" },
    { name: "resultQuantity", label: "Quantidade do resultado", type: "number", defaultValue: 1, group: "Resultado do Craft" },
    { name: "requiredLevel", label: "Nível mínimo para craftar", type: "number", defaultValue: 1, group: "Requisitos" },
    {
      name: "requiredQuestIds",
      label: "Quests para desbloquear (ids, JSON array)",
      type: "text",
      group: "Requisitos",
      hint: 'ex: ["3f2a1b"] — o jogador precisa ter concluído para craftar',
    },
    {
      name: "ingredients",
      label: "Ingredientes",
      type: "json",
      group: "Ingredientes",
      jsonSchema: {
        mode: "object-array",
        addLabel: "Adicionar ingrediente",
        fields: [
          { name: "itemName", label: "Item (ingrediente)", type: "item-select", itemParams: { unlinkedMaterials: "true", unlinkedEquipment: "true" } },
          { name: "quantity", label: "Quantidade", type: "number" },
        ],
      },
      hint: "Itens que NÃO dropam de mobs, NÃO estão em lojas, NÃO estão em quests e NÃO estão em outros crafts. Materiais e Equipamentos aparecem em grupos separados.",
    },
    { name: "isActive", label: "Ativo (aparece no jogo)", type: "boolean", defaultValue: true, group: "Ingredientes" },
  ],
};
