import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const cls = await p.gameClass.findFirst({ where: { slug: "beta-tester" } });
    if (!cls) throw new Error("classe não encontrada");
    console.log("CLASSE icon:", cls.icon);
    const skills = await p.skill.findMany({
      where: { classId: cls.id },
      select: { name: true, icon: true, iconSecondary: true },
      orderBy: { sortOrder: "asc" },
    });
    for (const s of skills) console.log(`  ${s.name}: icon=${s.icon} sec=${s.iconSecondary}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error(err.message); process.exit(1); });