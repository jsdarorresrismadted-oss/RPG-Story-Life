import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";
import { autoEquipmentStats, ITEM_STAT_KEYS } from "../src/core/items/itemAutoStats";

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const items: any[] = await p.$queryRawUnsafe(
      'SELECT id, "type", "level", "rarity", "strength", "intellect", "endurance", "dexterity", "wisdom", "luck" FROM "Item" WHERE "type" IN (\'helm\',\'armor\',\'cape\')'
    );
    const zerados = items.filter((i) => ITEM_STAT_KEYS.every((k) => Number(i[k]) <= 0));
    console.log(`itens helm/armor/cape: ${items.length} | sem atributos: ${zerados.length}`);
    let atualizados = 0;
    for (const it of zerados) {
      const auto = autoEquipmentStats(String(it.type), Number(it.level) || 1, String(it.rarity || "common"));
      await p.item.update({
        where: { id: String(it.id) },
        data: { ...auto },
      });
      atualizados++;
      console.log(`+ ${it.name || it.id} (${it.type} nv${it.level} ${it.rarity}) -> ${JSON.stringify(auto)}`);
    }
    console.log(`atributos preenchidos em ${atualizados} item(ns)`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});