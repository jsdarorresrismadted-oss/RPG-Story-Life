-- Migração do sistema de moedas (SF Coins / PVP Coins / GC)
-- 1) Renomeia colunas preservando dados
ALTER TABLE "User" RENAME COLUMN "diamonds" TO "sfCoins";
ALTER TABLE "ShopProduct" RENAME COLUMN "diamondAmount" TO "sfCoinAmount";
ALTER TABLE "RedeemCode" RENAME COLUMN "diamonds" TO "sfCoins";

-- 2) Atualiza valores existentes de produtos
UPDATE "ShopProduct" SET "currency" = 'sf_coins' WHERE "currency" = 'diamond';
UPDATE "ShopProduct" SET "type" = 'sf_coins_pack' WHERE "type" = 'diamond_pack';

-- 3) Renomeia chaves do SystemConfig (limits e guild) preservando valores
UPDATE "SystemConfig" SET "value" = jsonb_set("value", '{maxSfCoins}', "value" -> 'maxDiamonds') WHERE "key" = 'limits' AND "value" ? 'maxDiamonds';
UPDATE "SystemConfig" SET "value" = ("value" - 'maxDiamonds') WHERE "key" = 'limits' AND "value" ? 'maxDiamonds';
UPDATE "SystemConfig" SET "value" = jsonb_set("value", '{requiredSfCoins}', "value" -> 'requiredDiamonds') WHERE "key" = 'guild' AND "value" ? 'requiredDiamonds';
UPDATE "SystemConfig" SET "value" = ("value" - 'requiredDiamonds') WHERE "key" = 'guild' AND "value" ? 'requiredDiamonds';