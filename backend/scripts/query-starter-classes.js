const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT c.name AS class, s."sortOrder" AS s_sort, s.name AS skill, s.trigger, s."rankRequired" AS s_rank,
             p."sortOrder" AS p_sort, p.name AS passive, p."rankRequired" AS p_rank
      FROM "GameClass" c
      LEFT JOIN "Skill" s ON s."classId" = c.id AND s."isActive" = true
      LEFT JOIN "Passive" p ON p."classId" = c.id AND p."isActive" = true
      WHERE c."isStarter" = true
      ORDER BY c.name, s."sortOrder" NULLS LAST, p."sortOrder" NULLS LAST
    `);
    let cur = "";
    const seen = new Set();
    for (const r of rows) {
      const k = `${r.class}|${r.skill}|${r.passive}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (r.class !== cur) {
        cur = r.class;
        console.log(`\n=== ${cur} ===`);
      }
      if (r.skill && !seen.has(`${r.class}|${r.skill}|`)) {
        seen.add(`${r.class}|${r.skill}|`);
        console.log(`  SKILL [${r.s_sort}] ${r.skill} (${r.trigger}) rank=${r.s_rank}`);
      }
      if (r.passive) console.log(`  PASSIVA [${r.p_sort}] ${r.passive} rank=${r.p_rank}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error("[query] falha:", err.message || err); process.exit(1); });