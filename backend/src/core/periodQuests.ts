// ===== Quest de Passe (diárias / semanais / mensais) — pool fixo rotativo =====
// Admin cria quests com period = "daily" | "weekly" | "monthly".
// O sistema rotaciona: no ciclo atual, ativa um lote de quests do pool;
// ao trocar de ciclo, desativa o lote anterior (e apaga o progresso dos jogadores).

export const PERIOD_ORDER: Record<string, number> = { daily: 0, weekly: 1, monthly: 2 };
export const PERIOD_LABEL_PT: Record<string, string> = { daily: "Diária", weekly: "Semanal", monthly: "Mensal" };
export const PASS_LEVELS = 50;

// Quantas quests ficam ativas por ciclo em cada período
export const PERIOD_QUEST_COUNT: Record<string, number> = { daily: 4, weekly: 3, monthly: 2 };

export function getCycleKey(period: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (period === "daily") return `d:${y}-${m}-${d}`;
  if (period === "monthly") return `m:${y}-${m}`;
  // weekly: ISO semana começando na segunda
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (t.getUTCDay() + 6) % 7; // 0 = segunda
  t.setUTCDate(t.getUTCDate() - day + 3);
  const iso = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - iso.getTime()) / 86400000 - 3 + ((iso.getUTCDay() + 6) % 7)) / 7);
  return `w:${t.getUTCFullYear()}-W${pad(week)}`;
}

export async function rotatePeriodQuests(db: any): Promise<void> {
  const now = new Date();
  for (const period of Object.keys(PERIOD_ORDER)) {
    const key = getCycleKey(period, now);
    // 1) Desativa lotes de ciclos anteriores (e limpa progresso dos jogadores)
    const stale = await db.quest.findMany({
      where: { period, cycleKey: { not: null } },
      select: { id: true },
    });
    const staleIds = stale.filter((q: any) => q.cycleKey !== key).map((q: any) => q.id);
    if (staleIds.length > 0) {
      await db.quest.updateMany({
        where: { id: { in: staleIds } },
        data: { isActive: false, cycleKey: null },
      });
      await db.questProgress.deleteMany({
        where: { questId: { in: staleIds } },
      });
    }
    // 2) Se o lote do ciclo atual está vazio, ativa o próximo do pool
    const active = await db.quest.count({
      where: { period, isActive: true, cycleKey: key },
    });
    if (active > 0) continue;
    const next = await db.quest.findMany({
      where: { period, isActive: false, cycleKey: null },
      orderBy: { sortOrder: "asc" },
      take: PERIOD_QUEST_COUNT[period] ?? 3,
      select: { id: true },
    });
    if (next.length === 0) continue;
    await db.quest.updateMany({
      where: { id: { in: next.map((q: any) => q.id) } },
      data: { isActive: true, cycleKey: key },
    });
  }
}