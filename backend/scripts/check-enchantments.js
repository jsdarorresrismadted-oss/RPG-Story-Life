// check-enchantments.js — inspeciona o estado dos encantamentos na produção.
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const total = await prisma.enchantment.count();
    const bySlot = await prisma.enchantment.groupBy({
      by: ["compatibleSlots"],
      _count: { _all: true },
    });
    const byCategory = await prisma.enchantment.groupBy({
      by: ["category"],
      _count: { _all: true },
    });
    const sample = await prisma.enchantment.findMany({ take: 3, orderBy: { name: "asc" }, select: { name: true, category: true, compatibleSlots: true, level: true, minRank: true, isActive: true } });
    const eldrin = await prisma.npc.findFirst({ where: { name: { contains: "Eldrin" } }, include: { _count: { select: { shopItems: true } } } });
    const eldrinOffers = eldrin ? await prisma.shopItem.findMany({ where: { npcId: eldrin.id }, take: 3, select: { id: true, enchantment: { select: { name: true } }, item: { select: { name: true } } } }) : [];
    const userEnch = await prisma.userEnchantment.count();
    const itemsEnchanted = await prisma.item.count({ where: { enchantmentId: { not: null } } });

    console.log(JSON.stringify({
      total,
      bySlot,
      byCategory,
      sample,
      eldrin: eldrin ? { id: eldrin.id, type: eldrin.type, shopItemCount: eldrin._count.shopItems, sampleOffers: eldrinOffers } : null,
      userEnch,
      itemsEnchanted,
    }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});
