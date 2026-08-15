-- Quest de passe: colunas de período (daily/weekly/monthly) e ciclo de rotação.
ALTER TABLE "Quest" ADD COLUMN IF NOT EXISTS "period" TEXT;
ALTER TABLE "Quest" ADD COLUMN IF NOT EXISTS "cycleKey" TEXT;
CREATE INDEX IF NOT EXISTS "Quest_period_idx" ON "Quest" ("period");