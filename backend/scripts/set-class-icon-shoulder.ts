// Define /classicon/shoulder.png como ícone de TODAS as classes (padrão único).
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  process.env.DATABASE_URL = tunnel.url;
  const { prisma } = require("../src/core/database");

  const all = await prisma.gameClass.findMany({ select: { id: true, name: true, icon: true } });
  console.log("Classes encontradas:", all.length);
  let changed = 0;
  for (const c of all) {
    if (c.icon !== "/classicon/shoulder.png") {
      await prisma.gameClass.update({ where: { id: c.id }, data: { icon: "/classicon/shoulder.png" } });
      console.log(`  ${c.name}: "${c.icon || "(vazio)"}" -> /classicon/shoulder.png`);
      changed++;
    }
  }
  console.log(changed === 0 ? "Todas já usavam o shoulder — nada a fazer." : `Atualizadas: ${changed}`);
  await prisma.$disconnect().catch(() => {});
  tunnel.close();
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });