import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";

export function createRaidModule(app: Express): void {
  // Status de raids do personagem: tentativas usadas/máx e tempo até reset
  app.get("/api/raid/status", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findFirst({
        where: { userId: req.user!.userId },
        orderBy: { updatedAt: "desc" },
      });
      const raidMaps = await prisma.map.findMany({
        where: { type: "raid", isActive: true },
        include: {
          monsters: { where: { monster: { isActive: true } }, include: { monster: true }, orderBy: { spawnRate: "desc" } },
        },
        orderBy: { sortOrder: "asc" },
      });

      const now = Date.now();
      const lastReset = character?.lastRaidResetAt ? new Date(character.lastRaidResetAt).getTime() : 0;

      const result = raidMaps.map((m) => {
        const resetMs = (m.raidResetHours || 24) * 60 * 60 * 1000;
        const elapsed = now - lastReset;
        const expired = elapsed > resetMs;
        return {
          map: {
            id: m.id,
            name: m.name,
            slug: m.slug,
            description: m.description,
            region: m.region,
            requiredLevel: m.requiredLevel,
            type: m.type,
            raidResetHours: m.raidResetHours,
            maxRaidAttempts: m.maxRaidAttempts,
            raidWaves: m.raidWaves ?? 10,
            raidDifficulty: m.raidDifficulty ?? 2,
            monsters: m.monsters.map((mm) => ({
              id: mm.monster.id,
              name: mm.monster.name,
              level: mm.monster.level,
              isBoss: mm.monster.isBoss,
              isElite: mm.monster.isElite,
              hp: mm.monster.hp,
              attack: mm.monster.attack,
              imageUrl: mm.monster.imageUrl,
            })),
          },
          attemptsUsed: expired ? 0 : (character?.raidAttempts ?? 0),
          maxAttempts: m.maxRaidAttempts ?? 3,
          resetsInMs: Math.max(0, resetMs - elapsed),
        };
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
