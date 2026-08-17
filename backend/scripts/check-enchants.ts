import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows: any[] = await p.$queryRawUnsafe(
      'SELECT "dps"::float AS dps, "attackSpeedMs", "requiredVip", COUNT(*)::int AS total FROM "Enchantment" GROUP BY 1, 2, 3 ORDER BY 1, 2, 3'
    );
    console.table(rows);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});