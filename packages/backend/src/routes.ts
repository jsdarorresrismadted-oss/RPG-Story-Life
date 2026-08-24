// ===== ROUTES =====

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  CreateItemSchema,
  UpdateItemSchema,
  CreateNpcSchema,
  UpdateNpcSchema,
  CreateQuestSchema,
  UpdateQuestSchema,
  CreateMapSchema,
  UpdateMapSchema,
  CreateMonsterSchema,
  UpdateMonsterSchema,
  CreateCraftRecipeSchema,
  UpdateCraftRecipeSchema,
  CreateShopItemSchema,
  UpdateShopItemSchema,
  CreateEventSchema,
  UpdateEventSchema,
  CreateWorldBossSchema,
  UpdateWorldBossSchema,
  CreateGuildSchema,
  UpdateGuildSchema,
  CreateClassSchema,
  UpdateClassSchema,
  CreateCraftRecipeSchema,
  UpdateCraftRecipeSchema,
} from "@rpg/shared";

export async function registerRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // ===== AUTH ROUTES =====

  typedFastify.post("/api/auth/register", {
    schema: { body: RegisterSchema },
  }, async (request, reply) => {
    const { username, email, password, displayName } = request.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return reply.code(400).send({ error: "Username or email already exists" });
    }

    const passwordHash = await hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, passwordHash, displayName },
      select: { id: true, username: true, email: true, displayName: true, role: true, createdAt: true },
    });

    const accessToken = fastify.jwt.sign({ sub: user.id, role: user.role });
    const refreshToken = fastify.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return { user, accessToken };
  });

  typedFastify.post("/api/auth/login", {
    schema: { body: LoginSchema },
  }, async (request, reply) => {
    const { username, password } = request.body;

    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), isOnline: true } });

    const accessToken = fastify.jwt.sign({ sub: user.id, role: user.role });
    const refreshToken = fastify.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return {
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName, role: user.role },
      accessToken,
    };
  });

  typedFastify.post("/api/auth/refresh", {
    schema: { body: RefreshTokenSchema },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    try {
      const decoded = fastify.jwt.verify(refreshToken) as { sub: string; type: string };
      if (decoded.type !== "refresh") throw new Error("Invalid token type");

      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) throw new Error("User not found");

      const accessToken = fastify.jwt.sign({ sub: user.id, role: user.role });
      const newRefreshToken = fastify.jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "7d" });

      reply.setCookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return { accessToken };
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }
  });

  typedFastify.post("/api/auth/logout", async (request, reply) => {
    reply.clearCookie("refreshToken", { path: "/" });
    if (request.user) {
      await prisma.user.update({ where: { id: request.user.sub }, data: { isOnline: false } });
    }
    return { message: "Logged out" };
  });

  typedFastify.get("/api/auth/me", { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, username: true, email: true, displayName: true, role: true, vipUntil: true, createdAt: true },
    });
    return { user };
  });

  // ===== CHARACTER ROUTES =====

  typedFastify.get("/api/characters/index", async () => {
    const classes = await prisma.gameClass.findMany({
      where: { isActive: true, isStarter: true },
      include: { statModel: true },
      orderBy: { name: "asc" },
    });
    return { classes };
  });

  typedFastify.post("/api/characters", {
    preHandler: [fastify.authenticate],
    schema: { body: z.object({ name: z.string().min(2).max(20), classId: z.string().uuid(), gender: z.enum(["male", "female"]).default("male") }) },
  }, async (request, reply) => {
    const { name, classId, gender } = request.body;
    const userId = request.user.sub;

    const existing = await prisma.character.findFirst({ where: { userId } });
    if (existing) {
      return reply.code(400).send({ error: "Character already exists" });
    }

    const gameClass = await prisma.gameClass.findUnique({ where: { id: classId, isActive: true, isStarter: true } });
    if (!gameClass) return reply.code(404).send({ error: "Class not found" });

    const character = await prisma.character.create({
      data: {
        userId,
        name,
        gender,
        classId,
        currentHp: 100,
        currentMana: 50,
      },
      include: { class: { select: { id: true, name: true, slug: true } } },
    });

    // Give starter kit
    const starterItems = await prisma.item.findMany({
      where: { name: { startsWith: "Iniciante" }, isActive: true },
    });

    for (const item of starterItems) {
      const inventoryItem = await prisma.inventory.create({
        data: { userId: request.user.sub, itemId: item.id, quantity: 1, isEquipped: false },
      });

      // Auto-equip equipment
      if (["weapon", "armor", "helm", "cape", "class"].includes(item.type)) {
        await prisma.inventory.update({
          where: { id: inventoryItem.id },
          data: { isEquipped: true },
        });

        const field = `${item.type}Id`.replace("class", "classItem");
        await prisma.equipment.upsert({
          where: { characterId: character.id },
          create: { characterId: character.id, [field]: item.id },
          update: { [field]: item.id },
        });
      }
    }

    return { character };
  });

  typedFastify.get("/api/characters/my", { preHandler: [fastify.authenticate] }, async (request) => {
    const character = await prisma.character.findFirst({
      where: { userId: request.user.sub },
      include: {
        class: true,
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
        activeEffects: { include: { effect: true } },
        classProgress: { where: { isActive: true }, include: { gameClass: { select: { id: true, name: true, slug: true, icon: true } } } },
      },
    });

    if (!character) return reply.code(404).send({ error: "Character not found" });

    // Compute stats
    // ... stat computation here

    return { character };
  });

  typedFastify.post("/api/characters/rank-up", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const character = await prisma.character.findFirst({ where: { userId: request.user.sub } });
    if (!character) return reply.code(404).send({ error: "Character not found" });

    const progress = await prisma.characterClass.findFirst({
      where: { characterId: character.id, isActive: true },
    });
    if (!progress) return reply.code(404).send({ error: "Class progress not found" });

    const gameClass = await prisma.gameClass.findUnique({ where: { id: progress.classId }, select: { rankMax: true } });
    const maxRank = gameClass?.rankMax ?? 10;

    if (progress.rank >= maxRank) return reply.code(400).send({ error: `Already at max rank (${maxRank})` });

    const xpNeeded = Math.floor(100 * Math.pow(1.5, progress.rank - 1));
    if (Number(progress.experience) < xpNeeded) {
      return reply.code(400).send({ error: `Need ${xpNeeded} class XP to reach rank ${progress.rank + 1}` });
    }

    const updated = await prisma.characterClass.update({
      where: { id: progress.id },
      data: { rank: { increment: 1 }, experience: { decrement: BigInt(xpNeeded) } },
    });

    return { rank: updated.rank, experience: Number(updated.experience), xpToNext: Math.floor(100 * Math.pow(1.5, updated.rank - 1)) };
  });

  // ===== ITEM ROUTES =====

  typedFastify.get("/api/admin/items", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const { page = "1", limit = "50", type, rarity, search } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = { isActive: true };
    if (type) where.type = type;
    if (rarity) where.rarity = rarity;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const [items, total] = await Promise.all([
      prisma.item.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.item.count({ where }),
    ]);

    return { items, total, page: parseInt(page), limit: parseInt(limit) };
  });

  typedFastify.post("/api/admin/items", {
    preHandler: [fastify.requireAdmin],
    schema: { body: CreateItemSchema },
  }, async (request, reply) => {
    const item = await prisma.item.create({ data: request.body });
    return reply.code(201).send(item);
  });

  typedFastify.put("/api/admin/items/:id", {
    preHandler: [fastify.requireAdmin],
    schema: { body: UpdateItemSchema, params: z.object({ id: z.string().uuid() }) },
  }, async (request, reply) => {
    const { id } = request.params;
    const item = await prisma.item.update({ where: { id }, data: request.body });
    return item;
  });

  typedFastify.delete("/api/admin/items/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    await prisma.item.update({ where: { id }, data: { isActive: false } });
    return { message: "Item deactivated" };
  });

  // ===== NPC ROUTES =====

  typedFastify.get("/api/admin/npcs", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const npcs = await prisma.npc.findMany({
      include: { mapNpcs: { include: { map: true } }, shopItems: { include: { item: true, enchantment: true } }, quests: true, actions: { orderBy: { order: "asc" } } },
      orderBy: { name: "asc" },
    });
    return npcs;
  });

  typedFastify.post("/api/admin/npcs", {
    preHandler: [fastify.requireAdmin],
    schema: { body: CreateNpcSchema },
  }, async (request, reply) => {
    const npc = await prisma.npc.create({ data: request.body });
    return reply.code(201).send(npc);
  });

  typedFastify.put("/api/admin/npcs/:id", {
    preHandler: [fastify.requireAdmin],
    schema: { body: UpdateNpcSchema, params: z.object({ id: z.string().uuid() }) },
  }, async (request, reply) => {
    const { id } = request.params;
    const { actions, ...data } = request.body;
    const npc = await prisma.npc.update({ where: { id }, data });
    if (actions) {
      await prisma.npcAction.deleteMany({ where: { npcId: id } });
      if (actions.length > 0) {
        await prisma.npcAction.createMany({ data: actions.map((a, i) => ({ ...a, npcId: id, order: i })) });
      }
    }
    return npc;
  });

  typedFastify.delete("/api/admin/npcs/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.npc.delete({ where: { id: request.params.id } });
    return { message: "NPC deleted" };
  });

  // NPC Actions
  typedFastify.get("/api/admin/npcs/:id/actions", { preHandler: [fastify.requireAdmin] }, async (request) => {
    return prisma.npcAction.findMany({ where: { npcId: request.params.id }, orderBy: { order: "asc" } });
  });

  typedFastify.post("/api/admin/npcs/:id/actions", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.npcAction.create({ data: { ...request.body, npcId: request.params.id } });
    return reply.code(201).send(created);
  });

  typedFastify.put("/api/admin/npcs/:id/actions/:actionId", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const updated = await prisma.npcAction.update({ where: { id: request.params.actionId }, data: request.body });
    return updated;
  });

  typedFastify.delete("/api/admin/npcs/:id/actions/:actionId", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.npcAction.delete({ where: { id: request.params.actionId } });
    return { message: "Action deleted" };
  });

  // ===== QUEST ROUTES =====

  typedFastify.get("/api/admin/quests", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const quests = await prisma.quest.findMany({
      include: { giverNpc: { select: { id: true, name: true, type: true } } },
      orderBy: { title: "asc" },
    });
    return quests;
  });

  typedFastify.post("/api/admin/quests", { preHandler: [fastify.requireAdmin], schema: { body: CreateQuestSchema } }, async (request, reply) => {
    const quest = await prisma.quest.create({ data: request.body });
    return reply.code(201).send(quest);
  });

  typedFastify.put("/api/admin/quests/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateQuestSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const quest = await prisma.quest.update({ where: { id: request.params.id }, data: request.body });
    return quest;
  });

  typedFastify.delete("/api/admin/quests/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.quest.delete({ where: { id: request.params.id } });
    return { message: "Quest deleted" };
  });

  // ===== MAP ROUTES =====

  typedFastify.get("/api/admin/maps", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const maps = await prisma.map.findMany({
      include: { npcs: { include: { npc: true } }, monsters: { include: { monster: true } }, connections: true, event: true },
      orderBy: { sortOrder: "asc" },
    });
    return maps;
  });

  typedFastify.post("/api/admin/maps", { preHandler: [fastify.requireAdmin], schema: { body: CreateMapSchema } }, async (request, reply) => {
    const map = await prisma.map.create({ data: request.body });
    return reply.code(201).send(map);
  });

  typedFastify.put("/api/admin/maps/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateMapSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const map = await prisma.map.update({ where: { id: request.params.id }, data: request.body });
    return map;
  });

  typedFastify.delete("/api/admin/maps/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.map.delete({ where: { id: request.params.id } });
    return { message: "Map deleted" };
  });

  // Map NPCs
  typedFastify.post("/api/admin/mapnpcs", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.mapNpc.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.delete("/api/admin/mapnpcs/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.mapNpc.delete({ where: { id: request.params.id } });
    return { message: "Map NPC deleted" };
  });

  // Map Monsters
  typedFastify.post("/api/admin/mapmonsters", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.mapMonster.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.delete("/api/admin/mapmonsters/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.mapMonster.delete({ where: { id: request.params.id } });
    return { message: "Map Monster deleted" };
  });

  // Map Connections
  typedFastify.post("/api/admin/mapconnections", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.mapConnection.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.delete("/api/admin/mapconnections/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.mapConnection.delete({ where: { id: request.params.id } });
    return { message: "Map connection deleted" };
  });

  // ===== MONSTER ROUTES =====

  typedFastify.get("/api/admin/monsters", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const monsters = await prisma.monster.findMany({ orderBy: { level: "asc" } });
    return monsters;
  });

  typedFastify.post("/api/admin/monsters", { preHandler: [fastify.requireAdmin], schema: { body: CreateMonsterSchema } }, async (request, reply) => {
    const monster = await prisma.monster.create({ data: request.body });
    return reply.code(201).send(monster);
  });

  typedFastify.put("/api/admin/monsters/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateMonsterSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const monster = await prisma.monster.update({ where: { id: request.params.id }, data: request.body });
    return monster;
  });

  typedFastify.delete("/api/admin/monsters/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.monster.delete({ where: { id: request.params.id } });
    return { message: "Monster deleted" };
  });

  // ===== CRAFT RECIPES =====

  typedFastify.get("/api/admin/craft-recipes", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const recipes = await prisma.craftRecipe.findMany({
      include: { resultItem: true, resultClass: { select: { id: true, name: true } } },
      orderBy: { requiredLevel: "asc" },
    });
    return recipes;
  });

  typedFastify.post("/api/admin/craft-recipes", { preHandler: [fastify.requireAdmin], schema: { body: CreateCraftRecipeSchema } }, async (request, reply) => {
    const recipe = await prisma.craftRecipe.create({ data: request.body });
    return reply.code(201).send(recipe);
  });

  typedFastify.put("/api/admin/craft-recipes/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateCraftRecipeSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const recipe = await prisma.craftRecipe.update({ where: { id: request.params.id }, data: request.body });
    return recipe;
  });

  typedFastify.delete("/api/admin/craft-recipes/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.craftRecipe.delete({ where: { id: request.params.id } });
    return { message: "Craft recipe deleted" };
  });

  // ===== SHOP ITEMS =====

  typedFastify.get("/api/admin/shopitems", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const { npcId } = request.query as Record<string, string>;
    const where: any = {};
    if (npcId) where.npcId = npcId;
    const items = await prisma.shopItem.findMany({ where, include: { item: true, npc: true, enchantment: true }, orderBy: { createdAt: "desc" } });
    return items;
  });

  typedFastify.post("/api/admin/shopitems", { preHandler: [fastify.requireAdmin], schema: { body: CreateShopItemSchema } }, async (request, reply) => {
    const { itemId, enchantmentId } = request.body;
    if (itemId) {
      const existing = await prisma.shopItem.findFirst({ where: { itemId, id: { not: undefined } } });
      if (existing) return reply.code(409).send({ error: "Item already in another shop" });
    }
    if (request.body.enchantmentId) {
      const existing = await prisma.shopItem.findFirst({ where: { enchantmentId: request.body.enchantmentId, id: { not: undefined } } });
      if (existing) return reply.code(409).send({ error: "Enchantment already in another shop" });
    }
    const created = await prisma.shopItem.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.put("/api/admin/shopitems/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateShopItemSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const { itemId, enchantmentId } = request.body;
    if (itemId) {
      const existing = await prisma.shopItem.findFirst({ where: { itemId, id: { not: request.params.id } } });
      if (existing) return reply.code(409).send({ error: "Item already in another shop" });
    }
    if (enchantmentId) {
      const existing = await prisma.shopItem.findFirst({ where: { enchantmentId, id: { not: request.params.id } } });
      if (existing) return reply.code(409).send({ error: "Enchantment already in another shop" });
    }
    const updated = await prisma.shopItem.update({ where: { id: request.params.id }, data: request.body });
    return updated;
  });

  typedFastify.delete("/api/admin/shopitems/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.shopItem.delete({ where: { id: request.params.id } });
    return { message: "Shop item deleted" };
  });

  // ===== EVENT ROUTES =====

  typedFastify.get("/api/admin/events", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const events = await prisma.gameEvent.findMany({ orderBy: { createdAt: "desc" } });
    return events;
  });

  typedFastify.post("/api/admin/events", { preHandler: [fastify.requireAdmin], schema: { body: CreateEventSchema } }, async (request, reply) => {
    const event = await prisma.gameEvent.create({ data: request.body });
    return reply.code(201).send(event);
  });

  typedFastify.put("/api/admin/events/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateEventSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const event = await prisma.gameEvent.update({ where: { id: request.params.id }, data: request.body });
    return event;
  });

  typedFastify.delete("/api/admin/events/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.gameEvent.delete({ where: { id: request.params.id } });
    return { message: "Event deleted" };
  });

  // Event Shop Items
  typedFastify.get("/api/admin/event-shop-items", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const { eventId } = request.query as Record<string, string>;
    const where: any = {};
    if (eventId) where.eventId = eventId;
    return prisma.eventShopItem.findMany({ where, include: { item: true, event: true }, orderBy: { createdAt: "desc" } });
  });

  typedFastify.post("/api/admin/event-shop-items", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.eventShopItem.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.delete("/api/admin/event-shop-items/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.eventShopItem.delete({ where: { id: request.params.id } });
    return { message: "Event shop item deleted" };
  });

  // ===== WORLD BOSS ROUTES =====

  typedFastify.get("/api/admin/worldbosses", { preHandler: [fastify.requireAdmin] }, async (request) => {
    const bosses = await prisma.worldBoss.findMany({
      include: { _count: { select: { participations: true } } },
      orderBy: { createdAt: "desc" },
    });
    return bosses;
  });

  typedFastify.post("/api/admin/worldbosses", { preHandler: [fastify.requireAdmin], schema: { body: CreateWorldBossSchema } }, async (request, reply) => {
    const boss = await prisma.worldBoss.create({ data: request.body });
    return reply.code(201).send(boss);
  });

  typedFastify.put("/api/admin/worldbosses/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateWorldBossSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const boss = await prisma.worldBoss.update({ where: { id: request.params.id }, data: request.body });
    return boss;
  });

  typedFastify.delete("/api/admin/worldbosses/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.worldBoss.delete({ where: { id: request.params.id } });
    return { message: "World Boss deleted" };
  });

  typedFastify.post("/api/admin/worldbosses/:id/spawn", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const boss = await prisma.worldBoss.findUnique({ where: { id: request.params.id } });
    if (!boss) return reply.code(404).send({ error: "World Boss not found" });

    await prisma.worldBoss.update({
      where: { id: request.params.id },
      data: { currentHp: boss.maxHp, isAlive: true, lastSpawnAt: new Date(), spawnCount: { increment: 1 } },
    });

    // Notify via socket
    return { message: `${boss.name} spawned!` };
  });

  // ===== GUILD ROUTES =====

  typedFastify.get("/api/admin/guilds", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.guild.findMany({ include: { _count: { select: { members: true } } }, orderBy: { createdAt: "desc" } });
  });

  typedFastify.post("/api/admin/guilds", { preHandler: [fastify.requireAdmin], schema: { body: CreateGuildSchema } }, async (request, reply) => {
    const guild = await prisma.guild.create({ data: request.body });
    return reply.code(201).send(guild);
  });

  typedFastify.put("/api/admin/guilds/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateGuildSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const guild = await prisma.guild.update({ where: { id: request.params.id }, data: request.body });
    return guild;
  });

  typedFastify.delete("/api/admin/guilds/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.guild.delete({ where: { id: request.params.id } });
    return { message: "Guild deleted" };
  });

  // ===== CLASS ROUTES =====

  typedFastify.get("/api/admin/classes", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.gameClass.findMany({ include: { statModel: true }, orderBy: { name: "asc" } });
  });

  typedFastify.post("/api/admin/classes", { preHandler: [fastify.requireAdmin], schema: { body: CreateClassSchema } }, async (request, reply) => {
    const cls = await prisma.gameClass.create({ data: request.body });
    return reply.code(201).send(cls);
  });

  typedFastify.put("/api/admin/classes/:id", { preHandler: [fastify.requireAdmin], schema: { body: UpdateClassSchema, params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => {
    const cls = await prisma.gameClass.update({ where: { id: request.params.id }, data: request.body });
    return cls;
  });

  typedFastify.delete("/api/admin/classes/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.gameClass.delete({ where: { id: request.params.id } });
    return { message: "Class deleted" };
  });

  // ===== BOOSTER / GACHA =====

  typedFastify.get("/api/admin/boosters", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.booster.findMany({ orderBy: [{ rarity: "asc" }, { boostType: "asc" }] });
  });

  typedFastify.post("/api/admin/boosters", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.booster.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.put("/api/admin/boosters/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const updated = await prisma.booster.update({ where: { id: request.params.id }, data: request.body });
    return updated;
  });

  typedFastify.delete("/api/admin/boosters/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.booster.delete({ where: { id: request.params.id } });
    return { message: "Booster deleted" };
  });

  typedFastify.get("/api/admin/gacha-config", { preHandler: [fastify.requireAdmin] }, async () => {
    const config = await prisma.gachaConfig.findUnique({ where: { id: "gacha" } });
    return config ? { ...config, ticketCost: Number(config.ticketCost) } : null;
  });

  typedFastify.put("/api/admin/gacha-config", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const { freeTickets, ticketCost, chances, slotChances, active } = request.body;
    const parsedChances = typeof chances === "string" ? JSON.parse(chances) : chances ?? {};
    const parsedSlotChances = typeof slotChances === "string" ? JSON.parse(slotChances) : slotChances ?? {};
    const config = await prisma.gachaConfig.upsert({
      where: { id: "gacha" },
      update: { freeTickets: Number(freeTickets) || 3, ticketCost: BigInt(Number(ticketCost) || 0), chances: parsedChances, slotChances: parsedSlotChances, active: active !== false },
      create: { id: "gacha", freeTickets: Number(freeTickets) || 3, ticketCost: BigInt(Number(ticketCost) || 0), chances: parsedChances, slotChances: parsedSlotChances, active: active !== false },
    });
    return { ...config, ticketCost: Number(config.ticketCost) };
  });

  // ===== ENCHANTMENTS =====

  typedFastify.get("/api/admin/enchantments", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.enchantment.findMany({ orderBy: { name: "asc" } });
  });

  typedFastify.post("/api/admin/enchantments", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.enchantment.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.put("/api/admin/enchantments/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const updated = await prisma.enchantment.update({ where: { id: request.params.id }, data: request.body });
    return updated;
  });

  typedFastify.delete("/api/admin/enchantments/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    await prisma.enchantment.delete({ where: { id: request.params.id } });
    return { message: "Enchantment deleted" };
  });

  // ===== WORLD BOSS PARTICIPATION =====

  typedFastify.get("/api/admin/worldbosses/:id/participations", { preHandler: [fastify.requireAdmin] }, async (request) => {
    return prisma.worldBossParticipation.findMany({
      where: { worldBossId: request.params.id },
      include: { character: { select: { id: true, name: true, userId: true } } },
      orderBy: { damageDealt: "desc" },
    });
  });

  // ===== SEASONS =====

  typedFastify.get("/api/admin/seasons", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.season.findMany({ include: { tiers: true, _count: { select: { passes: true } } }, orderBy: { createdAt: "desc" } });
  });

  typedFastify.post("/api/admin/seasons", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.season.create({ data: request.body });
    return reply.code(201).send(created);
  });

  typedFastify.put("/api/admin/seasons/:id", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const updated = await prisma.season.update({ where: { id: request.params.id }, data: request.body });
    return updated;
  });

  // ===== ACHIEVEMENTS =====

  typedFastify.get("/api/admin/achievements", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.achievement.findMany({ orderBy: { name: "asc" } });
  });

  typedFastify.post("/api/admin/achievements", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const created = await prisma.achievement.create({ data: request.body });
    return reply.code(201).send(created);
  });

  // ===== PATCH NOTES =====

  typedFastify.get("/api/admin/patch-notes", { preHandler: [fastify.requireAdmin] }, async () => {
    return prisma.patchNote.findMany({ orderBy: { createdAt: "desc" } });
  });

  typedFastify.post("/api/admin/patch-notes", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const { title, content, version, isActive } = request.body;
    if (!title || !content) return reply.code(400).send({ error: "title e content são obrigatórios" });
    const created = await prisma.patchNote.create({ data: { title, content, version: version || null, isActive: isActive !== false } });
    return reply.code(201).send(created);
  });

  // ===== AI MASTER =====

  typedFastify.get("/api/admin/ai/master/status", { preHandler: [fastify.requireAdmin] }, async () => {
    const state = await prisma.aiMasterState.findUnique({ where: { id: "master" } });
    return state;
  });

  typedFastify.post("/api/admin/ai/master/start", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const state = await prisma.aiMasterState.upsert({
      where: { id: "master" },
      create: { isRunning: true, startedAt: new Date() },
      update: { isRunning: true, startedAt: new Date() },
    });
    return { message: "AI Master iniciado", status: state.isRunning };
  });

  typedFastify.post("/api/admin/ai/master/pause", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const state = await prisma.aiMasterState.update({ where: { id: "master" }, data: { isRunning: false } });
    return { message: "Pausado", status: state.isRunning };
  });

  typedFastify.post("/api/admin/ai/master/stop", { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    const state = await prisma.aiMasterState.update({ where: { id: "master" }, data: { isRunning: false } });
    return { message: "Parado", status: state.isRunning };
  });
}