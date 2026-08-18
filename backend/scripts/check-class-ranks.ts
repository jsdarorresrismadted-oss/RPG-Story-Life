import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const classes = await p.gameClass.findMany({ select: { id: true, name: true, slug: true, rankMax: true, isActive: true } });
    for (const c of classes) {
      const skills = await p.skill.findMany({ where: { classId: c.id }, select: { name: true, trigger: true, rankRequired: true, sortOrder: true } });
      const passives = await p.passive.findMany({ where: { classId: c.id }, select: { name: true, rankRequired: true, sortOrder: true } });
      console.log(`\n=== ${c.name} (${c.slug}, rankMax ${c.rankMax}, ativa ${c.isActive}) ===`);
      for (const s of skills.sort((a, b) => a.sortOrder - b.sortOrder)) {
        console.log(`  skill: ${s.name} [${s.trigger}] rank=${s.rankRequired} sort=${s.sortOrder}`);
      }
      for (const pass of passives.sort((a, b) => a.sortOrder - b.sortOrder)) {
        console.log(`  passiva: ${pass.name} rank=${pass.rankRequired} sort=${pass.sortOrder}`);
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