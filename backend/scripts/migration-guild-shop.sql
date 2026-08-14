-- Shop de guilda global: guildId vira opcional e todos os itens viram globais
ALTER TABLE "GuildShopItem" ALTER COLUMN "guildId" DROP NOT NULL;
UPDATE "GuildShopItem" SET "guildId" = NULL;
