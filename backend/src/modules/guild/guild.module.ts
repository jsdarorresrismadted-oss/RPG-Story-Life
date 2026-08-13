import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { ensureGuildQuests, claimGuildQuest } from "../../core/guildQuests";
import { io } from "../../server";

const DEFAULT_GUILD_REQUIREMENTS = {
  requiredLevel: 2,
  requiredGold: 200,
  requiredSfCoins: 0,
};

const ROLE_HIERARCHY: Record<string, number> = { member: 0, officer: 1, leader: 2 };

async function getGuildRequirements(): Promise<{ requiredLevel: number; requiredGold: number; requiredSfCoins: number }> {
  const config = await prisma.systemConfig.findUnique({ where: { key: "guild" } });
  if (!config) return DEFAULT_GUILD_REQUIREMENTS;
  const v = config.value as Record<string, unknown>;
  return {
    requiredLevel: typeof v.requiredLevel === "number" ? v.requiredLevel : DEFAULT_GUILD_REQUIREMENTS.requiredLevel,
    requiredGold: typeof v.requiredGold === "number" ? v.requiredGold : DEFAULT_GUILD_REQUIREMENTS.requiredGold,
    requiredSfCoins: typeof v.requiredSfCoins === "number" ? v.requiredSfCoins : DEFAULT_GUILD_REQUIREMENTS.requiredSfCoins,
  };
}

// Busca a associação do usuário e valida que tem permissão mínima na guilda.
async function requireGuildRole(userId: string, guildId: string, minRole: "member" | "officer" | "leader"): Promise<any> {
  const membership = await prisma.guildMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  if (!membership) throw new AppError(403, "Você não é membro desta guilda");
  if ((ROLE_HIERARCHY[membership.role] ?? 0) < ROLE_HIERARCHY[minRole]) {
    throw new AppError(403, "Permissão insuficiente nesta guilda");
  }
  return membership;
}

// Ao mudar de guilda, notifica o socket do usuário para atualizar as tags do chat.
function notifyChatRefresh(userId: string): void {
  try {
    io?.to(`user:${userId}`).emit("chat:refresh");
  } catch {
    // socket ainda não inicializado (fora de runtime) — ignora
  }
}

export function createGuildModule(app: Express): void {
  app.get("/api/guilds", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const guilds = await prisma.guild.findMany({
        orderBy: { level: "desc" },
        take: 50,
      });
      res.json(guilds);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/guilds/rankings", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rankings = await prisma.guildRanking.findMany({
        orderBy: { rank: "asc" },
        include: { guild: { select: { name: true, tag: true, level: true } } },
        take: 100,
      });
      res.json(rankings);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/guilds/requirements", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await getGuildRequirements());
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/guilds/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guild = await prisma.guild.findUnique({
        where: { id: req.params.id },
        include: {
          members: {
            orderBy: [{ role: "asc" }, { contribution: "desc" }],
            include: { user: { select: { username: true, displayName: true, level: true, isOnline: true } } },
          },
          perks: true,
          bank: true,
          shop: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: { item: { select: { id: true, name: true, icon: true, rarity: true, type: true, description: true, level: true } } },
          },
        },
      });
      if (!guild) {
        res.status(404).json({ error: "Guild not found" });
        return;
      }
      res.json(guild);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/guilds", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, tag, description } = req.body;
      if (!name || !tag || !description) {
        throw new AppError(400, "Name, tag and description are required");
      }

      const existing = await prisma.guild.findFirst({
        where: { OR: [{ name }, { tag }] },
      });
      if (existing) throw new AppError(409, "Guild name or tag already taken");

      const alreadyMember = await prisma.guildMember.findFirst({
        where: { userId: req.user!.userId },
      });
      if (alreadyMember) throw new AppError(400, "You are already in a guild");

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { level: true, gold: true, sfCoins: true },
      });
      if (!user) throw new AppError(404, "User not found");

      const requirements = await getGuildRequirements();
      const missing: string[] = [];
      if (user.level < requirements.requiredLevel) missing.push(`Level ${requirements.requiredLevel}`);
      if (user.gold < BigInt(requirements.requiredGold)) missing.push(`${requirements.requiredGold} Gold`);
      if (user.sfCoins < requirements.requiredSfCoins) missing.push(`${requirements.requiredSfCoins} SF Coins`);
      if (missing.length > 0) {
        throw new AppError(400, `Requirements not met: ${missing.join(", ")}`);
      }

      const guild = await prisma.$transaction(async (tx) => {
        const g = await tx.guild.create({
          data: { name, tag, description, memberCount: 1 },
        });
        await tx.guildMember.create({
          data: { guildId: g.id, userId: req.user!.userId, role: "leader", rank: 1 },
        });
        await tx.guildBank.create({ data: { guildId: g.id } });
        await tx.guildRanking.create({ data: { guildId: g.id } });
        return g;
      });

      notifyChatRefresh(req.user!.userId);
      res.status(201).json(guild);
    } catch (err: any) {
      if (err?.code === "P2002") {
        next(new AppError(409, "Guild name or tag already taken"));
        return;
      }
      next(err);
    }
  });

  app.post("/api/guilds/:id/join", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guild = await prisma.guild.findUnique({ where: { id: req.params.id } });
      if (!guild) throw new AppError(404, "Guild not found");

      const membership = await prisma.guildMember.findFirst({
        where: { userId: req.user!.userId },
      });
      if (membership) throw new AppError(400, "You are already in a guild");

      if (guild.memberCount >= guild.maxMembers) {
        throw new AppError(400, "Guild is full");
      }

      await prisma.$transaction(async (tx) => {
        await tx.guildMember.create({
          data: { guildId: req.params.id, userId: req.user!.userId, role: "member", rank: 1 },
        });
        await tx.guild.update({
          where: { id: req.params.id },
          data: { memberCount: { increment: 1 } },
        });
      });

      notifyChatRefresh(req.user!.userId);
      res.json({ message: "Joined guild" });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/guilds/:id/leave", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membership = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: req.user!.userId } },
      });
      if (!membership) throw new AppError(404, "Not a member");

      await prisma.$transaction(async (tx) => {
        await tx.guildMember.delete({ where: { id: membership.id } });
        await tx.guild.update({
          where: { id: req.params.id },
          data: { memberCount: { decrement: 1 } },
        });
      });

      notifyChatRefresh(req.user!.userId);
      res.json({ message: "Left guild" });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/user/guild", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membership = await prisma.guildMember.findFirst({
        where: { userId: req.user!.userId },
        include: { guild: true },
      });
      res.json(membership);
    } catch (err) {
      next(err);
    }
  });

  // ===== Gestão de membros =====

  // Promove um membro (member -> officer, ou officer -> leader). Apenas leader promove.
  app.post("/api/guilds/:id/promote", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: targetId } = req.body;
      await requireGuildRole(req.user!.userId, req.params.id, "leader");

      const target = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: targetId } },
      });
      if (!target) throw new AppError(404, "Membro não encontrado");

      if (target.role === "leader") throw new AppError(400, "O líder não pode ser promovido");
      const nextRole = target.role === "member" ? "officer" : "leader";
      await prisma.guildMember.update({ where: { id: target.id }, data: { role: nextRole } });
      res.json({ message: `Membro promovido para ${nextRole}`, role: nextRole });
    } catch (err) {
      next(err);
    }
  });

  // Rebaixa um membro (leader -> officer, officer -> member). Apenas leader rebaixa.
  app.post("/api/guilds/:id/demote", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: targetId } = req.body;
      await requireGuildRole(req.user!.userId, req.params.id, "leader");

      const target = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: targetId } },
      });
      if (!target) throw new AppError(404, "Membro não encontrado");
      if (target.role === "leader") throw new AppError(400, "O líder não pode ser rebaixado");

      const nextRole = target.role === "officer" ? "member" : "member";
      await prisma.guildMember.update({ where: { id: target.id }, data: { role: nextRole } });
      res.json({ message: `Membro rebaixado para ${nextRole}`, role: nextRole });
    } catch (err) {
      next(err);
    }
  });

  // Expulsa um membro. Líder pode expulsar qualquer um; Oficial expulsa apenas membros.
  app.delete("/api/guilds/:id/members/:userId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const myMembership = await requireGuildRole(req.user!.userId, req.params.id, "officer");
      const target = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
      });
      if (!target) throw new AppError(404, "Membro não encontrado");
      if (target.role === "leader") throw new AppError(400, "Não é possível expulsar o líder");

      if (myMembership.role === "officer" && target.role === "officer") {
        throw new AppError(403, "Oficiais não podem expulsar outros oficiais");
      }

      await prisma.$transaction(async (tx) => {
        await tx.guildMember.delete({ where: { id: target.id } });
        await tx.guild.update({
          where: { id: req.params.id },
          data: { memberCount: { decrement: 1 } },
        });
      });

      notifyChatRefresh(target.userId);
      res.json({ message: "Membro expulso" });
    } catch (err) {
      next(err);
    }
  });

  // Deposita ouro no cofre da guilda e converte em pontos de contribuição (1 ouro = 1 ponto).
  app.post("/api/guilds/:id/deposit", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const amount = Math.floor(Number(req.body.amount) || 0);
      if (amount <= 0) throw new AppError(400, "Valor inválido");

      const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { gold: true } });
      if (!user || user.gold < BigInt(amount)) throw new AppError(400, "Ouro insuficiente");

      const guild = await prisma.guild.findUnique({ where: { id: req.params.id } });
      if (!guild) throw new AppError(404, "Guilda não encontrada");
      const bank = await prisma.guildBank.findFirst({ where: { guildId: req.params.id } });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.user!.userId },
          data: { gold: { decrement: BigInt(amount) } },
        });
        if (bank) {
          await tx.guildBank.update({
            where: { id: bank.id },
            data: { gold: { increment: BigInt(amount) } },
          });
        } else {
          await tx.guildBank.create({
            data: { guildId: req.params.id, gold: BigInt(amount) },
          });
        }
        await tx.guildMember.update({
          where: { guildId_userId: { guildId: req.params.id, userId: req.user!.userId } },
          data: { contribution: { increment: BigInt(amount) } },
        });
        await tx.guild.update({
          where: { id: req.params.id },
          data: { experience: { increment: BigInt(amount) } },
        });
      });

      res.json({ message: "Depósito realizado", amount });
    } catch (err) {
      next(err);
    }
  });

  // Sobe o rank interno do membro na guilda (gasto de contribuição). Leader/Officer promovem ranks.
  app.post("/api/guilds/:id/members/:userId/rank-up", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "officer");
      const target = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: req.params.id, userId: req.params.userId } },
      });
      if (!target) throw new AppError(404, "Membro não encontrado");
      if (target.role === "leader") throw new AppError(400, "O líder está no rank máximo");

      const nextRank = Math.min(target.rank + 1, 10);
      await prisma.guildMember.update({ where: { id: target.id }, data: { rank: nextRank } });
      res.json({ message: `Rank atualizado para ${nextRank}`, rank: nextRank });
    } catch (err) {
      next(err);
    }
  });

  // ===== Shop da guilda (compra com pontos de contribuição) =====

  app.get("/api/guilds/:id/shop", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "member");
      const shop = await prisma.guildShopItem.findMany({
        where: { guildId: req.params.id, isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { item: true },
      });
      res.json(shop);
    } catch (err) {
      next(err);
    }
  });

  // Adiciona um item ao shop da guilda (Leader/Officer).
  app.post("/api/guilds/:id/shop", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "officer");
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

  // Remove um item do shop da guilda (Leader/Officer).
  app.delete("/api/guilds/:id/shop/:shopItemId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "officer");
      await prisma.guildShopItem.updateMany({
        where: { id: req.params.shopItemId, guildId: req.params.id },
        data: { isActive: false },
      });
      res.json({ message: "Item removido do shop" });
    } catch (err) {
      next(err);
    }
  });

  // Compra um item do shop usando GC (Guild Coins).
  app.post("/api/guilds/:id/shop/:shopItemId/buy", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "member");
      const entry = await prisma.guildShopItem.findUnique({
        where: { id: req.params.shopItemId },
        include: { item: true },
      });
      if (!entry || entry.guildId !== req.params.id || !entry.isActive) {
        throw new AppError(404, "Item não encontrado no shop da guilda");
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { gc: true },
      });
      if (!user || user.gc < Number(entry.price)) {
        throw new AppError(400, "GC insuficientes — ganhe GC completando quests da guilda");
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.user!.userId },
          data: { gc: { decrement: Number(entry.price) } },
        });
        // Entrega o item no inventário (acumula se empilhável)
        const existing = await tx.inventory.findFirst({
          where: { userId: req.user!.userId, itemId: entry.itemId, slotIndex: null },
        });
        if (existing) {
          await tx.inventory.update({
            where: { id: existing.id },
            data: { quantity: { increment: 1 } },
          });
        } else {
          await tx.inventory.create({
            data: { userId: req.user!.userId, itemId: entry.itemId, quantity: 1 },
          });
        }
      });

      res.json({ message: "Compra realizada", item: entry.item.name });
    } catch (err) {
      next(err);
    }
  });

  // ===== Quests de guilda (geradas pelo sistema: matar mobs, coletar drops, PvP) =====

  app.get("/api/guilds/:id/quests", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guild = await prisma.guild.findUnique({ where: { id: req.params.id } });
      if (!guild) throw new AppError(404, "Guilda não encontrada");
      await requireGuildRole(req.user!.userId, req.params.id, "member");

      await ensureGuildQuests(guild.id, guild.level);
      const quests = await prisma.guildQuest.findMany({
        where: { guildId: guild.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });

      const userId = req.user!.userId;
      res.json(
        quests.map((q) => {
          const progress = (q.progress as Record<string, any>) ?? {};
          const me = progress[userId] ?? { count: 0, claimed: false };
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
            count: me.count ?? 0,
            claimed: !!me.claimed,
            completed: (me.count ?? 0) >= q.targetCount,
          };
        })
      );
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/guilds/:id/quests/:questId/claim", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await requireGuildRole(req.user!.userId, req.params.id, "member");
      const result = await claimGuildQuest(req.user!.userId, req.params.id, req.params.questId);
      res.json({ message: "Recompensa recebida!", ...result });
    } catch (err) {
      next(err);
    }
  });
}
