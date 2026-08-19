import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

const ICON_BY_SUBTYPE: Record<string, string> = {
  sword: "/weaponicon/sword.png",
  longsword: "/weaponicon/longsword.png",
  dagger: "/daggericon/dagger.png",
  spear: "/weaponicon/spear.png",
  axe: "/weaponicon/axe.png",
  mace: "/weaponicon/mace.png",
  bow: "/weaponicon/bow.png",
  staff: "/weaponicon/staff.png",
  tome: "/weaponicon/staff.png",
  cap: "/helmeticon/helm.png",
  helmet: "/helmeticon/helm.png",
  crown: "/helmeticon/helm.png",
  hood: "/helmeticon/helm.png",
  light: "/armoricon/armor.png",
  heavy: "/armoricon/armor.png",
  robe: "/armoricon/armor.png",
  material: "/materialicon/crystal.png",
  ore: "/materialicon/crystal.png",
  dust: "/materialicon/crystal.png",
  bone: "/materialicon/crystal.png",
  essence: "/materialicon/crystal.png",
  potion: "/potionicon/vida.png",
};

const ICON_BY_TYPE: Record<string, string> = {
  weapon: "/weaponicon/sword.png",
  helm: "/helmeticon/helm.png",
  armor: "/armoricon/armor.png",
  cape: "/cloakicon/cape.png",
  ring: "/ringicon/ring.png",
  necklace: "/necklceicon/necklace.png",
  consumable: "/potionicon/vida.png",
  material: "/materialicon/crystal.png",
};

function defaultIcon(type: string, subtype: string | null): string | null {
  const st = String(subtype || "").toLowerCase();
  return ICON_BY_SUBTYPE[st] || ICON_BY_TYPE[String(type || "").toLowerCase()] || null;
}

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const items = await p.item.findMany({ select: { id: true, name: true, type: true, subtype: true, icon: true } });
    console.log(`Total de itens: ${items.length}`);
    let updated = 0;
    let fixed = 0;
    let skipped = 0;
    for (const it of items) {
      const correct = defaultIcon(it.type, it.subtype);
      if (!correct) { skipped++; continue; }
      if (it.icon !== correct) {
        const had = it.icon ? "corrigido" : "preenchido";
        await p.item.update({ where: { id: it.id }, data: { icon: correct } });
        console.log(`${had}: ${it.name} (${it.type}/${it.subtype || "-"}) ${it.icon || "(sem)"} -> ${correct}`);
        updated++;
        if (it.icon) fixed++;
      }
    }
    console.log(`Itens atualizados: ${updated} (${fixed} corrigidos, ${updated - fixed} preenchidos), sem ícone padrão: ${skipped}`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
