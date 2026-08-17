import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

// Produtos VIP: 1 mês / 3 meses / 1 ano, pagos com SF Coins (moeda real interna).
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const updates: { name: string; price: number; vipDays: number }[] = [
      { name: "VIP — 30 dias", price: 800, vipDays: 30 },
      { name: "VIP — 7 dias", price: 2100, vipDays: 90 },
      { name: "VIP — 30 dias (R$)", price: 7000, vipDays: 365 },
    ];
    for (const u of updates) {
      const r = await p.shopProduct.updateMany({
        where: { type: "vip", name: u.name },
        data: { price: u.price, currency: "sf_coins", vipDays: u.vipDays },
      });
      console.log(`${r.count > 0 ? "OK" : "NAO ACHOU"}: ${u.name} -> ${u.price} SF / ${u.vipDays} dias`);
    }
    const rows = await p.shopProduct.findMany({ where: { type: "vip" } });
    console.table(rows.map((r) => ({ name: r.name, price: Number(r.price), currency: r.currency, vipDays: r.vipDays })));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});