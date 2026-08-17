import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    await p.shopProduct.updateMany({ where: { type: "vip", name: "VIP — 7 dias" }, data: { name: "VIP — 3 meses" } });
    await p.shopProduct.updateMany({ where: { type: "vip", name: "VIP — 30 dias" }, data: { name: "VIP — 1 mês" } });
    await p.shopProduct.updateMany({ where: { type: "vip", name: "VIP — 30 dias (R$)" }, data: { name: "VIP — 1 ano" } });
    const rows = await p.shopProduct.findMany({ where: { type: "vip" }, select: { name: true, price: true, currency: true, vipDays: true } });
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