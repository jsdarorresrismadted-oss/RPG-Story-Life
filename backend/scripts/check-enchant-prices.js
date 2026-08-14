// check-enchant-prices.js — amostra de preços dos encantamentos na produção.
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT level, "minRank", price FROM "Enchantment" ORDER BY level LIMIT 6'
    );
    const minMax = await prisma.$queryRawUnsafe(
      'SELECT MIN(price)::int AS minp, MAX(price)::int AS maxp, AVG(price)::int AS avgp FROM "Enchantment"'
    );
    console.log(JSON.stringify({ rows, minMax }, (k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});