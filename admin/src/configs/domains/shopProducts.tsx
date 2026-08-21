import { CrudConfig, boolBadge, idColumn } from "../shared";

export const shopProductsConfig: CrudConfig = {
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
    { name: "itemId", label: "Item (tipo item)", type: "select", optionsFrom: "items", optionsParams: { roles: "true" }, visibleIf: { field: "type", values: ["item"] }, hint: "Agrupado por onde o item já é usado: 🏪 Loja, 🗡️ Drop de Mob, 📜 Quest, ⚒️ Craft ou ✨ Disponível." },
    { name: "classId", label: "Classe (tipo class)", type: "select", optionsFrom: "classes", visibleIf: { field: "type", values: ["class"] } },
    { name: "quantity", label: "Quantidade (tipo item)", type: "number", defaultValue: 1, visibleIf: { field: "type", values: ["item"] }, hint: "Quantas unidades do item o jogador recebe por compra" },
    { name: "stock", label: "Estoque (-1 = infinito)", type: "number", defaultValue: -1, visibleIf: { field: "type", values: ["item", "class"] }, hint: "Limite de unidades que podem ser vendidas no total. -1 = sem limite. O jogo bloqueia a compra quando esgota." },
    { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 0, hint: "Nível do personagem ativo para comprar (0 = qualquer)" },
    { name: "requiredVip", label: "Exclusivo VIP", type: "boolean", defaultValue: false },
    { name: "requiredQuestIds", label: "Quests para desbloquear (ids, JSON array)", type: "text", hint: 'ex: ["3f2a1b", "8c4d5e"] — o jogador precisa ter concluído todas para comprar' },
    { name: "icon", label: "Ícone", type: "text" },
    { name: "sortOrder", label: "Sort Order", type: "number", defaultValue: 0 },
    { name: "isActive", label: "Active", type: "boolean", defaultValue: true },
  ],
};
