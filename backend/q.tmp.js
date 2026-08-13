require("dotenv").config({ path: "C:/Users/Dark/Desktop/RPG-Story-Life-Text/backend/.env" });
const { PrismaClient } = require("C:/Users/Dark/Desktop/RPG-Story-Life-Text/backend/node_modules/@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const [items, quests, maps, mobs, shopItems, ench, npcs, craft, boosters] = await Promise.all([
    prisma.item.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true, level: true, rarity: true, isActive: true } }),
    prisma.quest.count(),
    prisma.map.findMany({ select: { slug: true, name: true, type: true, isActive: true } }),
    prisma.monster.count(),
    prisma.shopItem.count(),
    prisma.enchantment.findMany({ orderBy: { level: "asc" }, select: { name: true, category: true, level: true, rarity: true, isActive: true } }),
    prisma.npc.count(),
    prisma.craftRecipe.count(),
    prisma.booster.count(),
  ]);
  console.log(`items=${items.length} | quests=${quests} | maps=${maps.length} | mobs=${mobs} | shopItems=${shopItems} | ench=${ench.length} | npcs=${npcs} | crafts=${craft} | boosters=${boosters}`);
  console.log("\n=== ITEMS ===");
  for (const i of items) console.log(`${i.name} | ${i.type} | lvl=${i.level} | ${i.rarity} | active=${i.isActive}`);
  console.log("\n=== MAPS ===");
  for (const m of maps) console.log(`${m.slug} | ${m.name} | ${m.type} | active=${m.isActive}`);
  console.log("\n=== ENCHANTMENTS ===");
  for (const e of ench) console.log(`${e.name} | ${e.category} | lvl=${e.level} | ${e.rarity} | active=${e.isActive}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });