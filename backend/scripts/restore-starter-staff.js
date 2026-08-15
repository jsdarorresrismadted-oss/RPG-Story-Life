// Restaura "Cajado do Aprendiz" (cajado inicial do mago) com os dados do seed
// e lista quais itens do seed ainda estão faltando (para conferência).
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const SEED_ITEM_NAMES = [
  "Espada de Iniciante", "Adaga de Iniciante", "Cajado do Aprendiz", "Cajado da Luz",
  "Espada de Ferro", "Adaga Serrilhada", "Cajado Arcano", "Machado de Batalha", "Grimório Antigo",
  "Capuz de Pano", "Elmo de Ferro", "Coroa Arcano",
  "Túnica Simples", "Armadura de Couro", "Cota de Malha",
  "Capa Esfarrapada", "Manto de Veludo", "Capa do Vento",
  "Poção de Vida", "Poção de Mana",
  "Fragmento do Abismo", "Cristal Sombrio", "Núcleo Demoníaco",
  "Espada do Abismo", "Manto do Abismo",
];

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });

  const existing = await prisma.item.findMany({ select: { name: true } });
  const have = new Set(existing.map((i) => i.name));

  const missing = SEED_ITEM_NAMES.filter((n) => !have.has(n));
  console.log("Itens do seed FALTANDO:", missing.length ? missing.join(", ") : "(nenhum)");

  if (!have.has("Cajado do Aprendiz")) {
    const item = await prisma.item.create({
      data: {
        name: "Cajado do Aprendiz",
        description: "Canaliza os primeiros feitiços de um mago.",
        type: "weapon",
        subtype: "staff",
        rarity: "common",
        level: 1,
        rank: 1,
        buyPrice: 50,
        sellPrice: 10,
        intellect: 5,
        attackSpeedMs: 2400,
        dps: 8,
        icon: "/weaponicon/staff.png",
      },
    });
    console.log("RESTAURADO: Cajado do Aprendiz ->", item.id);
  } else {
    console.log("Cajado do Aprendiz já existe.");
  }

  await prisma.$disconnect();
  tunnel.close();
}
main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});