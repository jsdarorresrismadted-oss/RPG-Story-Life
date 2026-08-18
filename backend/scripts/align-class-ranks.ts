import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

// Padrão de ranks por classe:
//   auto rank 1 | ativas rank 1,2,3 (sortOrder 2,3,4) | ultimate rank 5 | passivas rank 4,8,10 (sortOrder 1,2,3)
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const classes = await p.gameClass.findMany({ select: { id: true, name: true, slug: true } });
    let skillsFixed = 0;
    let passivesFixed = 0;
    for (const c of classes) {
      const skills = await p.skill.findMany({ where: { classId: c.id } });
      for (const s of skills) {
        let rank = s.rankRequired;
        if (s.trigger === "auto") rank = 1;
        else if (s.trigger === "ultimate") rank = 5;
        else rank = s.sortOrder >= 2 ? Math.min(3, Math.max(1, s.sortOrder - 1)) : 1;
        if (rank !== s.rankRequired) {
          await p.skill.update({ where: { id: s.id }, data: { rankRequired: rank } });
          console.log(`  skill ${s.name} [${s.trigger}] rank ${s.rankRequired} -> ${rank} (${c.name})`);
          skillsFixed++;
        }
      }
      const passives = await p.passive.findMany({ where: { classId: c.id } });
      for (const pass of passives) {
        const rank = [4, 8, 10][(pass.sortOrder || 1) - 1] || 10;
        if (rank !== pass.rankRequired) {
          await p.passive.update({ where: { id: pass.id }, data: { rankRequired: rank } });
          console.log(`  passiva ${pass.name} rank ${pass.rankRequired} -> ${rank} (${c.name})`);
          passivesFixed++;
        }
      }
    }
    console.log(`\nskills ajustadas: ${skillsFixed} | passivas ajustadas: ${passivesFixed}`);

    const classes2 = await p.gameClass.findMany({ select: { id: true, name: true } });
    for (const c of classes2) {
      const skills = await p.skill.findMany({ where: { classId: c.id }, select: { name: true, trigger: true, rankRequired: true, sortOrder: true } });
      const passives = await p.passive.findMany({ where: { classId: c.id }, select: { name: true, rankRequired: true, sortOrder: true } });
      console.log(`\n=== ${c.name} ===`);
      for (const s of skills.sort((a, b) => a.sortOrder - b.sortOrder)) console.log(`  ${s.trigger}: ${s.name} rank=${s.rankRequired}`);
      for (const pass of passives.sort((a, b) => a.sortOrder - b.sortOrder)) console.log(`  passiva: ${pass.name} rank=${pass.rankRequired}`);
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