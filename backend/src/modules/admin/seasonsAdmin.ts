import { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../../core/database";
import { config } from "../../core/config";
import { authenticate, requireRole } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { PASS_LEVELS } from "../../core/periodQuests";
import { generateSeasonPlan } from "../../core/ai/seasonGenerator";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    requireRole("admin", "owner")(req, res, next);
  });
}

const aiLimiter = rateLimit({
  windowMs: config.aiRateLimit.windowMs,
  max: config.aiRateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Limite de geracoes de IA atingido. Aguarde um pouco e tente de novo.",
});
const lastAiCall = new Map<string, number>();
function aiCooldown(req: Request, _res: Response, next: NextFunction): void {
  const now = Date.now();
  const last = lastAiCall.get("seasons") || 0;
  const waitMs = config.aiRateLimit.minIntervalMs - (now - last);
  if (waitMs > 0) {
    return next(new AppError(429, "Geracao de IA em cooldown — aguarde " + Math.ceil(waitMs / 1000) + "s."));
  }
  lastAiCall.set("seasons", now);
  next();
}
const aiGuard = [requireAdmin, aiLimiter, aiCooldown];

function logDelete(req: Request, entity: string, targetId: string, action = "delete", detail?: string) {
  const tipo = Number(req.query.tipo) || 0;
  prisma.adminLog
    .create({
      data: {
        adminId: (req as any).user?.userId ?? "system",
        action,
        entity,
        targetId,
        tipo,
        detail: detail ?? null,
      },
    })
    .catch(() => {});
}

function parseRewards(raw: any): string {
  if (typeof raw === "string") return raw;
  return JSON.stringify(Array.isArray(raw) ? raw : []);
}

function emptyTiers() {
  const tiers: { level: number; freeRewards: string; premiumRewards: string }[] = [];
  for (let level = 1; level <= PASS_LEVELS; level++) {
    tiers.push({ level, freeRewards: "[]", premiumRewards: "[]" });
  }
  return tiers;
}

export function createSeasonsAdminModule(app: Express): void {
  // ===== CRUD de temporadas (Season Pass) =====
  app.get("/api/admin/seasons", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const seasons = await prisma.season.findMany({
        include: {
          tiers: { orderBy: { level: "asc" } },
          _count: { select: { passes: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(seasons);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/admin/seasons", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
      const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + 30 * 24 * 3600 * 1000);
      const season = await prisma.$transaction(async (tx) => {
        const s = await tx.season.create({
          data: {
            name: String(body.name || "Temporada").slice(0, 80),
            description: String(body.description || "").slice(0, 400),
            startsAt,
            endsAt,
            isActive: !!body.isActive,
          },
        });
        await tx.seasonTier.createMany({ data: emptyTiers().map((t) => ({ ...t, seasonId: s.id })) });
        return s;
      });
      res.status(201).json(season);
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/admin/seasons/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const data: Record<string, any> = {};
      if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
      if (body.description !== undefined) data.description = String(body.description).slice(0, 400);
      if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt);
      if (body.endsAt !== undefined) data.endsAt = new Date(body.endsAt);
      if (body.isActive !== undefined) data.isActive = !!body.isActive;
      res.json(await prisma.season.update({ where: { id: req.params.id }, data }));
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/admin/seasons/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const season = await prisma.season.findUnique({ where: { id: req.params.id } });
      if (!season) throw new AppError(404, "Temporada não encontrada");
      await prisma.$transaction(async (tx) => {
        await tx.seasonPass.deleteMany({ where: { seasonId: season.id } });
        await tx.seasonTier.deleteMany({ where: { seasonId: season.id } });
        await tx.season.delete({ where: { id: season.id } });
      });
      logDelete(req, "season", season.id, "delete");
      res.json({ message: "Temporada deletada (tiers e passes de jogadores removidos)" });
    } catch (err) {
      next(err);
    }
  });

  // ===== Tiers (níveis do passe) =====
  app.put("/api/admin/seasons/:seasonId/tiers/:tierId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const data: Record<string, any> = {};
      if (body.level !== undefined) data.level = Math.max(1, Math.min(PASS_LEVELS, Math.round(Number(body.level) || 1)));
      if (body.freeRewards !== undefined) data.freeRewards = parseRewards(body.freeRewards);
      if (body.premiumRewards !== undefined) data.premiumRewards = parseRewards(body.premiumRewards);
      res.json(await prisma.seasonTier.update({ where: { id: req.params.tierId }, data }));
    } catch (err) {
      next(err);
    }
  });

  // ===== Passes de jogadores =====
  app.get("/api/admin/seasons/:seasonId/passes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const passes = await prisma.seasonPass.findMany({
        where: { seasonId: req.params.seasonId },
        orderBy: { purchasedAt: "desc" },
      });
      const userIds = [...new Set(passes.map((p) => p.userId))];
      const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.username]));
      res.json(passes.map((p) => ({ ...p, user: { username: userMap.get(p.userId) ?? "?" } })));
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/admin/passes/:passId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pass = await prisma.seasonPass.findUnique({ where: { id: req.params.passId } });
      if (!pass) throw new AppError(404, "Passe não encontrado");
      await prisma.seasonPass.delete({ where: { id: pass.id } });
      logDelete(req, "season-pass", pass.id, "delete", `user ${pass.userId}, season ${pass.seasonId}, level ${pass.level}`);
      res.json({ message: "Passe do jogador removido" });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/admin/seasons/:seasonId/passes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const season = await prisma.season.findUnique({ where: { id: req.params.seasonId } });
      if (!season) throw new AppError(404, "Temporada não encontrada");
      const r = await prisma.seasonPass.deleteMany({ where: { seasonId: season.id } });
      logDelete(req, "season-pass", season.id, "delete", `todos os passes (${r.count}) da temporada`);
      res.json({ message: `${r.count} passe(s) removido(s)` });
    } catch (err) {
      next(err);
    }
  });

  // ===== IA: gerar temporada completa (tiers + quests de passe) =====
  app.post("/api/admin/seasons/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const [items, monsters] = await Promise.all([
        prisma.item.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.monster.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
      ]);
      const plan = await generateSeasonPlan(
        String(body.theme || "").slice(0, 200),
        items.map((i) => i.name),
        monsters.map((m) => m.name)
      );

      const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
      const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + plan.durationDays * 24 * 3600 * 1000);

      const result = await prisma.$transaction(async (tx) => {
        const season = await tx.season.create({
          data: {
            name: plan.name,
            description: plan.description,
            startsAt,
            endsAt,
            isActive: !!body.isActive,
          },
        });
        await tx.seasonTier.createMany({
          data: plan.tiers.map((t) => ({
            seasonId: season.id,
            level: t.level,
            freeRewards: JSON.stringify(t.freeRewards),
            premiumRewards: JSON.stringify(t.premiumRewards),
          })),
        });
        const questCount: Record<string, number> = { daily: 0, weekly: 0, monthly: 0 };
        for (const period of ["daily", "weekly", "monthly"] as const) {
          for (const q of plan.quests[period]) {
            if (!q.title || q.objectives.length === 0) continue;
            await tx.quest.create({
              data: {
                title: q.title,
                description: q.description,
                type: period,
                period,
                difficulty: period === "daily" ? "easy" : period === "weekly" ? "medium" : "hard",
                isActive: false,
                sortOrder: questCount[period]++,
                objectives: JSON.stringify(q.objectives),
                xpReward: q.xpReward,
                goldReward: q.goldReward,
                itemRewards: JSON.stringify(q.itemRewards.map((r) => ({ itemName: r.itemName, quantity: r.quantity }))),
              },
            });
          }
        }
        return { season, quests: questCount };
      });

      res.status(201).json({
        message: "Temporada gerada pela IA (rascunho: quests aguardando rotação automática)",
        season: result.season,
        quests: result.quests,
        tiersWithRewards: plan.tiers.filter((t) => t.freeRewards.length > 0 || t.premiumRewards.length > 0).length,
      });
    } catch (err) {
      next(err);
    }
  });
}