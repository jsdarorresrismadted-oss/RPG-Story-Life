import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { getGameLimits } from "../../core/gameLimits";
import { computeStats } from "../../core/classEngine/stat-calculator";
import { addItemsToInventory, classXpToNextRank, xpToNextLevel } from "../../core/progression";
import { sumCoreStats } from "../../core/stats/coreStats";

function parseJson(value: any, fallback: any): any {
  if (!value) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

// Starter items granted per class (matched by item name)
const STARTER_KITS: Record<string, { itemName: string; quantity: number }[]> = {
  cavaleiro: [
    { itemName: "Espada de Iniciante", quantity: 1 },
    { itemName: "Escudo de Madeira", quantity: 1 },
    { itemName: "Poção de Vida", quantity: 5 },
  ],
  mago: [
    { itemName: "Cajado do Aprendiz", quantity: 1 },
    { itemName: "Poção de Mana", quantity: 5 },
    { itemName: "Poção de Vida", quantity: 3 },
  ],
  assassino: [
    { itemName: "Adaga de Iniciante", quantity: 1 },
    { itemName: "Poção de Vida", quantity: 5 },
  ],
  suporte: [
    { itemName: "Cajado da Luz", quantity: 1 },
    { itemName: "Poção de Mana", quantity: 5 },
    { itemName: "Poção de Vida", quantity: 3 },
  ],
};

export function createCharacterModule(app: Express): void {
  // Catalog (index) for the creation screen: starter classes with preview stats.
  app.get("/api/characters/index", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const classes = await prisma.gameClass.findMany({
        where: { isActive: true, isStarter: true },
        include: { statModel: true },
        orderBy: { name: "asc" },
      });
      const classesWithStats = await Promise.all(
        classes.map(async (c: any) => {
          const stats = computeStats({
            level: 1,
            statModel: {
              coreStats: parseJson(c.statModel?.coreStats, {}),
            },
            resource: parseJson(c.resource, {}),
            passives: [],
          });
          return {
            ...c,
            stats: {
              hp: stats.hp,
              mana: stats.mana,
              attack: stats.attack,
              defense: stats.defense,
              magic: stats.magic,
              magicDefense: stats.magicDefense,
              speed: stats.speed,
              attackPower: stats.attackPower,
              spellPower: stats.spellPower,
              critChance: stats.critChance,
              critDamage: stats.critDamage,
              dodge: stats.dodge,
              attackSpeedMs: stats.attackSpeedMs,
              manaRegenPerTick: stats.manaRegenPerTick,
              healthRegenPerTick: stats.healthRegenPerTick,
            },
          };
        })
      );
      res.json({ classes: classesWithStats });
    } catch (err) {
      next(err);
    }
  });

  // Create the player's character
  app.post("/api/characters", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, classId, gender } = req.body;
      const characterName = (name ?? "").trim();
      if (!classId) throw new AppError(400, "Class required");
      if (gender !== undefined && !["male", "female"].includes(gender)) {
        throw new AppError(400, "Gender must be 'male' or 'female'");
      }

      const existing = await prisma.character.findFirst({ where: { userId: req.user!.userId } });
      if (existing) throw new AppError(409, "You already have a character");

      const gameClass = await prisma.gameClass.findFirst({
        where: { id: classId, isActive: true },
      });
      if (!gameClass) throw new AppError(404, "Class not found");
      if (!gameClass.isStarter) {
        throw new AppError(400, "This class is not available for new characters");
      }

      const character = await prisma.$transaction(async (tx) => {
        const statModel = gameClass.statModelId ? await tx.statModel.findUnique({ where: { id: gameClass.statModelId } }) : null;
        const stats = computeStats({
          level: 1,
          statModel: parseJson(statModel, {}),
          resource: parseJson(gameClass.resource, {}),
          passives: [],
        });
        const created = await tx.character.create({
          data: {
            userId: req.user!.userId,
            name: characterName.slice(0, 50),
            gender: gender ?? "male",
            classId: gameClass.id,
            currentHp: stats.maxHp,
            currentMana: stats.maxMana,
          },
          include: {
            class: { select: { id: true, name: true, slug: true } },
          },
        });
        await tx.characterClass.create({
          data: { characterId: created.id, classId: gameClass.id, isActive: true },
        });

        const kit = STARTER_KITS[gameClass.slug];
        if (kit && kit.length > 0) {
          await addItemsToInventory(tx, req.user!.userId, kit);
        }

        return created;
      });

      res.status(201).json(character);
    } catch (err) {
      next(err);
    }
  });

  // Current user's character
  app.get("/api/characters/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findFirst({
        where: { userId: req.user!.userId },
        include: {
          class: true,
          activeEffects: { include: { effect: true } },
          classProgress: {
            where: { isActive: true },
            include: { gameClass: { select: { id: true, name: true, slug: true, icon: true } } },
          },
        },
      });
      if (!character) return res.json(null);
      const limits = await getGameLimits();
      const xpToNext = xpToNextLevel(character.level, limits);
      const rankXpToNext = classXpToNextRank(character.classProgress?.[0]?.rank ?? 1);
      res.json({
        ...character,
        xpToNext: Number(xpToNext),
        rankXpToNext: Number(rankXpToNext),
        experience: Number(character.experience),
        atMaxLevel: character.level >= limits.maxLevel,
      });
    } catch (err) {
      next(err);
    }
  });

  // Rank up the active class using its class XP (rank max 10)
  app.post("/api/characters/rank-up", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findFirst({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!character) throw new AppError(404, "Character not found");

      const progress = await prisma.characterClass.findFirst({
        where: { characterId: character.id, isActive: true },
      });
      if (!progress) throw new AppError(404, "Class progress not found");

      const gameClass = await prisma.gameClass.findUnique({
        where: { id: progress.classId },
        select: { rankMax: true },
      });
      const maxRank = gameClass?.rankMax ?? 10;

      if (progress.rank >= maxRank) throw new AppError(400, `Already at max rank (${maxRank})`);

      const xpNeeded = classXpToNextRank(progress.rank);
      if (Number(progress.experience) < xpNeeded) {
        throw new AppError(400, `Need ${xpNeeded} class XP to reach rank ${progress.rank + 1}`);
      }

      const updated = await prisma.characterClass.update({
        where: { id: progress.id },
        data: { rank: { increment: 1 }, experience: { decrement: BigInt(xpNeeded) } },
      });
      res.json({ rank: updated.rank, experience: Number(updated.experience), xpToNext: classXpToNextRank(updated.rank) });
    } catch (err) {
      next(err);
    }
  });

  // Public profile (CharPage): visível por qualquer pessoa autenticada pelo username/displayName.
  app.get("/api/characters/:username/public", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const username = String(req.params.username || "");
      const user = await prisma.user.findFirst({
        where: { OR: [{ username }, { displayName: username }] },
        include: {
          guildMembers: { include: { guild: { select: { id: true, name: true, tag: true, icon: true } } } },
          userAchievements: {
            where: { isCompleted: true },
            include: { achievement: true },
          },
          characters: {
            include: {
              class: {
                include: {
                  statModel: true,
                  passives: { where: { isActive: true } },
                },
              },
              classProgress: { where: { isActive: true } },
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
          },
        },
      });
      if (!user) throw new AppError(404, "Jogador não encontrado");

      const characters = [...user.characters].sort(
        (a, b) => b.level - a.level || Number(b.experience) - Number(a.experience)
      );
      const character = characters[0];
      if (!character) throw new AppError(404, "Este jogador ainda não criou um personagem");

      const gameClass = character.class;
      const rank = character.classProgress?.[0]?.rank ?? 1;
      const passives = (gameClass?.passives || [])
        .filter((p: any) => (p.rankRequired ?? 1) <= rank)
        .map((p: any) => ({ ...p, statModifiers: parseJson(p.statModifiers, {}) }));

      const EQUIP_SLOTS = ["weapon", "classItem", "helm", "armor", "cape", "ring", "necklace"] as const;
      const equipmentList = EQUIP_SLOTS
        .map((slot) => {
          const item = (character.equipment as any)?.[slot];
          if (!item) return null;
          return {
            slot,
            name: item.name,
            icon: item.icon || null,
            rarity: item.rarity || "common",
            type: item.type || slot,
          };
        })
        .filter(Boolean);

      const coreStats = sumCoreStats(
        EQUIP_SLOTS.map((slot) => {
          const item = (character.equipment as any)?.[slot];
          if (!item) return null;
          return {
            strength: item.strength ?? 0,
            intellect: item.intellect ?? 0,
            endurance: item.endurance ?? 0,
            dexterity: item.dexterity ?? 0,
            wisdom: item.wisdom ?? 0,
            luck: item.luck ?? 0,
          };
        })
      );

      const stats = computeStats({
        level: character.level,
        statModel: {
          coreStats: parseJson(gameClass?.statModel?.coreStats, {}),
        },
        resource: parseJson(gameClass?.resource, {}),
        passives,
        coreStats,
        attackSpeedMs: (character.equipment as any)?.weapon?.attackSpeedMs || undefined,
        weaponDps: Number((character.equipment as any)?.weapon?.dps) || undefined,
      });

      const limits = await getGameLimits();
      const achievements = (user.userAchievements || []).map((ua: any) => ({
        id: ua.achievement.id,
        name: ua.achievement.name,
        description: ua.achievement.description,
        icon: ua.achievement.icon,
        category: ua.achievement.category,
        completedAt: ua.completedAt,
      }));

      res.json({
        username: user.username,
        displayName: user.displayName,
        isOnline: user.isOnline,
        isVip: !!(user.vipUntil && new Date(user.vipUntil).getTime() > Date.now()),
        createdAt: character.createdAt,
        character: {
          id: character.id,
          name: character.name,
          gender: character.gender,
          level: character.level,
          experience: Number(character.experience),
          xpToNext: Number(xpToNextLevel(character.level, limits)),
          class: gameClass ? { name: gameClass.name, slug: gameClass.slug, icon: gameClass.icon } : null,
          rank,
          pvpKills: character.pvpKills,
          raidClears: character.raidClears,
          classXp: Number(character.classProgress?.[0]?.experience || 0),
        },
        guild: user.guildMembers?.[0]?.guild || null,
        achievements,
        achievementsCount: achievements.length,
        equipment: equipmentList,
        stats: {
          hp: stats.hp,
          mana: stats.mana,
          attack: stats.attack,
          defense: stats.defense,
          magic: stats.magic,
          magicDefense: stats.magicDefense,
          speed: stats.speed,
          attackPower: stats.attackPower,
          spellPower: stats.spellPower,
          critChance: stats.critChance,
          critDamage: stats.critDamage,
          dodge: stats.dodge,
          attackSpeedMs: stats.attackSpeedMs,
          manaRegenPerTick: stats.manaRegenPerTick,
        },
      });
    } catch (err) {
      next(err);
    }
  });
}
