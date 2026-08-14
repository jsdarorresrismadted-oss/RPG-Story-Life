// check-item-class.js — ofertas de itens com restrição de classe na produção.
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows = await prisma.shopItem.findMany({
      where: { itemId: { not: null }, classId: { not: null } },
      select: { id: true, npc: { select: { name: true } }, item: { select: { name: true } }, class: { select: { name: true } } },
    });
    const total = await prisma.shopItem.count({ where: { itemId: { not: null }, classId: { not: null } } });
    console.log(JSON.stringify({ total, rows }, (k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});