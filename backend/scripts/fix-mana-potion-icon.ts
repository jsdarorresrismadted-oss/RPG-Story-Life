import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const r = await p.item.updateMany({
      where: { name: { contains: "Mana" }, type: "consumable" },
      data: { icon: "/potionicon/mana.png" },
    });
    console.log("Pocao de Mana corrigida:", r.count);
    const check = await p.item.findMany({ where: { type: "consumable" }, select: { name: true, icon: true } });
    check.forEach((c) => console.log(c.name, "->", c.icon));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
