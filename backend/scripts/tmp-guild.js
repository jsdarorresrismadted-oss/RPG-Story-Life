const { openTunnel } = require('./db-tunnel');
const { PrismaClient } = require('@prisma/client');
(async () => {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const monsters = await prisma.$queryRawUnsafe('SELECT id, name, level, "isActive" FROM "Monster" ORDER BY name');
    console.log('=== Monsters ===');
    for (const r of monsters) console.log(JSON.stringify(r));
    const quests = await prisma.$queryRawUnsafe('SELECT id, "guildId", title, type, "targetName", "targetId", "isActive" FROM "GuildQuest"');
    console.log('=== GuildQuests ===');
    for (const r of quests) console.log(JSON.stringify(r));
    const shop = await prisma.$queryRawUnsafe('SELECT id, "guildId", "itemId", price, "isActive" FROM "GuildShopItem"');
    console.log('=== GuildShopItem ===');
    for (const r of shop) console.log(JSON.stringify(r));
    const guilds = await prisma.$queryRawUnsafe('SELECT id, name FROM "Guild"');
    console.log('=== Guilds ===');
    for (const r of guilds) console.log(JSON.stringify(r));
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
