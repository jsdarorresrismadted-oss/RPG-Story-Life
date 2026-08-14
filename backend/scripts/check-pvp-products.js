const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const products = await prisma.shopProduct.findMany({
      where: { currency: "pvp_coins" },
      include: { item: { select: { id: true, name: true, icon: true, rarity: true } } },
      orderBy: { sortOrder: "asc" },
    });
    console.log("PRODUTOS PVP_COINS:", products.length);
    for (const p of products) {
      console.log(`- ${p.name} | itemId=${p.itemId ?? "null"} | price=${p.price} | qtd=${p.quantity} | reqLevel=${p.requiredLevel} | reqVip=${p.requiredVip} | active=${p.isActive}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});