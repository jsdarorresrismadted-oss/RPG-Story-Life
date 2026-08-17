import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const res = await p.item.updateMany({
      where: { type: "weapon", subtype: { in: ["staff", "tome"] } },
      data: { isActive: false },
    });
    console.log(`cajados/grimórios desativados: ${res.count}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});