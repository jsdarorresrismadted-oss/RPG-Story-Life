// Diagnóstico: conta linhas das tabelas de jogador/conteúdo em produção.
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const USER_TABLES = [
  "User",
  "Character",
  "CharacterClass",
  "Equipment",
  "Inventory",
  "UserEnchantment",
  "UserBooster",
  "QuestProgress",
  "Mail",
  "MarketListing",
  "ShopOrder",
  "PvpMatch",
  "ChatLog",
  "GameLog",
  "CombatLog",
  "Guild",
  "GuildMember",
  "GuildBank",
  "GuildRanking",
  "GuildShopItem",
  "GuildQuest",
];

const CONTENT_TABLES = [
  "Enchantment",
  "ShopItem",
  "ShopProduct",
  "Item",
  "Npc",
  "Monster",
  "Map",
  "GameClass",
  "Skill",
  "Booster",
  "RedeemCode",
  "AdminLog",
  "SystemConfig",
  "PatchNote",
];

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    console.log("== USUÁRIOS ==");
    for (const t of USER_TABLES) {
      try {
        const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
        console.log(`${t}: ${r[0].c}`);
      } catch (e) {
        console.log(`${t}: ERRO (tabela não existe?)`);
      }
    }
    console.log("== CONTEÚDO ==");
    for (const t of CONTENT_TABLES) {
      try {
        const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
        console.log(`${t}: ${r[0].c}`);
      } catch (e) {
        console.log(`${t}: ERRO`);
      }
    }
    console.log("== Usuários ==");
    const users = await prisma.$queryRawUnsafe(
      `SELECT "id","username","role","sfCoins","pvpCoins","gc",COALESCE("lastLoginAt"::text,'-') AS "lastLogin" FROM "User"`
    );
    for (const u of users) console.log(`${u.username} | ${u.role} | sf=${u.sfCoins} pvp=${u.pvpCoins} gc=${u.gc} | login=${u.lastLogin}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("FALHA:", err.message || err);
  process.exit(1);
});