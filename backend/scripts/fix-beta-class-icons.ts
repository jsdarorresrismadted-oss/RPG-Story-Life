import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";
import { generateSkillIconsBatch } from "../src/core/ai/skillIconGenerator";

// Gera ícones reais (arte) para as 5 skills da classe Beta Tester e
// atualiza o GameClass.icon para a arte do classicon.
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const cls = await p.gameClass.findFirst({ where: { slug: "beta-tester" } });
    if (!cls) throw new Error("classe beta-tester não encontrada");
    const skills = await p.skill.findMany({
      where: { classId: cls.id },
      select: { id: true, name: true, slug: true, kind: true, trigger: true, rankRequired: true, description: true },
      orderBy: { sortOrder: "asc" },
    });
    if (skills.length !== 5) throw new Error(`esperava 5 skills, tem ${skills.length}`);

    const inputs = skills.map((s) => ({
      name: s.name,
      description: s.description || "",
      kind: s.kind || "attack",
      key: s.slug,
      seed: s.slug,
    }));

    console.log("gerando ícones principais (5 em 1 imagem)...");
    const primary = await generateSkillIconsBatch(inputs, "primary");

    const actives = inputs.filter((i) => {
      const s = skills.find((x) => x.slug === i.key)!;
      return s.trigger === "active";
    });
    console.log("gerando ícones secundários (3 em 1 imagem)...");
    const secondary = await generateSkillIconsBatch(actives, "secondary");

    let updated = 0;
    for (const s of skills) {
      const icon = primary[s.slug];
      const sec = s.trigger === "active" ? secondary[s.slug] : null;
      if (!icon) throw new Error(`sem ícone principal para ${s.slug}`);
      if (s.trigger === "active" && !sec) throw new Error(`sem ícone secundário para ${s.slug}`);
      await p.skill.update({ where: { id: s.id }, data: { icon, iconSecondary: sec } });
      updated++;
    }
    await p.gameClass.update({ where: { id: cls.id }, data: { icon: "/classicon/beta-tester.png" } });
    console.log(`OK: ${updated} skills atualizadas + ícone da classe.`);
    for (const s of skills) console.log(`  ${s.name}: ${primary[s.slug]}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });