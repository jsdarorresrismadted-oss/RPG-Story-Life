import { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../../core/database";
import { config } from "../../core/config";
import { authenticate, requireRole, AuthPayload } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { DEFAULT_GAME_LIMITS, invalidateGameLimits } from "../../core/gameLimits";
import { aiProvidersAvailable, generateClass, persistGeneratedClass } from "../../core/ai/classGenerator";
import { generateItemSprite, defaultIconForItem } from "../../core/ai/itemGenerator";
import { generateMonster, persistGeneratedMonster } from "../../core/ai/monsterGenerator";
import { generateSkillIcons } from "../../core/ai/skillIconGenerator";
import { generateMap, persistGeneratedMap } from "../../core/ai/mapGenerator";
import { generateEvent, persistGeneratedEvent } from "../../core/ai/eventGenerator";
import {
  withEnchantmentStats,
  enchantmentProgression,
  clampLevel,
  ENCHANTMENT_CATEGORIES,
} from "../../core/enchantments/enchantmentStats";
import { ensureGuildQuests } from "../../core/guildQuests";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    requireRole("admin", "owner")(req, res, next);
  });
}

// Limitador específico para geração via IA: os prompts chamam APIs pagas
// (Groq/Gemini/Pollinations), então restringimos mais que o rate limit global.
const aiLimiter = rateLimit({
  windowMs: config.aiRateLimit.windowMs,
  max: config.aiRateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Limite de geracoes de IA atingido. Aguarde um pouco e tente de novo.",
});

// Cooldown mínimo entre disparos de prompt (mesmo de IPs/admin diferentes)
// para nao estourar a cota diaria de tokens da Gemini.
const lastAiCall = new Map<string, number>();
function aiCooldown(req: Request, _res: Response, next: NextFunction): void {
  const now = Date.now();
  const last = lastAiCall.get("global") || 0;
  const waitMs = config.aiRateLimit.minIntervalMs - (now - last);
  if (waitMs > 0) {
    return next(new AppError(429, "Geracao de IA em cooldown — aguarde " + Math.ceil(waitMs / 1000) + "s."));
  }
  lastAiCall.set("global", now);
  next();
}
const aiGuard = [requireAdmin, aiLimiter, aiCooldown];

// Tenta apagar de verdade; se o registro estiver referenciado por outros dados
// (inventário, lojas, drops, craft, etc.), aplica soft-delete (isActive=false)
// para não quebrar o banco nem destruir dados de jogadores.
// Registra o delete no AdminLog com o "tipo" (motivo/severidade) enviado pela UI.
async function deleteWithSoftFallback(model: any, req: Request, entity: string): Promise<string> {
  const id = req.params.id;
  const tipo = Number(req.query.tipo) || 0;
  let result: string;
  try {
    await model.delete({ where: { id } });
    result = "deleted";
  } catch {
    try {
      await model.update({ where: { id }, data: { isActive: false } });
      result = "disabled";
    } catch {
      throw new AppError(400, "Registro referenciado por outros dados e não pôde ser excluído");
    }
  }
  prisma.adminLog
    .create({
      data: {
        adminId: (req as any).user?.userId ?? "system",
        action: result === "deleted" ? "delete" : "soft_delete",
        entity,
        targetId: id,
        tipo,
      },
    })
    .catch(() => {});
  return result;
}

// Registra no AdminLog o delete explícito (users, etc.) com tipo
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

// Modelos suportados pelo delete em massa do CrudPage (key da config → prisma + entity)
const BULK_MODELS: Record<string, { model: any; entity: string }> = {
  classes: { model: prisma.gameClass, entity: "class" },
  items: { model: prisma.item, entity: "item" },
  monsters: { model: prisma.monster, entity: "monster" },
  maps: { model: prisma.map, entity: "map" },
  quests: { model: prisma.quest, entity: "quest" },
  statModels: { model: prisma.statModel, entity: "statmodel" },
  npcs: { model: prisma.npc, entity: "npc" },
  shopProducts: { model: prisma.shopProduct, entity: "shop-product" },
  patchNotes: { model: prisma.patchNote, entity: "patch-note" },
  craftRecipes: { model: prisma.craftRecipe, entity: "craft-recipe" },
  boosters: { model: prisma.booster, entity: "booster" },
};

const DEFAULT_GUILD_SETTINGS = {
  requiredLevel: 2,
  requiredGold: 200,
  requiredSfCoins: 0,
};

// Regras do sistema de encantamentos:
// - nível sempre entre 1 e 150 (fórmula do sistema calcula os valores);
// - os 6 atributos NUNCA podem ficar zerados (mínimo 1);
// - categoria = atributo principal (6 fixas).
function sanitizeEnchantment(body: any): any {
  const data = { ...body };
  if (data.level !== undefined) data.level = clampLevel(Number(data.level) || 1);
  if (data.category !== undefined && !ENCHANTMENT_CATEGORIES.includes(data.category)) {
    data.category = "strength";
  }
  const STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];
  for (const key of STAT_KEYS) {
    const v = Math.max(1, Math.round(Number(data[key]) || 1));
    data[key] = v;
  }
  if (data.compatibleSlots !== undefined && Array.isArray(data.compatibleSlots)) {
    data.compatibleSlots = JSON.stringify(data.compatibleSlots);
  }
  return data;
}

export function createAdminModule(app: Express): void {
  // Delete em massa (uma requisição só, evita rate-limit com centenas de requests)
  app.post("/api/admin/bulk-delete", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key, ids, tipo } = req.body;
      const entry = BULK_MODELS[key];
      if (!entry) throw new AppError(400, "Entidade inválida para delete em massa");
      if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, "Nenhum registro selecionado");
      const model = entry.model;
      const adminId = (req as any).user?.userId ?? "system";
      const t = Number(tipo) || 0;
      let deleted = 0;
      let disabled = 0;
      let failed = 0;
      const CHUNK = 50;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(async (id: string) => {
            let action: string;
            try {
              await model.delete({ where: { id } });
              action = "delete";
              deleted++;
            } catch {
              try {
                await model.update({ where: { id }, data: { isActive: false } });
                action = "soft_delete";
                disabled++;
              } catch {
                failed++;
                return;
              }
            }
            await prisma.adminLog
              .create({ data: { adminId, action, entity: entry.entity, targetId: id, tipo: t } })
              .catch(() => {});
          })
        );
      }
      res.json({ deleted, disabled, failed, total: ids.length });
    } catch (err) { next(err); }
  });

  // Admin auth
  app.post("/api/admin/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) throw new AppError(400, "Username and password required");

      const user = await prisma.user.findUnique({ where: { username } });
      if (!user || !user.passwordHash) throw new AppError(401, "Invalid credentials");
      if (user.role !== "admin" && user.role !== "owner") {
        throw new AppError(403, "Account does not have admin access");
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new AppError(401, "Invalid credentials");

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role } as AuthPayload,
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
      );

      res.json({
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/admin/auth/me", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, username: true, displayName: true, role: true },
      });
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  });

  // Guild creation requirements (adjustable in the admin panel)
  app.get("/api/admin/settings/guild", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await prisma.systemConfig.findUnique({ where: { key: "guild" } });
      res.json({ ...DEFAULT_GUILD_SETTINGS, ...(config?.value as object | undefined) });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/admin/settings/guild", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requiredLevel, requiredGold, requiredSfCoins } = req.body;
      const value = {
        requiredLevel:
          typeof requiredLevel === "number" && requiredLevel >= 0 ? Math.floor(requiredLevel) : DEFAULT_GUILD_SETTINGS.requiredLevel,
        requiredGold:
          typeof requiredGold === "number" && requiredGold >= 0 ? Math.floor(requiredGold) : DEFAULT_GUILD_SETTINGS.requiredGold,
        requiredSfCoins:
          typeof requiredSfCoins === "number" && requiredSfCoins >= 0 ? Math.floor(requiredSfCoins) : DEFAULT_GUILD_SETTINGS.requiredSfCoins,
      };
      const config = await prisma.systemConfig.upsert({
        where: { key: "guild" },
        update: { value },
        create: { key: "guild", value },
      });
      res.json(config.value);
    } catch (err) {
      next(err);
    }
  });

  // ===== Guildas: shop (staff) e quests =====

  app.get("/api/admin/guilds", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await prisma.guild.findMany({
          select: { id: true, name: true, tag: true, level: true, memberCount: true },
          orderBy: { name: "asc" },
        })
      );
    } catch (err) {
      next(err);
    }
  });

  // Shop da guilda (itens colocados pelo staff, comprados com GC pelos jogadores)
  app.get("/api/admin/guilds/:id/shop", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await prisma.guildShopItem.findMany({
          where: { guildId: req.params.id, isActive: true },
          orderBy: { sortOrder: "asc" },
          include: { item: true },
        })
      );
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/admin/guilds/:id/shop", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { itemId, price } = req.body;
      if (!itemId) throw new AppError(400, "itemId é obrigatório");
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) throw new AppError(404, "Item não encontrado");

      const existing = await prisma.guildShopItem.findFirst({
        where: { guildId: req.params.id, itemId, isActive: true },
      });
      if (existing) throw new AppError(409, "Este item já está no shop da guilda");

      const entry = await prisma.guildShopItem.create({
        data: { guildId: req.params.id, itemId, price: BigInt(Math.max(1, Math.floor(Number(price) || 100))) },
      });
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/admin/guilds/:id/shop/:shopItemId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.guildShopItem.updateMany({
        where: { id: req.params.shopItemId, guildId: req.params.id },
        data: { isActive: false },
      });
      res.json({ message: "Item removido do shop da guilda" });
    } catch (err) {
      next(err);
    }
  });

  // Quests de guilda (geradas pelo sistema)
  app.get("/api/admin/guilds/:id/quests", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guild = await prisma.guild.findUnique({ where: { id: req.params.id } });
      if (!guild) throw new AppError(404, "Guilda não encontrada");
      await ensureGuildQuests(guild.id, guild.level);
      const quests = await prisma.guildQuest.findMany({
        where: { guildId: guild.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      res.json(
        quests.map((q) => {
          const progress = (q.progress as Record<string, any>) ?? {};
          const entries = Object.values(progress);
          const completedCount = entries.filter((e) => (e?.count ?? 0) >= q.targetCount).length;
          const claimedCount = entries.filter((e) => e?.claimed).length;
          return {
            id: q.id,
            title: q.title,
            description: q.description,
            type: q.type,
            targetName: q.targetName,
            targetCount: q.targetCount,
            xpReward: q.xpReward.toString(),
            goldReward: q.goldReward.toString(),
            gcReward: q.gcReward.toString(),
            expiresAt: q.expiresAt,
            completedCount,
            claimedCount,
          };
        })
      );
    } catch (err) {
      next(err);
    }
  });

  // Regenera o lote de quests da guilda (expira as atuais e gera novas)
  app.post("/api/admin/guilds/:id/quests/regenerate", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guild = await prisma.guild.findUnique({ where: { id: req.params.id } });
      if (!guild) throw new AppError(404, "Guilda não encontrada");
      await prisma.guildQuest.updateMany({
        where: { guildId: guild.id },
        data: { isActive: false },
      });
      await ensureGuildQuests(guild.id, guild.level);
      const count = await prisma.guildQuest.count({ where: { guildId: guild.id, isActive: true } });
      res.json({ message: `Novo lote gerado (${count} quests ativas)`, count });
    } catch (err) {
      next(err);
    }
  });

  // Game economy limits (level, gold, SF Coins, XP curve)
  app.get("/api/admin/settings/limits", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: "limits" } });
      res.json({ ...DEFAULT_GAME_LIMITS, ...(row?.value as object | undefined) });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/admin/settings/limits", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { maxLevel, maxGold, maxSfCoins, xpPerLevel } = req.body;
      const value = {
        maxLevel:
          typeof maxLevel === "number" && maxLevel > 0 ? Math.floor(maxLevel) : DEFAULT_GAME_LIMITS.maxLevel,
        maxGold:
          typeof maxGold === "number" && maxGold >= 0 ? Math.floor(maxGold) : DEFAULT_GAME_LIMITS.maxGold,
        maxSfCoins:
          typeof maxSfCoins === "number" && maxSfCoins >= 0 ? Math.floor(maxSfCoins) : DEFAULT_GAME_LIMITS.maxSfCoins,
        xpPerLevel:
          typeof xpPerLevel === "number" && xpPerLevel > 0 ? Math.floor(xpPerLevel) : DEFAULT_GAME_LIMITS.xpPerLevel,
      };
      await prisma.systemConfig.upsert({
        where: { key: "limits" },
        update: { value },
        create: { key: "limits", value },
      });
      invalidateGameLimits();
      res.json(value);
    } catch (err) {
      next(err);
    }
  });

  // Stats
  app.get("/api/admin/stats", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [totalUsers, totalCharacters, totalGuilds, totalClasses, totalItems, totalMonsters, totalMaps, totalQuests, totalSkills, totalEffects, totalStatModels, activePlayers] = await Promise.all([
        prisma.user.count(),
        prisma.character.count(),
        prisma.guild.count(),
        prisma.gameClass.count(),
        prisma.item.count(),
        prisma.monster.count(),
        prisma.map.count(),
        prisma.quest.count(),
        prisma.skill.count(),
        prisma.effect.count(),
        prisma.statModel.count(),
        prisma.user.count({ where: { isOnline: true } }),
      ]);
      res.json({ totalUsers, totalCharacters, totalGuilds, totalClasses, totalItems, totalMonsters, totalMaps, totalQuests, totalSkills, totalEffects, totalStatModels, activePlayers });
    } catch (err) { next(err); }
  });

  // Users
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true, username: true, displayName: true, email: true, role: true,
          level: true, gold: true, sfCoins: true, pvpCoins: true, gc: true, isOnline: true, isBanned: true,
          createdAt: true, _count: { select: { characters: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(users);
    } catch (err) { next(err); }
  });

  app.put("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { displayName, email, role, level, experience, gold, sfCoins, pvpCoins, gc, isBanned, isOnline } = req.body;
      const data: Record<string, any> = {};
      if (typeof displayName === "string") data.displayName = displayName.slice(0, 50);
      if (typeof email === "string" || email === null) data.email = email;
      if (typeof role === "string" && ["player", "admin", "owner"].includes(role)) data.role = role;
      if (typeof level === "number" && level >= 1) data.level = Math.floor(level);
      if (typeof experience === "number" && experience >= 0) data.experience = BigInt(Math.floor(experience));
      if (typeof gold === "number" && gold >= 0) data.gold = BigInt(Math.floor(gold));
      if (typeof sfCoins === "number" && sfCoins >= 0) data.sfCoins = Math.floor(sfCoins);
      if (typeof pvpCoins === "number" && pvpCoins >= 0) data.pvpCoins = Math.floor(pvpCoins);
      if (typeof gc === "number" && gc >= 0) data.gc = Math.floor(gc);
      if (typeof isBanned === "boolean") data.isBanned = isBanned;
      if (typeof isOnline === "boolean") data.isOnline = isOnline;
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, username: true, displayName: true, role: true, level: true, gold: true, sfCoins: true, pvpCoins: true, gc: true },
      });
      res.json(user);
    } catch (err) { next(err); }
  });

  // User detail: account + characters + inventory
  app.get("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          characters: {
            include: {
              class: { select: { id: true, name: true, slug: true, role: true } },
              classProgress: {
                include: { gameClass: { select: { id: true, name: true, slug: true } } },
                orderBy: { isActive: "desc" },
              },
            },
          },
          inventory: {
            include: { item: true },
            orderBy: { acquiredAt: "desc" },
          },
        },
      });
      if (!user) throw new AppError(404, "User not found");
      res.json(user);
    } catch (err) { next(err); }
  });

  // Delete user (apaga dados relacionados na ordem correta)
  app.delete("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!target) throw new AppError(404, "User not found");
      if (target.role === "admin" || target.role === "owner") {
        throw new AppError(400, "Contas admin/owner não podem ser excluídas");
      }
      if ((req as any).user?.userId === id) {
        throw new AppError(400, "Você não pode excluir a própria conta");
      }
      const charRows = await prisma.character.findMany({ where: { userId: id }, select: { id: true } });
      const charIds = charRows.map((c) => c.id);
      await prisma.$transaction([
        prisma.pvpMatch.deleteMany({ where: { OR: [{ challengerCharacter: { userId: id } }, { opponentCharacter: { userId: id } }] } }),
        prisma.combatSession.deleteMany({ where: { character: { userId: id } } }),
        prisma.raidRun.deleteMany({ where: { character: { userId: id } } }),
        prisma.combatLog.deleteMany({ where: { characterId: { in: charIds } } }),
        prisma.activeEffect.deleteMany({ where: { character: { userId: id } } }),
        prisma.activeCooldown.deleteMany({ where: { character: { userId: id } } }),
        prisma.equipment.deleteMany({ where: { character: { userId: id } } }),
        prisma.characterClass.deleteMany({ where: { character: { userId: id } } }),
        prisma.character.deleteMany({ where: { userId: id } }),
        prisma.mailItem.deleteMany({ where: { mail: { senderId: id } } }),
        prisma.mailItem.deleteMany({ where: { mail: { receiverId: id } } }),
        prisma.mail.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } }),
        prisma.inventory.deleteMany({ where: { userId: id } }),
        prisma.questProgress.deleteMany({ where: { userId: id } }),
        prisma.marketListing.deleteMany({ where: { sellerId: id } }),
        prisma.guildMember.deleteMany({ where: { userId: id } }),
        prisma.userTitle.deleteMany({ where: { userId: id } }),
        prisma.userAchievement.deleteMany({ where: { userId: id } }),
        prisma.friendship.deleteMany({ where: { OR: [{ userId: id }, { friendId: id }] } }),
        prisma.redeemRedemption.deleteMany({ where: { userId: id } }),
        prisma.shopOrder.deleteMany({ where: { userId: id } }),
        prisma.userEnchantment.deleteMany({ where: { userId: id } }),
        prisma.userBooster.deleteMany({ where: { userId: id } }),
        prisma.partyMember.deleteMany({ where: { userId: id } }),
        prisma.party.deleteMany({ where: { leaderId: id } }),
        prisma.gameLog.deleteMany({ where: { userId: id } }),
        prisma.chatLog.deleteMany({ where: { userId: id } }),
        prisma.analyticsEvent.deleteMany({ where: { userId: id } }),
        prisma.seasonPass.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);
      logDelete(req, "user", id);
      res.json({ message: "User deleted" });
    } catch (err) { next(err); }
  });

  // Edit a user's character: level, xp, class, name
  app.put("/api/admin/users/:userId/characters/:charId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, level, experience, classId, pvpKills } = req.body;
      const character = await prisma.character.findFirst({
        where: { id: req.params.charId, userId: req.params.userId },
      });
      if (!character) throw new AppError(404, "Character not found");

      const data: Record<string, any> = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim().slice(0, 50);
      if (typeof level === "number" && level >= 1) data.level = Math.floor(level);
      if (typeof experience === "number" && experience >= 0) data.experience = BigInt(Math.floor(experience));
      if (typeof pvpKills === "number" && pvpKills >= 0) data.pvpKills = Math.floor(pvpKills);
      if (typeof classId === "string") {
        const gameClass = await prisma.gameClass.findFirst({ where: { id: classId, isActive: true } });
        if (!gameClass) throw new AppError(404, "Class not found");
        data.classId = gameClass.id;
      }

      await prisma.$transaction(async (tx) => {
        if (data.classId && data.classId !== character.classId) {
          await tx.characterClass.upsert({
            where: { characterId_classId: { characterId: character.id, classId: data.classId } },
            update: { isActive: true },
            create: { characterId: character.id, classId: data.classId, isActive: true },
          });
          await tx.characterClass.updateMany({
            where: { characterId: character.id, classId: { not: data.classId } },
            data: { isActive: false },
          });
        }
        await tx.character.update({ where: { id: character.id }, data });
      });

      res.json({ message: "Character updated" });
    } catch (err) { next(err); }
  });

  // Set all of a character's classes to max rank
  app.post("/api/admin/users/:userId/characters/:charId/rank-max", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await prisma.character.findFirst({
        where: { id: req.params.charId, userId: req.params.userId },
      });
      if (!character) throw new AppError(404, "Character not found");

      const maxRank = 10;
      await prisma.characterClass.updateMany({
        where: { characterId: character.id },
        data: { rank: maxRank },
      });
      res.json({ message: `All classes set to rank ${maxRank}` });
    } catch (err) { next(err); }
  });

  // User inventory
  app.get("/api/admin/users/:id/inventory", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inventory = await prisma.inventory.findMany({
        where: { userId: req.params.id },
        include: { item: true },
        orderBy: { acquiredAt: "desc" },
      });
      res.json(inventory);
    } catch (err) { next(err); }
  });

  app.post("/api/admin/users/:id/inventory", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { itemId, itemName, quantity } = req.body;
      const qty = Math.max(1, Math.floor(Number(quantity) || 1));
      let item = null;
      if (itemId) item = await prisma.item.findUnique({ where: { id: itemId } });
      else if (itemName) item = await prisma.item.findFirst({ where: { name: itemName, isActive: true } });
      if (!item) throw new AppError(404, "Item not found");

      const existing = await prisma.inventory.findFirst({
        where: { userId: req.params.id, itemId: item.id, slotIndex: null },
      });
      let entry;
      if (existing) {
        entry = await prisma.inventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: qty } },
        });
      } else {
        entry = await prisma.inventory.create({
          data: { userId: req.params.id, itemId: item.id, quantity: qty },
        });
      }
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/users/:id/inventory/:invId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.inventory.delete({
        where: { id: req.params.invId },
      });
      res.json({ message: "Inventory entry deleted" });
    } catch (err) { next(err); }
  });

  // Redeem codes CRUD
  app.get("/api/admin/codes", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        await prisma.redeemCode.findMany({
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { redemptions: true } } },
        })
      );
    } catch (err) { next(err); }
  });

  app.post("/api/admin/codes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, description, gold, sfCoins, experience, items, maxUses, expiresAt, isActive } = req.body;
      if (!code || typeof code !== "string" || !code.trim()) throw new AppError(400, "Code required");
      const data: Record<string, any> = {
        code: code.trim().toUpperCase(),
        description: typeof description === "string" ? description : null,
        gold: BigInt(Math.max(0, Math.floor(Number(gold) || 0))),
        sfCoins: Math.max(0, Math.floor(Number(sfCoins) || 0)),
        experience: BigInt(Math.max(0, Math.floor(Number(experience) || 0))),
        maxUses: Math.max(1, Math.floor(Number(maxUses) || 1000)),
      };
      if (Array.isArray(items)) data.items = items;
      if (expiresAt) data.expiresAt = new Date(expiresAt);
      if (typeof isActive === "boolean") data.isActive = isActive;
      res.status(201).json(await prisma.redeemCode.create({ data: data as any }));
    } catch (err) { next(err); }
  });

  app.put("/api/admin/codes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, description, gold, sfCoins, experience, items, maxUses, expiresAt, isActive } = req.body;
      const data: Record<string, any> = {};
      if (typeof code === "string" && code.trim()) data.code = code.trim().toUpperCase();
      if (typeof description === "string" || description === null) data.description = description;
      if (typeof gold === "number" && gold >= 0) data.gold = BigInt(Math.floor(gold));
      if (typeof sfCoins === "number" && sfCoins >= 0) data.sfCoins = Math.floor(sfCoins);
      if (typeof experience === "number" && experience >= 0) data.experience = BigInt(Math.floor(experience));
      if (Array.isArray(items)) data.items = items;
      if (typeof maxUses === "number" && maxUses >= 1) data.maxUses = Math.floor(maxUses);
      if (expiresAt) data.expiresAt = new Date(expiresAt);
      if (typeof isActive === "boolean") data.isActive = isActive;
      res.json(await prisma.redeemCode.update({ where: { id: req.params.id }, data }));
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/codes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await deleteWithSoftFallback(prisma.redeemCode, req, "redeem-code");
      res.json({ message: r === "deleted" ? "Deleted" : "Desativado (já resgatado por jogadores)" });
    } catch (err) { next(err); }
  });

  // Json-native fields per model (Prisma Json type): accept objects directly
  const JSON_FIELDS: Record<string, string[]> = {
    code: ["items"],
    class: ["resource"],
    skill: ["scaling", "actions", "conditions", "onConditionMet", "events"],
    passive: ["statModifiers", "skillModifiers", "effectModifiers", "conditions", "events"],
    effect: ["stackLoss", "tickDamage", "tickHealing", "statModifiers", "onMaxStacks", "onExpire", "onTick"],
    statmodel: ["base", "perLevel", "scaling"],
    gameevent: ["rewards"],
  };

  // Relações opcionais: string vazia/null vira null (evita FK error)
  const NULLABLE_RELATIONS: Record<string, string[]> = {
    class: ["statModelId"],
    item: ["enchantmentId", "eventId"],
    shopitem: ["npcId", "itemId", "classId", "enchantmentId"],
    mapnpc: ["mapId", "npcId"],
    mapmonster: ["mapId", "monsterId"],
    quest: ["giverNpcId", "mapId", "eventId"],
    map: ["eventId"],
    craftrecipe: ["resultClassId", "eventId"],
    eventshopitem: ["eventId", "itemId"],
  };

  // Labels das FKs para mensagem amigável quando der P2003
  const FK_LABELS: Record<string, string> = {
    npcId: "NPC",
    itemId: "Item",
    classId: "Classe",
    enchantmentId: "Encantamento",
    resultItemId: "Item resultado",
    resultClassId: "Classe resultado",
    mapId: "Mapa",
    monsterId: "Monstro",
    statModelId: "Stat Model",
    eventId: "Evento",
  };

  async function saveWithFk(model: string, id: string | null, body: any) {
    const data = normalizeBody(model, body);
    try {
      const client = prisma as any;
      return id
        ? await client[model].update({ where: { id }, data })
        : await client[model].create({ data });
    } catch (err: any) {
      if (err?.code === "P2003") {
        const field = String(err?.meta?.field_name ?? "");
        const label = Object.entries(FK_LABELS).find(([k]) => field.includes(k))?.[1] ?? "Referência";
        throw new AppError(400, `${label} inválido — escolha uma opção existente`);
      }
      throw err;
    }
  }

  function normalizeBody(model: string, body: any): any {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const jsonFields = new Set(JSON_FIELDS[model] || []);
    const nullableIds = new Set(NULLABLE_RELATIONS[model] || []);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (nullableIds.has(k) && (v === "" || v === null || v === undefined)) {
        out[k] = null;
      } else if (jsonFields.has(k)) {
        if (typeof v === "string") {
          try { out[k] = JSON.parse(v); } catch { out[k] = v; }
        } else {
          out[k] = v;
        }
      } else if (v !== null && (typeof v === "object" || Array.isArray(v))) {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  async function saveGameClass(id: string | null, body: any) {
    const data = normalizeBody("class", body);
    try {
      return id
        ? await prisma.gameClass.update({ where: { id }, data })
        : await prisma.gameClass.create({ data });
    } catch (err: any) {
      if (err?.code === "P2003") {
        throw new AppError(400, "Stat Model inválido — escolha um Stat Model existente no campo da classe");
      }
      throw err;
    }
  }

  // Classes CRUD
  app.get("/api/admin/classes", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.gameClass.findMany({ include: { statModel: true }, orderBy: { name: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/classes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveGameClass(null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/classes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveGameClass(req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/classes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.gameClass, req, "class"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // IA: gerar classe automaticamente (rascunho) — Gemini com fallback Groq
  app.get("/api/admin/ai/config", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(aiProvidersAvailable()); } catch (err) { next(err); }
  });

  app.post("/api/admin/classes/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prompt, count } = req.body || {};
      const idea = String(prompt || "").trim();
      if (!idea) throw new AppError(400, "Descreva a classe que a IA deve criar (ex.: 'tanque de gelo com skill que reflete dano')");
      if (!aiProvidersAvailable().gemini && !aiProvidersAvailable().groq) {
        throw new AppError(503, "Gerador de IA desativado: defina GEMINI_API_KEY ou GROQ_API_KEY nas variáveis do Railway");
      }
      const n = Math.min(Math.max(1, Math.round(Number(count) || 1)), 5);
      const providerLog: string[] = [];
      const created: any[] = [];
      for (let i = 0; i < n; i++) {
        const gen = await generateClass(n > 1 ? `${idea} (variação ${i + 1})` : idea, providerLog);
        const saved = await persistGeneratedClass(gen);
        created.push(saved);
      }
      res.status(201).json({ data: created, providers: providerLog });
    } catch (err) {
      next(err);
    }
  });

  // Ativar classe rascunho gerada por IA (confirmar)
  app.post("/api/admin/classes/:id/activate", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.gameClass.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new AppError(404, "Classe não encontrada");
      const updated = await prisma.gameClass.update({
        where: { id: req.params.id },
        data: { isActive: true },
      });
      res.json(updated);
    } catch (err) { next(err); }
  });

  // Ativar todas as classes rascunho (isActive: false)
  app.post("/api/admin/classes/activate-all", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { count } = await prisma.gameClass.updateMany({
        where: { isActive: false },
        data: { isActive: true },
      });
      res.json({ activated: count });
    } catch (err) { next(err); }
  });

  // Stat models CRUD
  app.get("/api/admin/statmodels", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.statModel.findMany({ orderBy: { name: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/statmodels", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.statModel.create({ data: normalizeBody("statmodel", req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/statmodels/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.statModel.update({ where: { id: req.params.id }, data: normalizeBody("statmodel", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/statmodels/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.statModel, req, "statmodel"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // IA: gerar item (plano de atributos) — Groq planeja ou IA local
  app.post("/api/admin/items/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // IA LOCAL: nao precisa de GROQ_API_KEY. Groq fica opcional via GROQ_PLANNER=on.
      const body = req.body || {};
      const log: string[] = [];
      const { plan } = await generateItemSprite(
        {
          type: String(body.type || "weapon"),
          theme: body.theme ? String(body.theme) : undefined,
          material: body.material ? String(body.material) : undefined,
          color: body.color ? String(body.color) : undefined,
          rarity: body.rarity ? String(body.rarity) : undefined,
          level: body.level !== undefined ? Number(body.level) : undefined,
          seed: body.seed !== undefined ? Number(body.seed) : undefined,
          variants: body.variants !== undefined ? Number(body.variants) : undefined,
        },
        log
      );
      res.status(201).json({ plan, providers: log });
    } catch (err) {
      next(err);
    }
  });

  // Items CRUD
  app.get("/api/admin/items", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.item.findMany({ include: { enchantment: true }, orderBy: { name: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/items", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = normalizeBody("item", req.body);
      if (!body.icon) {
        const dflt = defaultIconForItem(body.type, body.subtype);
        if (dflt) body.icon = dflt;
      }
      res.status(201).json(await prisma.item.create({ data: body })); 
    } catch (err) { next(err); }
  });

  app.put("/api/admin/items/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = normalizeBody("item", req.body);
      if (!body.icon) {
        const dflt = defaultIconForItem(body.type, body.subtype);
        if (dflt) body.icon = dflt;
      }
      res.json(await prisma.item.update({ where: { id: req.params.id }, data: body })); 
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/items/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.item, req, "item"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Enchantments CRUD
  app.get("/api/admin/enchantments", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const enchantments = await prisma.enchantment.findMany({ orderBy: { name: "asc" } });
      res.json(enchantments.map(withEnchantmentStats));
    } catch (err) { next(err); }
  });

  // Progressão completa (níveis 1-150) de um encantamento, calculada pela fórmula do sistema
  app.get("/api/admin/enchantments/:id/progression", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enchantment = await prisma.enchantment.findUnique({ where: { id: req.params.id } });
      if (!enchantment) throw new AppError(404, "Encantamento não encontrado");
      res.json(enchantmentProgression(enchantment));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/enchantments", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.enchantment.create({ data: sanitizeEnchantment(req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/enchantments/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.enchantment.update({ where: { id: req.params.id }, data: sanitizeEnchantment(req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/enchantments/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.enchantment, req, "enchantment"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Monsters CRUD
  // Campos válidos do Monster (whitelist) — evita 500 por campo desconhecido
  const MONSTER_ALLOWED = new Set([
    "name", "description", "imageUrl", "level", "isBoss", "isElite", "faction", "element",
    "hp", "mana", "attack", "defense", "magic", "magicDefense", "speed",
    "criticalChance", "criticalDamage", "dodge", "accuracy",
    "xpReward", "classXpReward", "goldReward", "dropTable",
    "attackSpeed", "skills", "behavior", "isActive",
  ]);
  const filterMonster = (body: any) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) if (MONSTER_ALLOWED.has(k)) out[k] = v;
    return out;
  };

  app.get("/api/admin/monsters", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.monster.findMany({ orderBy: { name: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/monsters", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.monster.create({ data: normalizeBody("monster", filterMonster(req.body)) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/monsters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.monster.update({ where: { id: req.params.id }, data: normalizeBody("monster", filterMonster(req.body)) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/monsters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$transaction([
        prisma.dropItem.deleteMany({ where: { monsterId: req.params.id } }),
        prisma.mapMonster.deleteMany({ where: { monsterId: req.params.id } }),
        prisma.monster.delete({ where: { id: req.params.id } }),
      ]);
      res.json({ message: "Deleted" });
    } catch {
      try {
        await prisma.monster.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ message: "Desativado (estava referenciado)" });
      } catch (err) {
        next(new AppError(400, "Registro referenciado por outros dados e não pôde ser excluído"));
      }
    }
  });

  // ===== Drops de monstro (itens + taxa de drop) =====
  const clampDrop = (v: any, min: number, max: number, def: number) => {
    const n = Number(v);
    if (Number.isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  const dropInclude = {
    item: { select: { id: true, name: true, icon: true, rarity: true } },
  } as const;

  app.get("/api/admin/monsters/:id/drops", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.dropItem.findMany({
        where: { monsterId: req.params.id },
        include: dropInclude,
        orderBy: { createdAt: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/monsters/:id/drops", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { itemId, dropChance, minQuantity, maxQuantity, minLevel, maxLevel, isGuaranteed } = req.body;
      if (!itemId) return res.status(400).json({ error: "Item é obrigatório." });
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return res.status(404).json({ error: "Item não encontrado." });
      const minQ = Math.max(1, Number(minQuantity) || 1);
      const maxQ = Math.max(minQ, Number(maxQuantity) || 1);
      const drop = await prisma.dropItem.create({
        data: {
          monsterId: req.params.id,
          itemId,
          dropChance: clampDrop(dropChance, 0, 100, 1),
          minQuantity: minQ,
          maxQuantity: maxQ,
          minLevel: clampDrop(minLevel, 1, 99, 1),
          maxLevel: clampDrop(maxLevel, 1, 99, 99),
          isGuaranteed: !!isGuaranteed,
        },
        include: dropInclude,
      });
      res.status(201).json(drop);
    } catch (err) { next(err); }
  });

  app.put("/api/admin/monsters/drops/:dropId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: any = {};
      if (req.body.itemId) data.itemId = req.body.itemId;
      if (req.body.dropChance !== undefined) data.dropChance = clampDrop(req.body.dropChance, 0, 100, 1);
      if (req.body.minQuantity !== undefined) data.minQuantity = Math.max(1, Number(req.body.minQuantity) || 1);
      if (req.body.maxQuantity !== undefined) data.maxQuantity = Math.max(1, Number(req.body.maxQuantity) || 1);
      if (req.body.minLevel !== undefined) data.minLevel = clampDrop(req.body.minLevel, 1, 99, 1);
      if (req.body.maxLevel !== undefined) data.maxLevel = clampDrop(req.body.maxLevel, 1, 99, 99);
      if (req.body.isGuaranteed !== undefined) data.isGuaranteed = !!req.body.isGuaranteed;
      const drop = await prisma.dropItem.update({
        where: { id: req.params.dropId },
        data,
        include: dropInclude,
      });
      res.json(drop);
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/monsters/drops/:dropId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.dropItem.delete({ where: { id: req.params.dropId } });
      res.json({ message: "Deleted" });
    } catch (err) { next(err); }
  });

  // ===== IA: gerar monstro / raid / config de PvP =====
  const requireAi = () => {
    if (!aiProvidersAvailable().gemini && !aiProvidersAvailable().groq) {
      throw new AppError(503, "Gerador de IA desativado: defina GEMINI_API_KEY ou GROQ_API_KEY nas variáveis do Railway");
    }
  };

  app.post("/api/admin/monsters/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idea = String((req.body || {}).prompt || "").trim();
      if (!idea) throw new AppError(400, "Descreva o monstro que a IA deve criar (ex.: 'lobo ancião de gelo da floresta nível 12')");
      requireAi();
      const providerLog: string[] = [];
      const gen = await generateMonster(idea, providerLog);
      const saved = await persistGeneratedMonster(gen);
      res.status(201).json({ data: saved, providers: providerLog });
    } catch (err) { next(err); }
  });

  app.post("/api/admin/raids/generate", ...aiGuard, async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      throw new AppError(400, "Geração de raid por IA desativada — configure os raids manualmente no painel de Maps.");
    } catch (err) { next(err); }
  });

  app.post("/api/admin/pvp/generate", ...aiGuard, async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      throw new AppError(400, "Geração de PvP por IA desativada — configure a arena manualmente.");
    } catch (err) { next(err); }
  });

  app.post("/api/admin/maps/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idea = String((req.body || {}).prompt || "").trim();
      if (!idea) throw new AppError(400, "Descreva o mapa que a IA deve criar (ex.: 'floresta negra do norte nível 10, com lago envenenado')");
      requireAi();
      const providerLog: string[] = [];
      const gen = await generateMap(idea, providerLog);
      const saved = await persistGeneratedMap(gen);
      res.status(201).json({ data: saved, providers: providerLog });
    } catch (err) { next(err); }
  });

  // Maps CRUD
  app.get("/api/admin/maps", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.map.findMany({
        include: { monsters: true },
        orderBy: { name: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/maps", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.map.create({ data: normalizeBody("map", req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/maps/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.map.update({ where: { id: req.params.id }, data: normalizeBody("map", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/maps/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$transaction([
        prisma.mapMonster.deleteMany({ where: { mapId: req.params.id } }),
        prisma.mapNpc.deleteMany({ where: { mapId: req.params.id } }),
        prisma.mapConnection.deleteMany({
          where: { OR: [{ fromMapId: req.params.id }, { toMapId: req.params.id }] },
        }),
        prisma.quest.deleteMany({ where: { mapId: req.params.id, progress: { none: {} } } }),
        prisma.raidRun.deleteMany({ where: { mapId: req.params.id } }),
        prisma.map.delete({ where: { id: req.params.id } }),
      ]);
      res.json({ message: "Deleted" });
    } catch {
      try {
        await prisma.map.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ message: "Desativado (ainda referenciado por jogadores)" });
      } catch (err) {
        next(new AppError(400, "Registro referenciado por outros dados e não pôde ser excluído"));
      }
    }
  });

  // Events CRUD
  app.get("/api/admin/events", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.gameEvent.findMany({
        include: { maps: true },
        orderBy: { createdAt: "desc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/events/generate", ...aiGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idea = String((req.body || {}).prompt || "").trim();
      if (!idea) throw new AppError(400, "Descreva o evento que a IA deve criar (ex.: 'invasão de dragões do gelo nível 30, 3 ondas, com loja de moedas de gelo e armas com bônus de gelo craftáveis')");
      requireAi();
      const providerLog: string[] = [];
      const gen = await generateEvent(idea, providerLog);
      const saved = await persistGeneratedEvent(gen);
      res.status(201).json({ data: saved, providers: providerLog });
    } catch (err) { next(err); }
  });

  app.get("/api/admin/events/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await prisma.gameEvent.findUnique({
        where: { id: req.params.id },
        include: {
          maps: true,
          quests: true,
          shopItems: { include: { item: true } },
          craftRecipes: { include: { resultItem: true, resultClass: true } },
        },
      });
      if (!event) throw new AppError(404, "Evento não encontrado");
      res.json(event);
    } catch (err) { next(err); }
  });

  app.post("/api/admin/events", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.gameEvent.create({ data: normalizeBody("gameevent", req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/events/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.gameEvent.update({ where: { id: req.params.id }, data: normalizeBody("gameevent", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/events/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$transaction([
        prisma.craftRecipe.updateMany({ where: { eventId: req.params.id }, data: { eventId: null } }),
        prisma.quest.updateMany({ where: { eventId: req.params.id }, data: { eventId: null } }),
        prisma.map.updateMany({ where: { eventId: req.params.id }, data: { eventId: null } }),
        prisma.eventShopItem.deleteMany({ where: { eventId: req.params.id } }),
      ]);
      const r = await deleteWithSoftFallback(prisma.gameEvent, req, "gameevent");
      res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" });
    } catch (err) { next(err); }
  });

  // Event Shop Items CRUD
  app.get("/api/admin/event-shop-items", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.eventShopItem.findMany({
        where: { eventId: String(req.query.eventId || "") || undefined },
        include: { item: true },
        orderBy: { price: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/event-shop-items", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.eventShopItem.create({ data: normalizeBody("eventshopitem", req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/event-shop-items/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.eventShopItem.update({ where: { id: req.params.id }, data: normalizeBody("eventshopitem", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/event-shop-items/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = await deleteWithSoftFallback(prisma.eventShopItem, req, "eventshopitem");
      res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" });
    } catch (err) { next(err); }
  });

  // Quests CRUD
  app.get("/api/admin/quests", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.quest.findMany({ orderBy: { title: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/quests", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.quest.create({ data: normalizeBody("quest", req.body) })); } catch (err) { next(err); }
  });

  app.put("/api/admin/quests/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.quest.update({ where: { id: req.params.id }, data: normalizeBody("quest", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/quests/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.quest, req, "quest"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Skills CRUD
  app.get("/api/admin/classes/:classId/skills", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.skill.findMany({ where: { classId: req.params.classId }, orderBy: { sortOrder: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/classes/:classId/skills", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const icon = String(req.body?.icon ?? "").trim();
      if (!icon) throw new AppError(400, "Ícone da skill é obrigatório — escolha um ícone antes de salvar");
      res.status(201).json(await prisma.skill.create({ data: { ...normalizeBody("skill", req.body), classId: req.params.classId } }));
    } catch (err) { next(err); }
  });

  app.put("/api/admin/skills/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = normalizeBody("skill", req.body);
      const icon = String(body?.icon ?? "").trim();
      if (!icon) throw new AppError(400, "Ícone da skill é obrigatório — escolha um ícone antes de salvar");
      res.json(await prisma.skill.update({ where: { id: req.params.id }, data: body }));
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/skills/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.skill, req, "skill"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Gera o par de artes da skill (ícone principal + secundário) via IA de imagem
  // (Gemini Image se GEMINI_API_KEY estiver definida; senão Pollinations.ai grátis).
  app.post("/api/admin/skills/ai-icons", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const name = String(body.name ?? "").trim();
      if (!name) throw new AppError(400, "Preencha o nome da skill antes de gerar a arte");
      const icons = await generateSkillIcons({
        name,
        description: String(body.description ?? ""),
        kind: String(body.kind ?? "attack"),
        currentIcon: typeof body.currentIcon === "string" ? body.currentIcon : null,
        seed: body.seed ?? undefined,
      });
      res.json(icons);
    } catch (err) {
      if (err instanceof AppError) return next(err);
      next(new AppError(502, `Falha ao gerar a arte da skill: ${(err as Error).message}`));
    }
  });

  // Class passives CRUD
  app.get("/api/admin/classes/:classId/passives", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.passive.findMany({ where: { classId: req.params.classId }, orderBy: { rankRequired: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/classes/:classId/passives", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.passive.create({ data: { ...normalizeBody("passive", req.body), classId: req.params.classId } })); } catch (err) { next(err); }
  });

  app.put("/api/admin/passives/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.passive.update({ where: { id: req.params.id }, data: normalizeBody("passive", req.body) })); } catch (err) { next(err); }
  });

  app.delete("/api/admin/passives/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.passive, req, "passive"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Effects CRUD (buffs/debuffs/hots/dots independentes)
  const effectError = (err: any) => {
    if (err?.code === "P2002") {
      const field = String(err?.meta?.target ?? "");
      return new AppError(400, `Já existe um efeito com esse ${field.includes("name") ? "nome" : "slug"} — use outro`);
    }
    if (err?.code?.startsWith("P2")) {
      return new AppError(400, "Dados inválidos — verifique os campos do efeito (nome, slug e descrição são obrigatórios)");
    }
    return err;
  };

  app.get("/api/admin/effects", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.effect.findMany({ orderBy: { name: "asc" } })); } catch (err) { next(err); }
  });

  app.post("/api/admin/effects", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await prisma.effect.create({ data: normalizeBody("effect", req.body) })); } catch (err) { next(effectError(err)); }
  });

  app.put("/api/admin/effects/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await prisma.effect.update({ where: { id: req.params.id }, data: normalizeBody("effect", req.body) })); } catch (err) { next(effectError(err)); }
  });

  app.delete("/api/admin/effects/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.effect, req, "effect"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // NPCs CRUD
  app.get("/api/admin/npcs", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.npc.findMany({
        include: { mapNpcs: { include: { map: true } }, shopItems: { include: { item: true, enchantment: true } } },
        orderBy: { name: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/npcs", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("npc", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/npcs/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("npc", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/npcs/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.npc, req, "npc"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // ShopItems CRUD (itens que um NPC vende)
  app.get("/api/admin/shopitems", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {    try {
      res.json(await prisma.shopItem.findMany({
        include: { item: true, npc: true },
        orderBy: { createdAt: "desc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/shopitems", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("shopItem", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/shopitems/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("shopItem", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/shopitems/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.shopItem, req, "shopitem"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // MapNpcs CRUD (NPC posicionado em um mapa)
  app.get("/api/admin/mapnpcs", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.mapNpc.findMany({
        include: { map: true, npc: true },
        orderBy: { createdAt: "desc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/mapnpcs", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("mapNpc", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/mapnpcs/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("mapNpc", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/mapnpcs/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.mapNpc, req, "mapnpc"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // MapMonsters CRUD (monstro com spawn em um mapa)
  app.get("/api/admin/mapmonsters", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.mapMonster.findMany({
        include: { map: true, monster: true },
        orderBy: { createdAt: "desc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/mapmonsters", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("mapMonster", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/mapmonsters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("mapMonster", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/mapmonsters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.mapMonster, req, "mapmonster"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // PatchNotes CRUD (avisos de atualização exibidos no Dashboard)
  // CraftRecipes CRUD
  app.get("/api/admin/craft-recipes", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.craftRecipe.findMany({
        include: { resultItem: true },
        orderBy: { requiredLevel: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/craft-recipes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("craftRecipe", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/craft-recipes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("craftRecipe", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/craft-recipes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.craftRecipe, req, "craft-recipe"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Boosters CRUD (catálogo do Gacha)
  app.get("/api/admin/boosters", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.booster.findMany({ orderBy: [{ rarity: "asc" }, { boostType: "asc" }] }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/boosters", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await saveWithFk("booster", null, req.body)); } catch (err) { next(err); }
  });

  app.put("/api/admin/boosters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await saveWithFk("booster", req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.delete("/api/admin/boosters/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.booster, req, "booster"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Config do Gacha (uma linha): tickets grátis, custo do ticket extra e chances por raridade
  app.get("/api/admin/gacha-config", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await prisma.gachaConfig.findUnique({ where: { id: "gacha" } });
      res.json(config ? { ...config, ticketCost: Number(config.ticketCost) } : null);
    } catch (err) { next(err); }
  });

  app.put("/api/admin/gacha-config", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { freeTickets, ticketCost, chances, slotChances, active } = req.body;
      const parsedChances = typeof chances === "string" ? JSON.parse(chances) : chances ?? {};
      const parsedSlotChances = typeof slotChances === "string" ? JSON.parse(slotChances) : slotChances ?? {};
      res.json(await prisma.gachaConfig.upsert({
        where: { id: "gacha" },
        update: {
          freeTickets: Number(freeTickets) || 3,
          ticketCost: BigInt(Number(ticketCost) || 0),
          chances: parsedChances,
          slotChances: parsedSlotChances,
          active: active !== false,
        },
        create: {
          id: "gacha",
          freeTickets: Number(freeTickets) || 3,
          ticketCost: BigInt(Number(ticketCost) || 0),
          chances: parsedChances,
          slotChances: parsedSlotChances,
          active: active !== false,
        },
      }));
    } catch (err) { next(err); }
  });

  app.get("/api/admin/patch-notes", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.patchNote.findMany({ orderBy: { createdAt: "desc" } }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/patch-notes", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, content, version, isActive } = req.body;
      if (!title || !content) throw new AppError(400, "title e content são obrigatórios");
      res.status(201).json(await prisma.patchNote.create({
        data: { title, content, version: version || null, isActive: isActive !== false },
      }));
    } catch (err) { next(err); }
  });

  app.put("/api/admin/patch-notes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, content, version, isActive } = req.body;
      res.json(await prisma.patchNote.update({
        where: { id: req.params.id },
        data: { title, content, version: version ?? null, isActive },
      }));
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/patch-notes/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.patchNote, req, "patch-note"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // ShopProducts CRUD (loja do game: SF Coins packs, VIP, pass, encantamentos, itens de moeda real/PVP)
  app.get("/api/admin/shop-products", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await prisma.shopProduct.findMany({
        include: { enchantment: { select: { id: true, name: true, slug: true } }, item: { select: { id: true, name: true } }, gameClass: { select: { id: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/shop-products", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug, name, description, type, currency, price, sfCoinAmount, vipDays, enchantmentId, itemId, classId, quantity, icon, isActive, sortOrder } = req.body;
      if (!slug || !name || !type) throw new AppError(400, "slug, name e type são obrigatórios");
      res.status(201).json(await prisma.shopProduct.create({
        data: {
          slug, name, description: description || "", type, currency: currency || "sf_coins",
          price: Number(price) || 0, sfCoinAmount: Number(sfCoinAmount) || 0,
          vipDays: Number(vipDays) || 0, enchantmentId: enchantmentId || null,
          itemId: itemId || null, classId: classId || null, quantity: Math.max(1, Number(quantity) || 1),
          icon: icon || null, isActive: isActive !== false, sortOrder: Number(sortOrder) || 0,
        },
      }));
    } catch (err) { next(err); }
  });

  app.put("/api/admin/shop-products/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug, name, description, type, currency, price, sfCoinAmount, vipDays, enchantmentId, itemId, classId, quantity, icon, isActive, sortOrder } = req.body;
      res.json(await prisma.shopProduct.update({
        where: { id: req.params.id },
        data: {
          slug, name, description, type, currency,
          price: Number(price), sfCoinAmount: Number(sfCoinAmount), vipDays: Number(vipDays),
          enchantmentId: enchantmentId || null, itemId: itemId || null, classId: classId || null,
          quantity: Math.max(1, Number(quantity) || 1),
          icon: icon || null, isActive, sortOrder: Number(sortOrder),
        },
      }));
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/shop-products/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try { const r = await deleteWithSoftFallback(prisma.shopProduct, req, "shop-product"); res.json({ message: r === "deleted" ? "Deleted" : "Desativado (estava referenciado)" }); } catch (err) { next(err); }
  });

  // Backup de conteúdo: exporta todas as tabelas de conteúdo em JSON (BigInt vira string)
  const EXPORT_ORDER = ["statModel", "gameClass", "effect", "item", "enchantment", "map", "monster", "npc", "quest", "skill", "passive", "mapNpc", "mapMonster", "shopItem", "dropItem"] as const;
  const BIGINT_FIELDS: Record<string, string[]> = {
    item: ["buyPrice", "sellPrice"],
    enchantment: ["price"],
    monster: ["xpReward", "goldReward"],
    quest: ["xpReward", "goldReward"],
    shopItem: ["price"],
  };

  const jsonSafe = (rows: any[]): any[] =>
    rows.map((row) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === "bigint" ? { $bigint: v.toString() } : v;
      }
      return out;
    });

  app.get("/api/admin/export", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const models: Record<string, any[]> = {};
      for (const model of EXPORT_ORDER) {
        models[model] = jsonSafe(await (prisma as any)[model].findMany());
      }
      res.json({ version: 1, exportedAt: new Date().toISOString(), models });
    } catch (err) { next(err); }
  });

  const restoreBigInt = (model: string, row: any): any => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && typeof v === "object" && typeof (v as any).$bigint === "string") {
        out[k] = BigInt((v as any).$bigint);
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  app.post("/api/admin/import", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { models } = req.body ?? {};
      if (!models || typeof models !== "object") throw new AppError(400, "Payload de export inválido");

      const counts: Record<string, number> = {};
      for (const model of EXPORT_ORDER) {
        const rows = models[model];
        if (!Array.isArray(rows)) continue;
        let n = 0;
        for (const raw of rows) {
          if (!raw || typeof raw.id !== "string") continue;
          const data: Record<string, any> = restoreBigInt(model, raw);
          delete data.id;
          delete data.createdAt;
          delete data.updatedAt;
          await (prisma as any)[model].upsert({
            where: { id: raw.id },
            update: data,
            create: { id: raw.id, ...data },
          });
          n++;
        }
        if (n > 0) counts[model] = n;
      }
      res.json({ message: "Conteúdo importado", counts });
    } catch (err: any) {
      if (err?.code === "P2003") {
        next(new AppError(400, "Falha na importação: referência inválida — importe a versão completa do backup"));
        return;
      }
      next(err);
    }
  });
}
