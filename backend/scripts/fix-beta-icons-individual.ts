import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";
import { generateSkillIcons } from "../src/core/ai/skillIconGenerator";

// Regenera ícones da Beta Tester um por vez (corte perfeito).
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const cls = await p.gameClass.findFirst({ where: { slug: "beta-tester" } });
    if (!cls) throw new Error("classe beta-tester não encontrada");
    const skills = await p.skill.findMany({
      where: { classId: cls.id },
      select: { id: true, name: true, slug: true, kind: true, description: true },
      orderBy: { sortOrder: "asc" },
    });

    for (const s of skills) {
      console.log(`gerando ${s.name}...`);
      const res = await generateSkillIcons({
        name: s.name,
        description: s.description || "",
        kind: s.kind || "attack",
        seed: s.slug,
        key: s.slug,
      });
      await p.skill.update({
        where: { id: s.id },
        data: { icon: res.icon, iconSecondary: res.iconSecondary },
      });
      console.log(`  → ${res.icon} / ${res.iconSecondary}`);
    }
    console.log("OK: 5 skills atualizadas (ícones individuais).");
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });