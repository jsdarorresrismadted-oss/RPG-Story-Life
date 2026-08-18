import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { CrudConfig } from "./pages/CrudPage";
import AiClassGenerator from "./components/AiClassGenerator";
import AiItemGenerator from "./components/AiItemGenerator";

const boolBadge = (v: any, yesClass = "bg-green-500/20 text-green-400", noClass = "bg-gray-600/20 text-gray-400") => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v ? yesClass : noClass}`}>
    {v ? "Yes" : "No"}
  </span>
);

const jsonPreview = (v: any) => (
  <span className="text-xs text-gray-500">{v ? JSON.stringify(v).slice(0, 40) : "-"}</span>
);

const TYPE_LABELS: Record<string, string> = {
  weapon: "Arma",
  helm: "Elmo",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
  consumable: "Consumível",
  material: "Material",
};

const TYPE_BADGE: Record<string, string> = {
  weapon: "bg-red-500/20 text-red-300",
  helm: "bg-sky-500/20 text-sky-300",
  armor: "bg-blue-500/20 text-blue-300",
  cape: "bg-purple-500/20 text-purple-300",
  ring: "bg-yellow-500/20 text-yellow-300",
  necklace: "bg-orange-500/20 text-orange-300",
  consumable: "bg-green-500/20 text-green-300",
  material: "bg-teal-500/20 text-teal-300",
};

const RARITY_COLORS: Record<string, string> = {
  common: "bg-gray-600/30 text-gray-300",
  uncommon: "bg-green-600/30 text-green-300",
  rare: "bg-blue-600/30 text-blue-300",
  epic: "bg-purple-600/30 text-purple-300",
  legendary: "bg-yellow-600/30 text-yellow-300",
  mythic: "bg-red-600/30 text-red-300",
};

const idColumn = {
  key: "id",
  label: "ID",
  render: (v: any) => (
    <span className="font-mono text-[11px] text-gray-500" title={v}>
      {String(v ?? "").slice(0, 8)}
    </span>
  ),
};

const CORE_STAT_FIELDS = [
  { key: "strength", label: "Strength" },
  { key: "intellect", label: "Intellect" },
  { key: "endurance", label: "Endurance" },
  { key: "dexterity", label: "Dexterity" },
  { key: "wisdom", label: "Wisdom" },
  { key: "luck", label: "Luck" },
];

const CATEGORY_BADGE: Record<string, string> = {
  melee: "bg-red-500/20 text-red-300",
  caster: "bg-blue-500/20 text-blue-300",
  hybrid: "bg-purple-500/20 text-purple-300",
  support: "bg-green-500/20 text-green-300",
  tank: "bg-yellow-500/20 text-yellow-300",
};

export const crudConfigs: CrudConfig[] = [
  {
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
        render: (v) => (v > 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{v} gold</span> : <span className="text-gray-600">—</span>),
      },
      { key: "requiredLevel", label: "Min Nv." },
      { key: "requiredVip", label: "VIP", render: (v) => boolBadge(v, "bg-purple-500/20 text-purple-400", "bg-gray-600/20 text-gray-400") },
      {
        key: "statModelId",
        label: "Stat Model",
        render: (v) => (v ? <span className="font-mono text-[11px] text-gray-500" title={v}>{String(v).slice(0, 8)}</span> : <span className="text-gray-600">—</span>),
      },
      { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
      {
        key: "_passives",
        label: "Passivas",
        render: (_v, item) => (
          <Link
            to={`/skills?class=${item.id}&tab=passives`}
            className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
            title="Editar passivas desta classe"
          >
            <Sparkles size={12} /> Passivas
          </Link>
        ),
      },
    ],
    extraActions: (item) => (
      <Link
        to={`/skills?class=${item.id}&tab=passives`}
        className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 mr-3"
        title="Editar passivas desta classe"
      >
        <Sparkles size={14} /> Passivas
      </Link>
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
        jsonSchema: { mode: "record", valueType: "number", addLabel: "Adicionar recurso", keyPlaceholder: "manaOnHit, manaOnKill, manaRegenPerTick…", valuePlaceholder: "valor" },
      },
      { name: "isStarter", label: "Starter Class (available on character creation)", type: "boolean", defaultValue: false },
      { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
      { name: "price", label: "Preço (ouro)", type: "number", defaultValue: 0, hint: "Ouro cobrado ao equipar a classe (0 = grátis). Só cobra na primeira vez." },
      { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 1, hint: "Nível do personagem para equipar a classe" },
      { name: "requiredVip", label: "Exclusiva para VIP", type: "boolean", defaultValue: false, hint: "Só quem já comprou VIP pode equipar" },
      { name: "sortOrder", label: "Sort Order", type: "number", defaultValue: 0 },
    ],
  },
  {
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
            <img src={v} alt="" className="w-8 h-8 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
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
        render: (v) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${RARITY_COLORS[v] ?? "bg-gray-700 text-gray-300"}`}>{v || "-"}</span>,
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
      { key: "buyPrice", label: "Preço", render: (v) => <span className="text-yellow-400 text-xs">{Number(v).toLocaleString()}</span> },
      { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "icon", label: "Ícone", type: "icon", placeholder: "/icons/64x64/...", iconCategories: ["Armas", "Elmo", "Elmos Magicos", "Armaduras", "Robes", "Capas", "Aneis", "Colares", "Potion", "Drop Boss"] },
      {
        name: "type",
        label: "Tipo",
        type: "select",
        required: true,
        defaultValue: "weapon",
        options: ["weapon", "helm", "armor", "cape", "consumable", "material"],
      },
      {
        name: "subtype",
        label: "Sub-tipo",
        type: "select",
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
        hint: "Arma = casca (DPS/velocidade só via encantamento). Elmo/armadura/capa ganham ATRIBUTOS calculados por nível+raridade automaticamente.",
      },
      { name: "level", label: "Nível", type: "number", defaultValue: 1, hint: "Define requisito, preço e os atributos automáticos de elmos/armaduras/capas." },
      { name: "rank", label: "Rank", type: "number", defaultValue: 1 },
      {
        name: "boosters",
        label: "Boosters da arma",
        type: "json",
        visibleIf: { field: "type", values: ["weapon"] },
        hint: "1-3 boosters. O valor é capado pela raridade (mítico = 51%). Armazena { name, kind, value }.",
        jsonSchema: {
          mode: "object-array",
          addLabel: "Adicionar booster",
          fields: [
            { name: "name", label: "Nome", type: "text", placeholder: "Dano Brutal" },
            {
              name: "kind",
              label: "Mecânica",
              type: "select",
              options: [
                "damagePercent", "physicalDamagePercent", "magicalDamagePercent", "pvpDamagePercent",
                "pveDamagePercent", "bossDamagePercent", "critChance", "critDamage", "penetration",
                "hitChance", "dodge", "lifestealPercent", "manaStealPercent", "doubleStrikeChance",
                "attackSpeedPercent", "cooldownReduction", "dotPercent", "healingPercent",
                "executionPercent", "fullHpDamagePercent", "damageTakenReduction", "thornsPercent",
              ],
            },
            { name: "value", label: "Valor (%)", type: "number", placeholder: "0-51" },
          ],
        },
      },
      { name: "buyPrice", label: "Preço de compra", type: "number", defaultValue: 0, step: "1" },
      { name: "sellPrice", label: "Preço de venda", type: "number", defaultValue: 0, step: "1" },
      { name: "effects", label: "Effects (consumíveis)", type: "json", visibleIf: { field: "type", values: ["consumable"] }, jsonSchema: { mode: "fixed-record", fields: [
          { key: "heal", label: "Cura" },
          { key: "manaRestore", label: "Recupera Mana" },
        ] } },
      { name: "enchantmentId", label: "Encantamento (fixo)", type: "select", optionsFrom: "enchantments", hint: "Encantamento já gravado no item (opcional)" },
      { name: "isStackable", label: "Empilhável", type: "boolean", defaultValue: false },
      { name: "maxStack", label: "Max stack", type: "number", defaultValue: 1 },
      { name: "isTradable", label: "Negociável", type: "boolean", defaultValue: true },
      { name: "isSellable", label: "Vendável", type: "boolean", defaultValue: true },
      { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
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
  },
  {
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
  },
  {
    key: "shopProducts",
    title: "Loja do Game (produtos)",
    columns: [
      idColumn,
      { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
      { key: "type", label: "Type" },
      { key: "currency", label: "Moeda" },
      { key: "price", label: "Preço" },
      { key: "sfCoinAmount", label: "SF Coins" },
      { key: "vipDays", label: "VIP dias" },
      { key: "quantity", label: "Qtd" },
      {
        key: "stock",
        label: "Estoque",
        render: (v, item) => {
          const stock = Number(v ?? -1);
          const sold = Number((item as any)?.sold ?? 0);
          if (stock < 0) return <span className="text-xs text-gray-500">∞</span>;
          return (
            <span
              className={`text-xs font-mono ${sold >= stock ? "text-red-400" : "text-gray-300"}`}
              title={`${sold} vendidos`}
            >
              {Math.max(0, stock - sold)}/{stock}
            </span>
          );
        },
      },
      { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true, hint: "Unique, lowercase" },
      { name: "description", label: "Description", type: "textarea" },
      {
        name: "type",
        label: "Tipo",
        type: "select",
        required: true,
        defaultValue: "sf_coins_pack",
        options: ["sf_coins_pack", "vip", "pass_premium", "item", "class", "gold_pack", "gacha_ticket"],
        hint: "sf_coins_pack = diamantes (SF Coins) | vip | pass_premium = passe | item | class = classes | gold_pack = pacote de ouro | gacha_ticket = tickets do gacha",
      },
      {
        name: "currency",
        label: "Moeda",
        type: "select",
        required: true,
        defaultValue: "sf_coins",
        options: ["sf_coins", "gold", "money", "pvp_coins"],
        hint: "sf_coins = SF Coins (premium) | gold = ouro | pvp_coins = PVP Coins (loja PvP) | money = moeda real (R$ em centavos, pagamento mock)",
      },
      { name: "price", label: "Preço", type: "number", defaultValue: 0, hint: "Valor na moeda escolhida (SF Coins, gold ou PVP Coins)" },
      { name: "sfCoinAmount", label: "SF Coins entregues (sf_coins_pack)", type: "number", defaultValue: 0 },
      { name: "vipDays", label: "Dias VIP (tipo vip)", type: "number", defaultValue: 0 },
      { name: "goldAmount", label: "Ouro entregue (tipo gold_pack)", type: "number", defaultValue: 0, visibleIf: { field: "type", values: ["gold_pack"] } },
      { name: "gachaTickets", label: "Tickets de gacha entregues (tipo gacha_ticket)", type: "number", defaultValue: 1, visibleIf: { field: "type", values: ["gacha_ticket"] }, hint: "Vendidos por gold ou SF Coins — única forma de comprar tickets" },
      { name: "enchantmentId", label: "Encantamento (tipo enchantment)", type: "select", optionsFrom: "enchantments" },
      { name: "itemId", label: "Item (tipo item)", type: "select", optionsFrom: "items", visibleIf: { field: "type", values: ["item"] } },
      { name: "classId", label: "Classe (tipo class)", type: "select", optionsFrom: "classes", visibleIf: { field: "type", values: ["class"] } },
      { name: "quantity", label: "Quantidade (tipo item)", type: "number", defaultValue: 1, visibleIf: { field: "type", values: ["item"] }, hint: "Quantas unidades do item o jogador recebe por compra" },
      { name: "stock", label: "Estoque (-1 = infinito)", type: "number", defaultValue: -1, visibleIf: { field: "type", values: ["item", "class"] }, hint: "Limite de unidades que podem ser vendidas no total. -1 = sem limite. O jogo bloqueia a compra quando esgota." },
      { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 0, hint: "Nível do personagem ativo para comprar (0 = qualquer)" },
      { name: "requiredVip", label: "Exclusivo VIP", type: "boolean", defaultValue: false },
      { name: "requiredQuestIds", label: "Quests para desbloquear (ids, JSON array)", type: "text", hint: "ex: [\"3f2a1b\", \"8c4d5e\"] — o jogador precisa ter concluído todas para comprar" },
      { name: "icon", label: "Ícone", type: "text" },
      { name: "sortOrder", label: "Sort Order", type: "number", defaultValue: 0 },
      { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
    ],
  },
  {
    key: "patchNotes",
    title: "Patch Notes (Dashboard)",
    columns: [
      idColumn,
      { key: "title", label: "Title", render: (v) => <span className="font-medium text-white">{v}</span> },
      { key: "version", label: "Versão" },
      { key: "content", label: "Conteúdo", render: (v) => <span className="text-gray-400 max-w-xs truncate block whitespace-pre">{v}</span> },
      { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
      {
        key: "createdAt",
        label: "Criado em",
        render: (v) => <span className="text-xs text-gray-500">{v ? new Date(v).toLocaleDateString("pt-BR") : "-"}</span>,
      },
    ],
    fields: [
      { name: "title", label: "Título", type: "text", required: true },
      { name: "version", label: "Versão", type: "text", placeholder: "ex: 1.1" },
      { name: "content", label: "Conteúdo", type: "textarea", required: true, hint: "Aviso exibido no Dashboard do jogo. Use \\n para quebra de linha." },
      { name: "isActive", label: "Active (exibir no jogo)", type: "boolean", defaultValue: true },
    ],
  },
  {
    key: "craftRecipes",
    title: "Craft (receitas)",
    columns: [
      idColumn,
      { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
      {
        key: "resultItemId",
        label: "Resultado",
        render: (v, item) => <span className="text-xs text-gray-300">{(item as any)?.resultItem?.name || String(v ?? "").slice(0, 8)}</span>,
      },
      { key: "resultQuantity", label: "Qtd." },
      { key: "requiredLevel", label: "Min Nv." },
      { key: "ingredients", label: "Ingredientes", render: (v) => jsonPreview(v) },
      { key: "isActive", label: "Active", render: (v) => boolBadge(v) },
    ],
    fields: [
      { name: "name", label: "Nome da receita", type: "text", required: true },
      { name: "description", label: "Descrição", type: "textarea", required: true },
      { name: "resultItemId", label: "Item resultado", type: "select", required: true, optionsFrom: "items", hint: "Item entregue ao craftar" },
      { name: "resultQuantity", label: "Quantidade do resultado", type: "number", defaultValue: 1 },
      { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 1 },
      { name: "requiredQuestIds", label: "Quests para desbloquear (ids, JSON array)", type: "text", hint: "ex: [\"3f2a1b\"] — o jogador precisa ter concluído para craftar" },
      {
        name: "ingredients",
        label: "Ingredientes",
        type: "json",
        jsonSchema: { mode: "object-array", addLabel: "Adicionar material", fields: [
            { name: "itemName", label: "Nome do material", type: "text", placeholder: "ex: Espada de Iniciante" },
            { name: "quantity", label: "Quantidade", type: "number" },
          ] },
      },
      { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
    ],
  },
  {
    key: "boosters",
    title: "Gacha — Anéis e Colares (Boosters)",
    columns: [
      idColumn,
      { key: "name", label: "Name", render: (v) => <span className="font-medium text-white">{v}</span> },
      { key: "type", label: "Tipo", render: (v) => (v === "ring" ? "💍 Anel" : v === "necklace" ? "📿 Colar" : v) },
      {
        key: "rarity",
        label: "Raridade",
        render: (v) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RARITY_COLORS[v] || "bg-gray-600/30 text-gray-300"}`}>{v}</span>,
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
  },
];
