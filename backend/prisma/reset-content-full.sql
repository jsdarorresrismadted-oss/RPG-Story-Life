-- Reset TOTAL do conteúdo do jogo: apaga TODOS os itens, monstros, mapas, NPCs,
-- quests, skills, passivas, efeitos, encantamentos, drops, lojas, craft, raids/pvp
-- gerados por IA e progresso de jogadores. Mantém contas (User), personagens
-- (Character) e as CLASSES INICIAIS/VIP do seed (necessárias pela FK e re-aplicadas
-- no reseed). Personagens voltam para a classe inicial e nível 10.
-- Depois rode o seed:  node prisma/seed-content.js
-- Executar via Railway:
--   railway run -- npx prisma db execute --file prisma/reset-content-full.sql
--   railway run -- node prisma/seed-content.js

-- ===== 1) Progresso / sessões / dados de jogador =====
DELETE FROM "ActiveCooldown";
DELETE FROM "ActiveEffect";
DELETE FROM "CombatSession";
DELETE FROM "RaidRun";
DELETE FROM "PvpMatch";
DELETE FROM "UserEnchantment";
DELETE FROM "UserBooster";
DELETE FROM "Equipment";
DELETE FROM "Inventory";
DELETE FROM "MarketListing";
DELETE FROM "MailItem";
DELETE FROM "Mail";
DELETE FROM "QuestProgress";
DELETE FROM "RedeemRedemption";
DELETE FROM "ShopOrder";
DELETE FROM "CharacterClass";
DELETE FROM "PartyMember";

-- ===== 2) Conteúdo que referencia conteúdo =====
DELETE FROM "DropItem";
DELETE FROM "ShopItem";
DELETE FROM "ShopProduct";
DELETE FROM "CraftRecipe";
DELETE FROM "MapMonster";
DELETE FROM "MapNpc";
DELETE FROM "MapConnection";
DELETE FROM "Quest";

-- ===== 3) Conteúdo em si =====
DELETE FROM "Monster";
DELETE FROM "Item";
DELETE FROM "Npc";
DELETE FROM "Enchantment";
DELETE FROM "Booster";
DELETE FROM "Effect";
DELETE FROM "Map";

-- ===== 4) Skills/passivas de todas as classes (re-seed reaplica as do seed) =====
DELETE FROM "Passive";
DELETE FROM "Skill";

-- ===== 5) Personagens: nível 10 e de volta para a primeira classe inicial =====
UPDATE "Character" c
SET "level" = 10,
    "classId" = s."id",
    "currentHp" = 0,
    "currentMana" = 0
FROM (SELECT "id" FROM "GameClass" WHERE "isStarter" = true ORDER BY "name" LIMIT 1) s
WHERE c."classId" IS NOT NULL;

-- Garante uma CharacterClass ativa para a classe atual do personagem
INSERT INTO "CharacterClass" ("id", "characterId", "classId", "isActive", "rank", "experience", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", c."classId", true, 1, 0, now(), now()
FROM "Character" c
WHERE c."classId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CharacterClass" cc
    WHERE cc."characterId" = c."id" AND cc."classId" = c."classId"
  );

-- ===== 6) StatModels órfãos (o reseed recria os do seed) =====
DELETE FROM "StatModel"
WHERE "id" NOT IN (SELECT "statModelId" FROM "GameClass" WHERE "statModelId" IS NOT NULL);

-- ===== 7) Config global (PvP/raids gerados por IA limpos; admin configura manualmente) =====
DELETE FROM "SystemConfig";
