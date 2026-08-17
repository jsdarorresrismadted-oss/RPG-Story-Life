import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

const NAMES = [
  "Espada de Iniciante",
  "Escudo de Madeira",
  "Cajado do Aprendiz",
  "Adaga de Iniciante",
  "Cajado da Luz",
  "Poção de Vida",
  "Poção de Mana",
];

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const items: any[] = await p.item.findMany({ select: { id: true, name: true, type: true, rarity: true, level: true, isActive: true } });
    console.table(items.map((i) => ({ ...i, type: i.type })));
    for (const n of NAMES) {
      const hit = items.filter((i) => i.name.toLowerCase().includes(n.toLowerCase()));
      console.log(`${hit.length > 0 ? "OK " : "FALTA"} "${n}" -> ${hit.map((h) => h.name).join(", ") || "-"}`);
    }
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});