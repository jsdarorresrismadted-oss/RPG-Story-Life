import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";
import { rollWeaponBoosters } from "../src/core/weapon-boosters";

// Atribui 3 boosters rolados a TODAS as armas sem boosters (raridade define o cap do valor).
async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const weapons = await p.item.findMany({ where: { type: "weapon" }, select: { id: true, name: true, rarity: true, boosters: true } });
    let updated = 0;
    for (const w of weapons) {
      const list = Array.isArray(w.boosters) ? w.boosters : [];
      if (list.length > 0) continue;
      const boosters = rollWeaponBoosters(String(w.rarity || "common"), 3);
      await p.item.update({ where: { id: w.id }, data: { boosters } });
      console.log(`  ${w.name} [${w.rarity}]: ${boosters.map((b) => `${b.name} +${b.value}%`).join(" | ")}`);
      updated++;
    }
    console.log(`\narmas com boosters: ${updated}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});