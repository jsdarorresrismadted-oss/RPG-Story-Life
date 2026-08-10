import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { computeForce } from "../../core/force";

const LIMIT = 50;

const EQUIP_SLOTS = ["weapon", "classItem", "helm", "armor", "cape", "ring", "necklace"] as const;

export function createLeaderboardModule(app: Express): void {
  // Ranking global de jogadores pelo melhor personagem de cada usuário
  app.get("/api/leaderboard", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const characters = await prisma.character.findMany({
        orderBy: [{ level: "desc" }, { experience: "desc" }],
        include: {
          user: { select: { id: true, username: true, displayName: true, gold: true, diamonds: true, vipUntil: true } },
          class: { select: { name: true, slug: true, icon: true, statModel: true } },
          equipment: {
            include: {
              weapon: true,
              classItem: true,
              helm: true,
              armor: true,
              cape: true,
              ring: true,
              necklace: true,
            },
          },
        },
      });

      // Melhor personagem de cada usuário (primeiro na ordenação já é o maior nível/XP)
      const bestByUser = new Map<string, (typeof characters)[number]>();
      for (const c of characters) {
        if (!bestByUser.has(c.userId)) bestByUser.set(c.userId, c);
      }

      const entries = [...bestByUser.values()].slice(0, LIMIT).map((c, i) => ({
        position: i + 1,
        username: c.user.username,
        displayName: c.user.displayName || c.user.username,
        characterName: c.name,
        className: c.class?.name ?? null,
        classSlug: c.class?.slug ?? null,
        classIcon: c.class?.icon ?? null,
        level: c.level,
        experience: Number(c.experience),
        pvpKills: c.pvpKills,
        force: computeForce({
          level: c.level,
          classCoreStats: parseJson(c.class?.statModel?.coreStats, {}),
          equipment: EQUIP_SLOTS.map((slot) => (c.equipment as any)?.[slot]).map((item: any) =>
            item
              ? {
                  strength: item.strength ?? 0,
                  intellect: item.intellect ?? 0,
                  endurance: item.endurance ?? 0,
                  dexterity: item.dexterity ?? 0,
                  wisdom: item.wisdom ?? 0,
                  luck: item.luck ?? 0,
                }
              : null
          ),
        }),
        gold: Number(c.user.gold),
        diamonds: c.user.diamonds,
        isVip: !!(c.user.vipUntil && new Date(c.user.vipUntil).getTime() > Date.now()),
      }));

      const myCharacter = bestByUser.get(req.user!.userId);
      const myRank = myCharacter
        ? entries.findIndex((e) => e.characterName === myCharacter.name && e.username === myCharacter.user.username) + 1
        : null;

      res.json({ entries, myRank });
    } catch (err) {
      next(err);
    }
  });
}

function parseJson(v: any, fallback: any): any {
  if (!v) return fallback;
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
}
