import AiItemGenerator from "../../components/AiItemGenerator";
import {
  CrudConfig,
  boolBadge,
  idColumn,
  jsonPreview,
  TYPE_LABELS,
  TYPE_BADGE,
  RARITY_COLORS,
} from "../shared";

export const itemsConfig: CrudConfig = {
  key: "items",
  title: "Items",
  headerActions: (reload) => <AiItemGenerator onSaved={reload} />,
  columns: [
    idColumn,
    {
      key: "icon",
      label: "",
      render: (v) =>
        v ? (
          <img
            src={v}
            alt=""
            className="w-8 h-8 object-contain rounded bg-dark-700 p-0.5"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        ),
    },
    { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
    {
      key: "type",
      label: "Type",
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_BADGE[v] || "bg-dark-700 text-gray-300"}`}>
          {TYPE_LABELS[v] || v || "-"}
        </span>
      ),
    },
    {
      key: "rarity",
      label: "Rarity",
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${RARITY_COLORS[v] ?? "bg-gray-700 text-gray-300"}`}>
          {v || "-"}
        </span>
      ),
    },
    { key: "level", label: "Nv." },
    { key: "rarity", label: "Raridade", render: (v) => <span className="text-[11px]">{v}</span> },
    {
      key: "boosters",
      label: "Boosters",
      render: (v) => {
        const list = Array.isArray(v) ? v : [];
        if (!list.length) return <span className="text-gray-600 text-xs">—</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {list.map((b: any) => (
              <span key={String(b.slug || b.name)} className="text-[11px] text-purple-300">
                {b.name || b.kind} +{Number(b.value) || 0}%
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "buyPrice",
      label: "Preço",
      render: (v) => <span className="text-yellow-400 text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: "createdAt",
      label: "Criado em",
      render: (v) =>
        v ? (
          <span className="text-gray-400 text-[11px] whitespace-nowrap">
            {new Date(v).toLocaleDateString("pt-BR")}{" "}
            {new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        ),
    },
    { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    {
      key: "isTemporary",
      label: "Temp",
      render: (v) =>
        v ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-500/20 text-orange-300">
            Temp
          </span>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        ),
    },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true, group: "Identidade" },
    { name: "description", label: "Description", type: "textarea", required: true, group: "Identidade" },
    {
      name: "icon",
      label: "Ícone",
      type: "icon",
      placeholder: "/icons/64x64/...",
      iconCategories: ["Armas", "Elmo", "Elmos Magicos", "Armaduras", "Robes", "Capas", "Aneis", "Colares", "Potion", "Drop Boss"],
      group: "Identidade",
    },
    {
      name: "type",
      label: "Tipo",
      type: "select",
      required: true,
      defaultValue: "weapon",
      options: ["weapon", "helm", "armor", "cape", "consumable", "material"],
      group: "Classificação",
    },
    {
      name: "subtype",
      label: "Sub-tipo",
      type: "select",
      group: "Classificação",
      optionsFor: {
        source: "type",
        map: {
          weapon: ["sword", "dagger", "longsword", "axe", "mace", "spear", "bow", "staff"],
          helm: ["cap", "helmet", "crown", "hood"],
          armor: ["light", "heavy", "robe"],
          cape: [],
          consumable: ["potion", "scroll", "food", "material"],
          material: ["ore", "dust", "bone", "essence"],
        },
      },
    },
    {
      name: "rarity",
      label: "Raridade",
      type: "select",
      required: true,
      defaultValue: "common",
      options: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
      group: "Classificação",
      hint: "Arma = casca (DPS/velocidade só via encantamento). Elmo/armadura/capa ganham ATRIBUTOS calculados por nível+raridade automaticamente.",
    },
    {
      name: "level",
      label: "Nível",
      type: "number",
      defaultValue: 1,
      group: "Classificação",
      hint: "Define requisito, preço e os atributos automáticos de elmos/armaduras/capas.",
    },
    { name: "rank", label: "Rank", type: "number", defaultValue: 1, group: "Classificação" },
    {
      name: "boosters",
      label: "Booster da arma",
      type: "booster",
      group: "Combate",
      visibleIf: { field: "type", values: ["weapon"] },
      hint: "1 booster por arma. Escolha na lista (passe o mouse para ver como funciona) e defina o valor de 0.1% a 250%. 0 desativa.",
    },
    { name: "buyPrice", label: "Preço de compra", type: "number", defaultValue: 0, step: "1", group: "Economia" },
    { name: "sellPrice", label: "Preço de venda", type: "number", defaultValue: 0, step: "1", group: "Economia" },
    { name: "isStackable", label: "Empilhável", type: "boolean", defaultValue: false, group: "Economia" },
    { name: "maxStack", label: "Max stack", type: "number", defaultValue: 1, group: "Economia" },
    { name: "isTradable", label: "Negociável", type: "boolean", defaultValue: true, group: "Economia" },
    { name: "isSellable", label: "Vendável", type: "boolean", defaultValue: true, group: "Economia" },
    {
      name: "effects",
      label: "Effects (consumíveis)",
      type: "json",
      group: "Consumível",
      visibleIf: { field: "type", values: ["consumable"] },
      jsonSchema: {
        mode: "fixed-record",
        fields: [
          { key: "heal", label: "Cura" },
          { key: "manaRestore", label: "Recupera Mana" },
        ],
      },
    },
    { name: "enchantmentId", label: "Encantamento (fixo)", type: "select", optionsFrom: "enchantments", group: "Sistema", hint: "Encantamento já gravado no item (opcional)" },
    { name: "isActive", label: "Active", type: "boolean", defaultValue: true, group: "Sistema" },
    {
      name: "isTemporary",
      label: "Item temporário (Temp Item)",
      type: "boolean",
      defaultValue: false,
      group: "Sistema",
      hint: "Itens de coleta de quest: somem do inventário ao deslogar e ao concluir a quest. Não poluem o inventário permanente.",
    },
  ],
  bulkMoveFields: [
    {
      name: "type",
      label: "Tipo (categoria)",
      type: "select",
      options: ["weapon", "helm", "armor", "cape", "consumable", "material"],
    },
    {
      name: "subtype",
      label: "Sub-tipo",
      type: "select",
      options: ["sword", "dagger", "longsword", "axe", "mace", "spear", "bow", "staff", "cap", "helmet", "crown", "hood", "light", "heavy", "robe", "potion", "scroll", "food", "material", "ore", "dust", "bone", "essence"],
    },
    {
      name: "rarity",
      label: "Raridade",
      type: "select",
      options: ["common", "uncommon", "rare", "epic", "legendary", "mythic"],
    },
  ],
};
