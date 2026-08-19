// Gera arte real (1 imagem por classe, cortes 64x64) para as skills de
// "Aprendiz de Guerreiro" e "Guardião de Bronze" e salva no banco.
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  process.env.DATABASE_URL = tunnel.url;
  const { generateSkillIconsBatch } = require("../src/core/ai/skillIconGenerator");
  const { prisma } = require("../src/core/database");

  const classes = await prisma.gameClass.findMany({
    where: { name: { in: ["Aprendiz de Guerreiro", "Guardião de Bronze"] } },
    select: { id: true, name: true, skills: { select: { id: true, slug: true, name: true, description: true, kind: true, icon: true }, orderBy: { sortOrder: "asc" } } },
  });
  console.log("Classes:", classes.length);
  for (const cls of classes) {
    console.log(`\n=== ${cls.name} (${cls.skills.length} skills) ===`);
    for (const s of cls.skills) console.log(`  - ${s.name} [${s.kind}] icon: ${s.icon || "(nenhum)"}`);

    const artInputs = cls.skills.map((s) => ({ key: s.slug, name: s.name, description: s.description, kind: s.kind }));
    if (artInputs.length === 0) {
      console.log("  sem skills — pulando");
      continue;
    }
    const t0 = Date.now();
    try {
      const batchArt = await generateSkillIconsBatch(artInputs);
      console.log(`  ARTE GERADA em ${((Date.now() - t0) / 1000).toFixed(1)}s:`);
      for (const s of cls.skills) {
        const icon = batchArt[s.slug];
        if (icon && icon !== s.icon) {
          await prisma.skill.update({ where: { id: s.id }, data: { icon } });
          console.log(`  - ${s.name} -> ${icon}`);
        } else {
          console.log(`  - ${s.name}: (sem mudança) ${icon || s.icon}`);
        }
      }
    } catch (err) {
      console.error(`  FALHOU: ${String(err.message || err).slice(0, 300)}`);
    }
  }
  await prisma.$disconnect().catch(() => {});
  tunnel.close();
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });