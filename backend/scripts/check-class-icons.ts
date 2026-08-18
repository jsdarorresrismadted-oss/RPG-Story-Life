import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

// Lista as classes e suas skills com ícones (para checar a classe beta teste).
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const classes = await p.gameClass.findMany({
      select: { id: true, name: true, slug: true, icon: true, isActive: true },
      orderBy: { name: "asc" },
    });
    for (const c of classes) {
      console.log(`\n=== ${c.name} (${c.slug}) ativa=${c.isActive} icon=${c.icon} ===`);
      const skills = await p.skill.findMany({
        where: { classId: c.id },
        select: { name: true, slug: true, icon: true, iconSecondary: true, trigger: true, rankRequired: true, kind: true },
        orderBy: { sortOrder: "asc" },
      });
      for (const s of skills) {
        console.log(`  skill: ${s.name} [${s.trigger}] r${s.rankRequired} icon=${s.icon || "NULO"} sec=${s.iconSecondary || "NULO"}`);
      }
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