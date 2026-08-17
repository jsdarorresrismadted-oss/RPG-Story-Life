import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

// Alinha os encantamentos existentes com a fórmula nova:
// - dps base 10 (nível 1 = 10, +2 por nível, teto 308 no nível 150)
// - VIP a cada 2 níveis (pares: 2, 4, 6...): requiredVip = level % 2 === 0
// - velocidade: 1500ms nos VIPs, 2000ms nos normais
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const res = await p.$executeRawUnsafe(`
      UPDATE "Enchantment"
      SET "dps" = 10,
          "attackSpeedMs" = CASE WHEN "level" % 2 = 0 THEN 1500 ELSE 2000 END,
          "requiredVip" = ("level" % 2 = 0)
      WHERE "dps" = 0
    `);
    console.log(`encantamentos alinhados: ${res}`);
    const vips: any[] = await p.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS total FROM "Enchantment" WHERE "requiredVip" = true'
    );
    console.log(`vips agora: ${vips[0]?.total ?? 0}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});