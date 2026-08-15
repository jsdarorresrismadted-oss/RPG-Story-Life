-- Padrão de classe: ultimate liberada no rank 5 (não mais no 8) e 4ª skill ativa no rank 4
-- Classes iniciais + VIP (Senhor das Sombras)
UPDATE "Skill" SET "rankRequired" = 5
WHERE "trigger" = 'ultimate' AND "rankRequired" = 8
  AND "classId" IN (SELECT "id" FROM "GameClass" WHERE "isStarter" = true OR "slug" = 'senhor-das-sombras');

UPDATE "Skill" SET "rankRequired" = 4
WHERE "rankRequired" = 5 AND "trigger" <> 'ultimate' AND "sortOrder" = 4
  AND "classId" IN (SELECT "id" FROM "GameClass" WHERE "isStarter" = true OR "slug" = 'senhor-das-sombras');
