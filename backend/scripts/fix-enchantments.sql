-- fix-enchantments.sql — encantamentos: slots arma/armadura/capa/elmo + Eldrin vende todos.
-- 1) Todos os encantamentos valem para arma, armadura, capa e elmo (sem anel/colar).
UPDATE "Enchantment"
SET "compatibleSlots" = '["weapon","armor","cape","helm"]'
WHERE "compatibleSlots" <> '["weapon","armor","cape","helm"]';

-- 2) Eldrin (NPC de encantamentos) vende TODOS os encantamentos ativos, no preço de cada um.
INSERT INTO "ShopItem" ("id", "npcId", "itemId", "enchantmentId", "price", "currency", "stock", "rotationDays", "classId", "requiredLevel", "requiredVip", "requiredQuestIds", "createdAt")
SELECT gen_random_uuid(),
       (SELECT "id" FROM "Npc" WHERE "type" = 'enchantments' ORDER BY "createdAt" LIMIT 1),
       NULL,
       e."id",
       e."price",
       'gold',
       -1,
       0,
       NULL,
       0,
       false,
       NULL,
       now()
FROM "Enchantment" e
WHERE e."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ShopItem" si
    WHERE si."npcId" = (SELECT "id" FROM "Npc" WHERE "type" = 'enchantments' ORDER BY "createdAt" LIMIT 1)
      AND si."enchantmentId" = e."id"
  );