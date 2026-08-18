import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const cls = await p.gameClass.findFirst({ where: { slug: "beta-tester" } });
    if (!cls) throw new Error("classe beta-tester não encontrada");
    console.log("classe:", JSON.stringify({ id: cls.id, name: cls.name, slug: cls.slug, icon: cls.icon, isActive: cls.isActive }));
    const skills = await p.skill.findMany({
      where: { classId: cls.id },
      select: { id: true, name: true, slug: true, kind: true, trigger: true, rankRequired: true, description: true, icon: true, iconSecondary: true },
      orderBy: { sortOrder: "asc" },
    });
    for (const s of skills) {
      console.log(JSON.stringify({ id: s.id, name: s.name, kind: s.kind, trigger: s.trigger, rank: s.rankRequired, icon: s.icon, sec: s.iconSecondary, desc: (s.description || "").slice(0, 140) }));
    }
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => { console.error("falha:", err.message || err); process.exit(1); });