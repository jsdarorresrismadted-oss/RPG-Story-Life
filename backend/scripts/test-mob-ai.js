// Teste do gerador de monstros com o prompt exato do dono (usa as APIs reais).
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  process.env.DATABASE_URL = tunnel.url;
  const { generateMonster } = require("../src/core/ai/monsterGenerator");
  const { default: prisma } = require("../src/core/database");

  const idea = "10 mobs do level 1 ao level 6 os ultimos 1 boss e 1 elite.";
  const providerLog = [];
  console.log("Gerando com o prompt:", idea);
  const t0 = Date.now();
  try {
    const gen = await generateMonster(idea, providerLog);
    console.log("OK em", (Date.now() - t0) / 1000, "s");
    console.log("providers:", providerLog);
    console.log("monsters:", gen.monsters.length);
    for (const m of gen.monsters) {
      console.log(`  - ${m.name} | lv ${m.level} | elite=${m.isElite} boss=${m.isBoss} | skills=${m.skills.length}`);
    }
  } catch (err) {
    console.error("ERRO em", (Date.now() - t0) / 1000, "s");
    console.error(String(err.message || err).slice(0, 500));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });