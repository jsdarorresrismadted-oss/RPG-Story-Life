// Teste do ajuste em massa de monstros via IA (aplica e reverte para não deixar resíduo).
const { openTunnel } = require("./db-tunnel");

const IDEA = "aumente em 1% o HP dos mobs level 3";

async function main() {
  const tunnel = await openTunnel();
  process.env.DATABASE_URL = tunnel.url;
  const { adjustMonsters } = require("../src/core/ai/monsterGenerator");
  const { prisma } = require("../src/core/database");

  const before = await prisma.monster.findMany({ where: { isActive: true, level: 3 }, select: { id: true, name: true, hp: true } });
  console.log("Alvo (level 3 ativos):", before.length);
  for (const b of before.slice(0, 5)) console.log(`  - ${b.name} | hp ${b.hp}`);

  const providerLog = [];
  const t0 = Date.now();
  try {
    const result = await adjustMonsters(IDEA, providerLog);
    console.log("OK em", ((Date.now() - t0) / 1000).toFixed(1), "s | providers:", providerLog);
    console.log("ajustados:", result.adjusted, "| campos:", result.changes, "| ignorados:", result.skipped);
    for (const u of result.updated.slice(0, 5)) console.log(`  - ${u.name}: ${u.changes.join(", ")}`);
    if (result.warnings.length) console.log("warnings:", result.warnings);
  } catch (err) {
    console.error("ERRO em", ((Date.now() - t0) / 1000).toFixed(1), "s");
    console.error(String(err.message || err).slice(0, 500));
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
    process.exit(1);
  }

  const after = await prisma.monster.findMany({ where: { isActive: true, level: 3 }, select: { id: true, name: true, hp: true } });
  console.log("\n--- revertendo alterações ---");
  for (const a of after) {
    const orig = before.find((b) => b.id === a.id);
    if (orig && orig.hp !== a.hp) {
      await prisma.monster.update({ where: { id: a.id }, data: { hp: orig.hp } });
    }
  }
  const check = await prisma.monster.findMany({ where: { isActive: true, level: 3 }, select: { id: true, hp: true } });
  const diff = check.filter((c) => { const o = before.find((b) => b.id === c.id); return o && o.hp !== c.hp; });
  console.log(diff.length === 0 ? "REVERSÃO OK — banco intacto" : `ATENÇÃO: ${diff.length} monstros não revertidos`);

  await prisma.$disconnect().catch(() => {});
  tunnel.close();
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });