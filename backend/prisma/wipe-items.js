// Limpa o banco para "jogo cru": remove TODOS os itens do seed exceto
// itens iniciais (starter), pocoes e materiais de craft, alem dos itens
// gerados pelo gacha (boosterId != null).
//
// Uso (Railway shell do backend ou local com DATABASE_URL):
//   node prisma/wipe-items.js --dry-run    # só conta, não apaga
//   node prisma/wipe-items.js              # executa
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const KEEP_STARTER_NAMES = [
  "Espada de Iniciante",
  "Cajado do Aprendiz",
  "Adaga de Iniciante",
  "Cajado da Luz",
];

const EQUIP_FIELDS = ["weaponId", "classItemId", "helmId", "armorId", "capeId", "ringId", "necklaceId"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const all = await prisma.item.findMany({
    select: { id: true, name: true, subtype: true, boosterId: true },
  });

  const removeIds = all
    .filter(
      (i) =>
        !i.boosterId &&
        i.subtype !== "potion" &&
        i.subtype !== "material" &&
        !KEEP_STARTER_NAMES.includes(i.name)
    )
    .map((i) => i.id);

  console.log(
    `Itens no banco: ${all.length} | manter: ${all.length - removeIds.length} | remover: ${removeIds.length}`
  );

  if (removeIds.length === 0) {
    console.log("Nada a remover.");
    return;
  }

  if (dryRun) {
    const [drops, shop, recipes, inv, market, equipped] = await Promise.all([
      prisma.dropItem.count({ where: { itemId: { in: removeIds } } }),
      prisma.shopItem.count({ where: { itemId: { in: removeIds } } }),
      prisma.craftRecipe.count({ where: { resultItemId: { in: removeIds } } }),
      prisma.inventory.count({ where: { itemId: { in: removeIds } } }),
      prisma.marketListing.count({ where: { itemId: { in: removeIds } } }),
      prisma.equipment.count({ where: { OR: EQUIP_FIELDS.map((f) => ({ [f]: { in: removeIds } })) } }),
    ]);
    console.log("Dry-run (seriam afetados):");
    console.log(
      JSON.stringify({ drops, shopItems: shop, recipes, inventory: inv, market, equipment: equipped }, null, 2)
    );
    console.log("Rode sem --dry-run para executar.");
    return;
  }

  const ops = [
    prisma.dropItem.deleteMany({ where: { itemId: { in: removeIds } } }),
    prisma.shopItem.deleteMany({ where: { itemId: { in: removeIds } } }),
    prisma.craftRecipe.deleteMany({ where: { resultItemId: { in: removeIds } } }),
    prisma.inventory.deleteMany({ where: { itemId: { in: removeIds } } }),
    prisma.marketListing.deleteMany({ where: { itemId: { in: removeIds } } }),
    prisma.item.deleteMany({ where: { id: { in: removeIds } } }),
  ];
  for (const f of EQUIP_FIELDS) {
    ops.push(prisma.equipment.updateMany({ where: { [f]: { in: removeIds } }, data: { [f]: null } }));
  }
  const results = await prisma.$transaction(ops);

  console.log(
    JSON.stringify(
      { dropItems: results[0].count, shopItems: results[1].count, recipes: results[2].count, inventory: results[3].count, market: results[4].count, items: results[5].count, equipmentSlotsLimpados: results.slice(6).reduce((a, r) => a + r.count, 0) },
      null,
      2
    )
  );
  console.log("Limpeza concluida. Itens restantes:");
  const kept = all.filter((i) => !removeIds.includes(i.id));
  for (const k of kept) console.log(`  - ${k.name} (${k.subtype || "sem subtype"})`);
}

main()
  .catch((err) => {
    console.error("ERRO:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());