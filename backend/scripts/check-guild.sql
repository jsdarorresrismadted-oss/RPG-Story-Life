SELECT 'GUILDS' AS t; SELECT id, name, tag, level, "memberCount" FROM "Guild" LIMIT 5;
SELECT 'MEMBERS' AS t; SELECT gm."userId", u.username, gm.role, gm.contribution FROM "GuildMember" gm JOIN "User" u ON u.id = gm."userId" LIMIT 10;
SELECT 'SHOP' AS t; SELECT gs.id, gs."itemId", gs.price, gs."isActive", i.name AS item_name FROM "GuildShopItem" gs LEFT JOIN "Item" i ON i.id = gs."itemId";
SELECT 'QUESTS' AS t; SELECT id, "guildId", type, "targetName", "targetCount", "gcReward", "isActive", "progress"::text FROM "GuildQuest" LIMIT 10;
SELECT 'USERS' AS t; SELECT id, username, "sfCoins", "pvpCoins", gc FROM "User" LIMIT 10;