const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const NAMES = ["Espada de Iniciante", "Adaga de Iniciante", "Cajado do Aprendiz", "Martelo de Iniciante", "Lança de Iniciante"];

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const items = await p.item.findMany({
      where: { type: "weapon", name: { in: NAMES } },
      select: { id: true, name: true, rarity: true, boosters: true },
    });
    console.log(JSON.stringify(items, null, 2));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});