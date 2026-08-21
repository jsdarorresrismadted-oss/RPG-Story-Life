const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const all = await p.item.findMany({ where: { isActive: true }, select: { name: true, type: true, subtype: true }, orderBy: { type: "asc" } });
    console.log("Todos os itens ativos:");
    all.forEach(i => console.log(`  ${i.name} | type=${i.type} | subtype=${i.subtype}`));
    
    // Buscar por nomes que pareçam material
    const maybeMats = all.filter(i => 
      i.name.toLowerCase().includes("miner") ||
      i.name.toLowerCase().includes("essenc") ||
      i.name.toLowerCase().includes("pedra") ||
      i.name.toLowerCase().includes("madeira") ||
      i.name.toLowerCase().includes("couro") ||
      i.name.toLowerCase().includes("tecido") ||
      i.name.toLowerCase().includes("ferro") ||
      i.name.toLowerCase().includes("ouro") ||
      i.name.toLowerCase().includes("prata") ||
      i.name.toLowerCase().includes("cristal") ||
      i.name.toLowerCase().includes("gema") ||
      i.name.toLowerCase().includes("pó") ||
      i.name.toLowerCase().includes("poeira") ||
      i.name.toLowerCase().includes("fragmento") ||
      i.name.toLowerCase().includes("osso") ||
      i.name.toLowerCase().includes("pele") ||
      i.name.toLowerCase().includes("escama") ||
      i.name.toLowerCase().includes("garra") ||
      i.name.toLowerCase().includes("dente") ||
      i.name.toLowerCase().includes("sangue") ||
      i.name.toLowerCase().includes("mana") ||
      i.name.toLowerCase().includes("ethere") ||
      i.name.toLowerCase().includes("raro") ||
      i.name.toLowerCase().includes("comum") ||
      i.subtype?.toLowerCase().includes("ore") ||
      i.subtype?.toLowerCase().includes("dust") ||
      i.subtype?.toLowerCase().includes("bone") ||
      i.subtype?.toLowerCase().includes("essence")
    );
    console.log("\nPossíveis materiais por nome:");
    maybeMats.forEach(i => console.log(`  ${i.name} | type=${i.type} | subtype=${i.subtype}`));
  } finally {
    await p.$disconnect();
    tunnel.close();
  }
}
main().catch(e => console.error(e));