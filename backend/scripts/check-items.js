// Verificação de consistência: itens, encantamentos e referências quebradas.
// Uso: node scripts/check-items.js  (abre o túnel do Railway e conecta no Postgres)
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  console.log("[check] abrindo túnel SSH para o Postgres do Railway...");
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });

  const out = [];
  const line = (label, value, warn = false) => out.push(`${warn ? "⚠️" : "✅"} ${label}: ${value}`);

  const [items, enchantments, userEnchantments, inventory, dropItems, shopItems, shopProducts, guildShop, craftRecipes, marketListings, mailItems, equipments, eventShop] = await Promise.all([
    prisma.item.findMany({ select: { id: true, name: true, isActive: true, enchantmentId: true } }),
    prisma.enchantment.findMany({ select: { id: true, slug: true, name: true, isActive: true } }),
    prisma.userEnchantment.findMany({ select: { id: true, enchantmentId: true } }),
    prisma.inventory.findMany({ select: { id: true, itemId: true } }),
    prisma.dropItem.findMany({ select: { id: true, itemId: true } }),
    prisma.shopItem.findMany({ select: { id: true, itemId: true, enchantmentId: true } }),
    prisma.shopProduct.findMany({ select: { id: true, itemId: true, enchantmentId: true } }),
    prisma.guildShopItem.findMany({ select: { id: true, itemId: true } }),
    prisma.craftRecipe.findMany({ select: { id: true, resultItemId: true } }),
    prisma.marketListing.findMany({ select: { id: true, itemId: true } }),
    prisma.mailItem.findMany({ select: { id: true, itemId: true } }),
    prisma.equipment.findMany({ select: { id: true, weaponId: true, classItemId: true, helmId: true, armorId: true, capeId: true, ringId: true, necklaceId: true } }),
    prisma.eventShopItem.findMany({ select: { id: true, itemId: true } }),
  ]);

  line("Itens (total / ativos / inativos)", `${items.length} / ${items.filter((i) => i.isActive).length} / ${items.filter((i) => !i.isActive).length}`);
  line("Encantamentos (total / ativos)", `${enchantments.length} / ${enchantments.filter((e) => e.isActive).length}`);
  line("Encantamentos possuídos (userEnchantment)", userEnchantments.length);

  const itemIds = new Set(items.map((i) => i.id));
  const enchIds = new Set(enchantments.map((e) => e.id));
  const enchBySlug = new Map(enchantments.map((e) => [e.slug, e]));

  // Itens com encantamento
  const enchantedItems = items.filter((i) => i.enchantmentId);
  line("Itens com encantamento aplicado", enchantedItems.length);
  const missingEnch = enchantedItems.filter((i) => !enchIds.has(i.enchantmentId));
  if (missingEnch.length > 0) line(`Itens com enchantId inexistente (órfãos): ${missingEnch.map((i) => i.name).slice(0, 10).join(", ")}`, `${missingEnch.length}`, true);
  const inactiveEnch = enchantedItems.filter((i) => enchIds.has(i.enchantmentId) && !enchantments.find((e) => e.id === i.enchantmentId)?.isActive);
  if (inactiveEnch.length > 0) line("Itens com encantamento DESATIVADO aplicado", `${inactiveEnch.length} (${inactiveEnch.map((i) => i.name).slice(0, 5).join(", ")})`, true);

  // userEnchantment órfãos
  const orphanUe = userEnchantments.filter((ue) => !enchIds.has(ue.enchantmentId));
  if (orphanUe.length > 0) line("userEnchantment órfãos (encantamento inexistente)", `${orphanUe.length}`, true);

  // Referências a itens inexistentes (itemId nulo = oferta de encantamento/classe, válido)
  const orphans = (rows, label) => {
    const bad = rows.filter((r) => r.itemId && !itemIds.has(r.itemId));
    if (bad.length > 0) line(`${label} apontando para item inexistente`, `${bad.length}`, true);
    else line(`${label}: todas as referências OK`, rows.length);
  };
  orphans(inventory, "Inventário");
  orphans(dropItems, "Drops de monstro");
  orphans(shopItems, "Lojas de NPC (ShopItem)");
  orphans(guildShop, "Shop da guilda");
  orphans(marketListings, "Market");
  orphans(mailItems, "Mail items");
  orphans(craftRecipes, "Receitas de craft (resultado)");
  orphans(eventShop, "Loja de evento");
  const orphanProducts = shopProducts.filter((p) => p.itemId && !itemIds.has(p.itemId));
  if (orphanProducts.length > 0) line("ShopProduct com itemId inexistente", `${orphanProducts.length}`, true);
  else line("ShopProduct (Loja do Game): referências OK", shopProducts.length);

  // Equipamentos apontando para itens inexistentes
  const equipBad = equipments.filter((eq) =>
    ["weaponId", "classItemId", "helmId", "armorId", "capeId", "ringId", "necklaceId"].some((k) => eq[k] && !itemIds.has(eq[k]))
  );
  if (equipBad.length > 0) line("Equipamentos com slot apontando para item inexistente", `${equipBad.length}`, true);
  else line("Equipamentos: todos os slots OK", equipments.length);

  // Encantamentos sem venda e sem uso
  const usedEnch = new Set([
    ...enchantedItems.map((i) => i.enchantmentId),
    ...userEnchantments.map((ue) => ue.enchantmentId),
    ...shopItems.filter((s) => s.enchantmentId).map((s) => s.enchantmentId),
    ...shopProducts.filter((p) => p.enchantmentId).map((p) => p.enchantmentId),
  ]);
  const orphanShopEnch = shopItems.filter((s) => s.enchantmentId && !enchIds.has(s.enchantmentId));
  if (orphanShopEnch.length > 0) line("ShopItem com enchantId inexistente", `${orphanShopEnch.length}`, true);
  const unused = enchantments.filter((e) => !usedEnch.has(e.id));
  if (unused.length > 0) line("Encantamentos sem uso (nem vendido nem aplicado)", `${unused.length} (ex.: ${unused.slice(0, 5).map((e) => e.slug).join(", ")})`, false);

  // Duplicados por slug
  const dupSlugs = enchantments
    .map((e) => e.slug)
    .filter((s, i, arr) => arr.indexOf(s) !== i);
  if (dupSlugs.length > 0) line("Slugs de encantamento duplicados", `${dupSlugs.length}`, true);

  console.log(out.join("\n"));
  await prisma.$disconnect();
  tunnel.close();
}

main().catch((err) => {
  console.error("[check] erro:", err.message || err);
  process.exit(1);
});