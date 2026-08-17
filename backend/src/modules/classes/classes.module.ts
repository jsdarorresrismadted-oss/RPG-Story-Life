import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { computeStats, CLASS_STAT_CONVERSION } from "../../core/classEngine/stat-calculator";
import { applyClassXp, classXpToNextRank } from "../../core/progression";
import { sumCoreStats } from "../../core/stats/coreStats";
import { computeEnchantmentStats, effectiveWeaponDps, effectiveWeaponSpeed } from "../../core/enchantments/enchantmentStats";
import { hasAnyItemStat, minEquipmentStats } from "../../core/items/itemAutoStats";
import { getTotalBoosterBonuses } from "../../core/boosters";
import { PassiveDef } from "../../core/classEngine/types";

function parseJson(value: any, fallback: any = null): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Stats de exibição (nível 1) calculados a partir do StatModel da classe.
export function displayStats(gameClass: any): any {
  const statModel = gameClass.statModel || {};
  const coreStats = parseJson(statModel.coreStats, {});
  const stats = computeStats({
    level: 1,
    statModel: {
      coreStats,
    },
    resource: parseJson(gameClass.resource, {}),
    passives: [],
  });
  return {
    hp: stats.hp,
    mana: stats.mana,
    attack: stats.attack,
    defense: stats.defense,
    magic: stats.magic,
    magicDefense: stats.magicDefense,
    speed: stats.speed,
    attackPower: stats.attackPower,
    spellPower: stats.spellPower,
    hitChance: stats.hitChance,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    dodge: stats.dodge,
    attackSpeedMs: stats.attackSpeedMs,
    manaRegenPerTick: stats.manaRegenPerTick,
    healthRegenPerTick: stats.healthRegenPerTick,
    coreStats,
    conversion: CLASS_STAT_CONVERSION,
  };
}

function parsePassiveForStats(p: any): PassiveDef {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug || p.id,
    description: p.description || "",
    rankRequired: Number(p.rankRequired) || 1,
    statModifiers: parseJson(p.statModifiers, {}),
    skillModifiers: [],
    effectModifiers: [],
    conditions: [],
    events: [],
    type: p.type || "permanente",
    internalCooldownMs: Number(p.internalCooldownMs) || 0,
  };
}

// Stats reais do personagem (nível + equipamento + encantamentos + passivas do rank),
// mesma lógica do combate — é o que mantém os mostradores atualizados.
async function characterCombatStats(character: any): Promise<any> {
  const rank = character.classProgress?.[0]?.rank ?? 1;
  const equipment = await prisma.equipment.findUnique({
    where: { characterId: character.id },
    include: {
      weapon: { include: { enchantment: true } },
      classItem: { include: { enchantment: true } },
      helm: { include: { enchantment: true } },
      armor: { include: { enchantment: true } },
      cape: { include: { enchantment: true } },
      ring: { include: { enchantment: true } },
      necklace: { include: { enchantment: true } },
    },
  });

  const coreStats = sumCoreStats([
    ...["weapon", "classItem", "helm", "armor", "cape", "ring", "necklace"].map((slot) => {
      const item = (equipment as any)?.[slot];
      if (!item) return null;
      // Encantamento SUBSTITUI os valores do item (ex.: todos 2, forte 4);
      // elmo/armadura/capa sem atributos (item antigo) recebem o MÍNIMO por nível.
      const src = item.enchantment
        ? computeEnchantmentStats(item.enchantment)
        : ["helm", "armor", "cape"].includes(String(item.type)) && !hasAnyItemStat(item)
          ? minEquipmentStats(character.level)
          : item;
      return {
        strength: src.strength ?? 0,
        intellect: src.intellect ?? 0,
        endurance: src.endurance ?? 0,
        dexterity: src.dexterity ?? 0,
        wisdom: src.wisdom ?? 0,
        luck: src.luck ?? 0,
      };
    }),
  ]);

  // Total de Status Class exibido = base da classe + itens/encantamentos equipados
  const classBase = parseJson(character.class?.statModel?.coreStats, {});
  const baseCore = sumCoreStats([{
    strength: Number(classBase.strength) || 0,
    intellect: Number(classBase.intellect) || 0,
    endurance: Number(classBase.endurance) || 0,
    dexterity: Number(classBase.dexterity) || 0,
    wisdom: Number(classBase.wisdom) || 0,
    luck: Number(classBase.luck) || 0,
  }]);
  const totalCore = sumCoreStats([baseCore, coreStats]);

  const passives = (character.class?.passives || [])
    .filter((p: any) => (p.rankRequired ?? 1) <= rank)
    .map(parsePassiveForStats);

  const boosterBonuses = await getTotalBoosterBonuses(character.userId, character.id);

  const weapon = equipment?.weapon ?? null;

  const stats = computeStats({
    level: character.level,
    statModel: {
      coreStats: parseJson(character.class?.statModel?.coreStats, {}),
      bonuses: { damageBoost: boosterBonuses.damage, defenseBoost: boosterBonuses.defense },
    },
    resource: parseJson(character.class?.resource, {}),
    passives,
    coreStats,
    attackSpeedMs: effectiveWeaponSpeed(weapon),
    weaponDps: effectiveWeaponDps(weapon, character.level),
  });

  return {
    coreStats: totalCore,
    hp: stats.hp,
    mana: stats.mana,
    maxHp: stats.maxHp,
    maxMana: stats.maxMana,
    attack: stats.attack,
    defense: stats.defense,
    magic: stats.magic,
    magicDefense: stats.magicDefense,
    speed: stats.speed,
    attackPower: stats.attackPower,
    spellPower: stats.spellPower,
    hitChance: stats.hitChance,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    dodge: stats.dodge,
    attackSpeedMs: stats.attackSpeedMs,
    manaRegenPerTick: stats.manaRegenPerTick,
    healthRegenPerTick: stats.healthRegenPerTick,
  };
}

const CLASS_INCLUDE = {
  skills: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  passives: { orderBy: { rankRequired: "asc" as const } },
  statModel: true,
};

export function createClassesModule(app: Express): void {
  app.get("/api/classes", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const classes = await prisma.gameClass.findMany({
        where: { isActive: true },
        include: CLASS_INCLUDE,
        orderBy: { name: "asc" },
      });
      res.json(classes.map((c: any) => ({ ...c, stats: displayStats(c) })));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/classes/:slug", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameClass = await prisma.gameClass.findUnique({
        where: { slug: req.params.slug },
        include: CLASS_INCLUDE,
      });
      if (!gameClass) {
        res.status(404).json({ error: "Class not found" });
        return;
      }
      res.json({ ...gameClass, stats: displayStats(gameClass) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/classes/:slug/skills", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameClass = await prisma.gameClass.findUnique({
        where: { slug: req.params.slug },
      });
      if (!gameClass) {
        res.status(404).json({ error: "Class not found" });
        return;
      }
      const skills = await prisma.skill.findMany({
        where: { classId: gameClass.id, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      res.json(skills);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/classes/:slug/passives", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameClass = await prisma.gameClass.findUnique({
        where: { slug: req.params.slug },
      });
      if (!gameClass) {
        res.status(404).json({ error: "Class not found" });
        return;
      }
      const passives = await prisma.passive.findMany({
        where: { classId: gameClass.id },
        orderBy: { rankRequired: "asc" },
      });
      res.json(passives);
    } catch (err) {
      next(err);
    }
  });

  // Character's current class data (equipped class + progress)
  app.get("/api/characters/:characterId/class", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findUnique({
        where: { id: req.params.characterId },
        include: {
          class: {
            include: {
              skills: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
              passives: { orderBy: { rankRequired: "asc" } },
              statModel: true,
            },
          },
          classProgress: {
            include: { gameClass: true },
            orderBy: { updatedAt: "desc" },
          },
          activeEffects: { include: { effect: true } },
        },
      });
      if (!character) {
        res.status(404).json({ error: "Character not found" });
        return;
      }
      if (character.userId !== req.user!.userId) {
        res.status(403).json({ error: "Not your character" });
        return;
      }
      res.json({
        ...character,
        class: character.class ? { ...character.class, stats: displayStats(character.class) } : null,
        stats: await characterCombatStats(character),
        rankXpToNext: classXpToNextRank(character.classProgress?.[0]?.rank ?? 1),
      });
    } catch (err) {
      next(err);
    }
  });

  // Get all classes the character has unlocked with progress
  app.get("/api/characters/:characterId/classes", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findUnique({
        where: { id: req.params.characterId },
        select: { userId: true },
      });
      if (!character) {
        res.status(404).json({ error: "Character not found" });
        return;
      }
      if (character.userId !== req.user!.userId) {
        res.status(403).json({ error: "Not your character" });
        return;
      }

      const classProgress = await prisma.characterClass.findMany({
        where: { characterId: req.params.characterId },
        include: {
          gameClass: {
            include: {
              skills: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
              passives: { orderBy: { rankRequired: "asc" } },
              statModel: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      res.json(
        classProgress.map((cp: any) => ({
          ...cp,
          gameClass: { ...cp.gameClass, stats: displayStats(cp.gameClass) },
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  // Equip / switch class for a character
  app.post("/api/characters/:characterId/class", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.body;
      const character = await prisma.character.findUnique({
        where: { id: req.params.characterId },
      });
      if (!character) {
        res.status(404).json({ error: "Character not found" });
        return;
      }
      if (character.userId !== req.user!.userId) {
        res.status(403).json({ error: "Not your character" });
        return;
      }

      const gameClass = await prisma.gameClass.findUnique({
        where: { id: classId },
      });
      if (!gameClass || !gameClass.isActive) {
        res.status(404).json({ error: "Class not found" });
        return;
      }

      // Classe exclusiva VIP: só quem já comprou VIP (mesmo após expirar) pode usar
      if (gameClass.requiredVip) {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { vipOwned: true },
        });
        if (!user?.vipOwned) {
          res.status(403).json({ error: "Classe exclusiva para VIP" });
          return;
        }
      }

      // Nível mínimo do personagem
      if (character.level < gameClass.requiredLevel) {
        res.status(400).json({ error: `Requer nível ${gameClass.requiredLevel} para equipar esta classe.` });
        return;
      }

      // Preço em ouro (cobra apenas na primeira vez que equipa a classe)
      const ownedProgress = await prisma.characterClass.findUnique({
        where: { characterId_classId: { characterId: character.id, classId } },
      });
      const isFreeSwitch = !!ownedProgress || character.classId === classId;
      if (!isFreeSwitch && gameClass.price > 0) {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { id: true, gold: true },
        });
        if (!user || Number(user.gold) < gameClass.price) {
          res.status(400).json({ error: `Ouro insuficiente para equipar esta classe (${gameClass.price} gold).` });
          return;
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { gold: { decrement: gameClass.price } },
        });
      }

      // Upsert CharacterClass progress entry
      await prisma.characterClass.upsert({
        where: {
          characterId_classId: { characterId: character.id, classId },
        },
        update: { isActive: true },
        create: { characterId: character.id, classId, isActive: true },
      });

      // Set all other class progress to inactive
      await prisma.characterClass.updateMany({
        where: { characterId: character.id, classId: { not: classId }, isActive: true },
        data: { isActive: false },
      });

      // Update character's current class
      const updated = await prisma.character.update({
        where: { id: character.id },
        data: { classId },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // Grant XP to a character's active class
  app.post("/api/characters/:characterId/class/xp", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { xpAmount } = req.body;
      const character = await prisma.character.findUnique({
        where: { id: req.params.characterId },
      });
      if (!character) {
        res.status(404).json({ error: "Character not found" });
        return;
      }
      if (character.userId !== req.user!.userId) {
        res.status(403).json({ error: "Not your character" });
        return;
      }

      const gameClass = await prisma.gameClass.findUnique({
        where: { id: character.classId },
        select: { rankMax: true },
      });
      const maxRank = gameClass?.rankMax ?? 10;

      const progress = await prisma.characterClass.findUnique({
        where: { characterId_classId: { characterId: character.id, classId: character.classId } },
      });
      if (!progress) {
        res.status(404).json({ error: "No class progress found" });
        return;
      }

      const result = await applyClassXp(prisma, progress.id, Number(xpAmount) || 0, maxRank);

      res.json({ rank: result.rank, experience: result.experience, didLevelUp: result.rankUps > 0 });
    } catch (err) {
      next(err);
    }
  });
}
