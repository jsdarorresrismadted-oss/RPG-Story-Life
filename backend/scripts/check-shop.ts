import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const rows = await p.shopProduct.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] });
    console.table(rows.map((r) => ({
      type: r.type,
      name: r.name,
      price: Number(r.price),
      currency: r.currency,
      vipDays: r.vipDays,
      sfCoinAmount: r.sfCoinAmount,
      goldAmount: r.goldAmount,
      requiredVip: r.requiredVip,
      requiredLevel: r.requiredLevel,
    })));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});