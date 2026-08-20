const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const NAMES = ["Espada de Iniciante", "Adaga de Iniciante", "Cajado do Aprendiz", "Martelo de Iniciante", "Lança de Iniciante"];

const VALID_KINDS = new Set([
  "damagePercent", "physicalDamagePercent", "magicalDamagePercent", "pvpDamagePercent",
  "pveDamagePercent", "bossDamagePercent", "critChance", "critDamage", "penetration",
  "hitChance", "lifestealPercent", "manaStealPercent", "doubleStrikeChance", "attackSpeedPercent",
  "cooldownReduction", "dotPercent", "executionPercent", "fullHpDamagePercent",
]);

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const items = await p.item.findMany({
      where: { type: "weapon", name: { in: NAMES } },
      select: { id: true, name: true, boosters: true },
    });
    for (const item of items) {
      const list = Array.isArray(item.boosters) ? item.boosters : [];
      const valid = list.filter((b) => b && typeof b === "object" && VALID_KINDS.has(String(b.kind)));
      const keep = valid.slice(0, 1);
      if (keep.length === 0) {
        console.log(`SKIP ${item.name}: nenhum booster valido encontrado`);
        continue;
      }
      const kept = keep.map((b) => ({
        slug: String(b.slug || b.name || b.kind),
        name: String(b.name || b.slug || b.kind),
        kind: String(b.kind),
        value: Math.min(250, Math.max(0.1, Number(b.value) || 0.1)),
      }));
      await p.item.update({ where: { id: item.id }, data: { boosters: kept } });
      console.log(`OK ${item.name}: ${list.length} -> ${kept.length} (${kept[0].name} +${kept[0].value}%)`);
    }
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});