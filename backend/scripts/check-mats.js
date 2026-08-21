const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const all = await p.item.count({ where: { isActive: true } });
    const mats = await p.item.count({ where: { isActive: true, type: "material" } });
    const names = await p.item.findMany({ where: { isActive: true, type: "material" }, select: { name: true }, take: 20 });
    console.log("Total itens ativos:", all);
    console.log("Materiais ativos:", mats);
    console.log("Materiais:", names.map(n => n.name).join(", "));
  } finally {
    await p.$disconnect();
    tunnel.close();
  }
}
main().catch(e => console.error(e));