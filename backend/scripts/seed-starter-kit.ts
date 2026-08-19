import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";
import { autoEquipmentStats } from "../src/core/items/itemAutoStats";

const KIT_ITEMS: { name: string; type: string; subtype: string; description: string }[] = [
  { name: "Espada de Iniciante", type: "weapon", subtype: "sword", description: "Espada simples entregue a novos cavaleiros. Casca — o poder vem do encantamento." },
  { name: "Lança de Iniciante", type: "weapon", subtype: "spear", description: "Lança leve para novos magos treinarem. Casca — o poder vem do encantamento." },
  { name: "Martelo de Iniciante", type: "weapon", subtype: "mace", description: "Martelo de madeira para novos clérigos. Casca — o poder vem do encantamento." },
  { name: "Armadura de Iniciante", type: "armor", subtype: "light", description: "Armadura básica que protege novos heróis. Atributos calculados pelo nível e raridade." },
  { name: "Capacete de Iniciante", type: "helm", subtype: "helmet", description: "Capacete simples de couro. Atributos calculados pelo nível e raridade." },
  { name: "Capa de Iniciante", type: "cape", subtype: "", description: "Capa comum de viajante. Atributos calculados pelo nível e raridade." },
];

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    let criados = 0;
    for (const it of KIT_ITEMS) {
      const exists = await p.item.findFirst({ where: { name: it.name } });
      if (exists) {
        console.log(`ja existe: ${it.name}`);
        continue;
      }
      const stats = autoEquipmentStats(it.type, 1, "common");
      const iconMap: Record<string, string> = {
        sword: "/weaponicon/sword.png",
        spear: "/weaponicon/spear.png",
        mace: "/weaponicon/mace.png",
        light: "/armoricon/armor.png",
        helmet: "/helmeticon/helm.png",
        "": "/cloakicon/cape.png",
      };
      await p.item.create({
        data: {
          name: it.name,
          description: it.description,
          type: it.type,
          subtype: it.subtype || null,
          rarity: "common",
          level: 1,
          rank: 1,
          buyPrice: BigInt(30),
          sellPrice: BigInt(6),
          isActive: true,
          icon: iconMap[it.subtype] ?? null,
          ...stats,
          dps: 0,
          attackSpeedMs: 0,
        },
      });
      criados++;
      console.log(`+ criado: ${it.name} (${it.type}) ${JSON.stringify(stats)}`);
    }
    console.log(`itens criados: ${criados}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});