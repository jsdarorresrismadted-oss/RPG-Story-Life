const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  const ser = (rows) => JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  try {
    const guilds = await prisma.$queryRawUnsafe('SELECT id, name, tag, level, "memberCount" FROM "Guild"');
    console.log("GUILDS:", ser(guilds));
    const members = await prisma.$queryRawUnsafe('SELECT gm."userId", u.username, gm.role, gm.contribution FROM "GuildMember" gm JOIN "User" u ON u.id = gm."userId"');
    console.log("MEMBERS:", ser(members));
    const shop = await prisma.$queryRawUnsafe('SELECT gs.id, gs."itemId", gs.price::text, gs."isActive", i.name AS item_name, i.icon FROM "GuildShopItem" gs LEFT JOIN "Item" i ON i.id = gs."itemId"');
    console.log("SHOP:", ser(shop));
    const quests = await prisma.$queryRawUnsafe('SELECT id, "guildId", type, "targetName", "targetCount", "gcReward"::text, "isActive", "progress"::text FROM "GuildQuest"');
    console.log("QUESTS:", ser(quests));
    const users = await prisma.$queryRawUnsafe('SELECT id, username, "sfCoins", "pvpCoins", gc FROM "User"');
    console.log("USERS:", ser(users));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});