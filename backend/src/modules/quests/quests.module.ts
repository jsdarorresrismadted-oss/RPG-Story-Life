import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { addItemsToInventory, clampGold } from "../../core/progression";
import { getGameLimits } from "../../core/gameLimits";
import { grantPassXp } from "../seasons/seasons.module";
import { isVipActive, VIP_XP_BONUS, VIP_GOLD_BONUS } from "../../core/progression";
import { rotatePeriodQuests } from "../../core/periodQuests";

export function createQuestsModule(app: Express): void {
  app.get("/api/quests", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rotatePeriodQuests(prisma);
      const { type, mapId } = req.query;
      const where: any = { isActive: true };
      if (type) where.type = type;
      if (mapId) where.mapId = mapId;

      const quests = await prisma.quest.findMany({
        where,
        include: { giverNpc: { select: { name: true } }, map: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      });
      res.json(quests);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/quests/progress", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rotatePeriodQuests(prisma);
      const progress = await prisma.questProgress.findMany({
        where: { userId: req.user!.userId },
        include: { quest: true },
        orderBy: { startedAt: "desc" },
      });
      res.json(progress);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/quests/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quest = await prisma.quest.findUnique({
        where: { id: req.params.id },
        include: { giverNpc: true, map: true },
      });
      if (!quest) {
        res.status(404).json({ error: "Quest not found" });
        return;
      }
      res.json(quest);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/quests/:id/accept", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quest = await prisma.quest.findUnique({ where: { id: req.params.id } });
      if (!quest) throw new AppError(404, "Quest not found");
      if (quest.period && !quest.isActive) throw new AppError(404, "Esta quest não está ativa no momento");

      const existing = await prisma.questProgress.findUnique({
        where: { userId_questId: { userId: req.user!.userId, questId: req.params.id } },
      });
      if (existing) throw new AppError(400, "Quest already accepted or completed");

      // Pré-requisitos: nível, rank e quests anteriores encadeadas
      const character = await prisma.character.findFirst({
        where: { userId: req.user!.userId },
        include: { classProgress: { where: { isActive: true } } },
      });
      if (quest.requiredLevel > 1) {
        const level = character?.level ?? 1;
        if (level < quest.requiredLevel) {
          throw new AppError(403, `Requer nível ${quest.requiredLevel} para aceitar esta quest`);
        }
      }
      if (quest.requiredRank > 1) {
        const rank = character?.classProgress?.[0]?.rank ?? 1;
        if (rank < quest.requiredRank) {
          throw new AppError(403, `Requer rank ${quest.requiredRank} na classe para aceitar esta quest`);
        }
      }
      const chainIds: string[] = (() => {
        try {
          const parsed = JSON.parse(quest.requiredQuestIds || "[]");
          return Array.isArray(parsed) ? parsed.filter((q: any) => typeof q === "string") : [];
        } catch {
          return [];
        }
      })();
      if (chainIds.length > 0) {
        const done = await prisma.questProgress.count({
          where: {
            userId: req.user!.userId,
            questId: { in: chainIds },
            status: { in: ["completed", "claimed"] },
          },
        });
        if (done < chainIds.length) {
          throw new AppError(403, "Complete as quests anteriores para liberar esta");
        }
      }

      const progress = await prisma.questProgress.create({
        data: {
          userId: req.user!.userId,
          questId: req.params.id,
          status: "active",
          progress: "{}",
        },
      });

      res.json(progress);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/quests/:id/abandon", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await prisma.questProgress.deleteMany({
        where: { userId: req.user!.userId, questId: req.params.id },
      });
      if (deleted.count === 0) throw new AppError(404, "Quest progress not found");
      res.json({ message: "Quest canceled" });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/quests/:id/claim", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await prisma.questProgress.findUnique({
        where: { userId_questId: { userId: req.user!.userId, questId: req.params.id } },
        include: { quest: true },
      });
      if (!progress) throw new AppError(404, "Quest progress not found");
      if (progress.status !== "completed") throw new AppError(400, "Quest not completed");
      if (progress.claimedAt) throw new AppError(400, "Rewards already claimed");

      const limits = await getGameLimits();
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { gold: true, vipUntil: true },
      });
      let questXp = Number(progress.quest.xpReward);
      let questGold = Number(progress.quest.goldReward);
      if (isVipActive(user)) {
        questXp = Math.floor(questXp * (1 + VIP_XP_BONUS));
        questGold = Math.floor(questGold * (1 + VIP_GOLD_BONUS));
      }
      const goldGain = clampGold(user?.gold ?? 0n, questGold, BigInt(limits.maxGold));

      // Grant item rewards (JSON: [{ "itemName": "Poção de Vida", "quantity": 2 }])
      let rewards: any[] = [];
      try {
        rewards = JSON.parse(progress.quest.itemRewards || "[]");
      } catch {
        rewards = [];
      }

      await prisma.$transaction(async (tx) => {
        await tx.questProgress.update({
          where: { id: progress.id },
          data: { status: "claimed", claimedAt: new Date() },
        });

        await tx.user.update({
          where: { id: req.user!.userId },
          data: {
            experience: { increment: questXp },
            gold: { increment: goldGain },
          },
        });

        // Entregar recompensas de itens no inventário
        await addItemsToInventory(tx, req.user!.userId, rewards);

        // XP para o passe de temporada: quests de passe (diária/semanal/mensal)
        // dão o XP inteiro da quest; as demais dão 1/5 do XP.
        const passXp = progress.quest.period
          ? Math.floor(Number(progress.quest.xpReward))
          : Math.floor(Number(progress.quest.xpReward) / 5);
        await grantPassXp(tx, req.user!.userId, passXp);
      });

      res.json({ message: "Rewards claimed", xpGain: questXp, goldGain, items: rewards });
    } catch (err) {
      next(err);
    }
  });
}
