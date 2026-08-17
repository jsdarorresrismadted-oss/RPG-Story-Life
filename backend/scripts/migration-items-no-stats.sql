-- migration-items-no-stats.sql
-- EQUIPAMENTOS SÃO CASCAS: arma, elmo, armadura e capa NÃO têm stats/dps/velocidade
-- próprios — tudo vem do ENCANTAMENTO. Zera os campos em todos os itens existentes.
-- (Anéis/colares ficam intactos: sistema próprio de boost do gacha.)
UPDATE "Item"
SET "strength" = 0, "intellect" = 0, "endurance" = 0, "dexterity" = 0, "wisdom" = 0, "luck" = 0,
    "dps" = 0, "attackSpeedMs" = 0
WHERE "type" IN ('weapon', 'helm', 'armor', 'cape');