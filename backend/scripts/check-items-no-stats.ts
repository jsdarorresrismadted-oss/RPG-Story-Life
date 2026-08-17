import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows: any[] = await p.$queryRawUnsafe(
      'SELECT "type", COUNT(*)::int AS total, SUM(CASE WHEN "strength" > 0 OR "intellect" > 0 OR "endurance" > 0 OR "dexterity" > 0 OR "wisdom" > 0 OR "luck" > 0 THEN 1 ELSE 0 END)::int AS com_stats, SUM(CASE WHEN "dps" > 0 OR "attackSpeedMs" > 0 THEN 1 ELSE 0 END)::int AS com_dps_vel FROM "Item" WHERE "type" IN (\'weapon\',\'helm\',\'armor\',\'cape\') GROUP BY "type"'
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