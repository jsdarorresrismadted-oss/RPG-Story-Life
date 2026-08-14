-- Nenhuma quest de guilda ativa pode mirar o Dummy de Treino
UPDATE "GuildQuest" SET "isActive" = false
WHERE "targetId" = 'd83d512e-a0c3-4838-9401-86b342113305' AND "isActive" = true;
