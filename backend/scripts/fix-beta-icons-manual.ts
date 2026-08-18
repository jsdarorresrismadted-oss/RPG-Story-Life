import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const cls = await p.gameClass.findFirst({ where: { slug: "beta-tester" } });
    if (!cls) throw new Error("classe nao encontrada");
    const skills = await p.skill.findMany({ where: { classId: cls.id }, select: { id: true, name: true, slug: true, trigger: true }, orderBy: { sortOrder: "asc" } });
    const map: Record<string, string> = {
      "comando-basico": "beta-comando-basico",
      "injecao-de-bug": "beta-injecao-de-bug",
      "overclock-de-sistema": "beta-overclock-de-sistema",
      "exploit-de-vulnerabilidade": "beta-exploit-de-vulnerabilidade",
      "crash-de-realidade": "beta-crash-de-realidade",
    };
    for (const s of skills) {
      const prefix = map[s.slug];
      if (!prefix) { console.log("SKIP:", s.name); continue; }
      const icon = "/iconskill/" + prefix + ".png";
      const sec = s.trigger === "active" ? icon : null;
      await p.skill.update({ where: { id: s.id }, data: { icon, iconSecondary: sec } });
      console.log(s.name + ": " + icon + (sec ? " (sec=mesmo)" : " (sem sec)"));
    }
    console.log("OK");
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });