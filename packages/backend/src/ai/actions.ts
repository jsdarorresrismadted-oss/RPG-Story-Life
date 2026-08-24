// ===== AI MASTER ACTIONS EXECUTION =====

import { PrismaClient } from "@prisma/client";
import { Server as SocketIOServer } from "socket.io";
import { callHFProviders } from "./hfProviders";

export async function executeAiAction(action: any, prisma: PrismaClient, io?: SocketIOServer): Promise<any> {
  const { action: act, ...params } = action;

  switch (act) {
    case "create_lore":
      return executeCreateLore(prisma, params);

    case "create_content":
      return executeCreateContent(prisma, params, io);

    case "delete":
      return executeDelete(prisma, params);

    case "delete_one":
      return executeDeleteOne(prisma, params);

    case "list":
      return executeList(prisma, params);

    case "analyze_and_plan":
      return { analyzed: true, message: "Analysis complete" };

    default:
      return { error: `Unknown action: ${act}` };
  }
}

async function executeCreateLore(prisma: PrismaClient, params: { lore: string }) {
  await prisma.aiMasterState.update({
    where: { id: "master" },
    data: { lore: params.lore },
  });
  return { loreUpdated: true, length: params.lore.length };
}

async function executeCreateContent(prisma: PrismaClient, params: { type: string; description: string }, io?: SocketIOServer) {
  const { type, description } = params;
  const providerLog: string[] = [];

  try {
    switch (type) {
      case "map": {
        const { generateMap } = await import("./mapGenerator");
        const gen = await generateMap(description, providerLog);
        const saved = await import("./mapGenerator").then(m => m.persistGeneratedMap(gen));
        return { created: "map", name: saved?.name, id: saved?.id };
      }

      case "monster": {
        const { generateMonster } = await import("./monsterGenerator");
        const gen = await generateMonster(description, providerLog);
        const saved = await import("./monsterGenerator").then(m => m.persistGeneratedMonster(gen));
        return { created: "monster", count: saved?.count || 1 };
      }

      case "npc": {
        const { generateNpcs } = await import("./npcGenerator");
        const gen = await generateNpcs(description, providerLog);
        const saved = await import("./npcGenerator").then(m => m.persistGeneratedNpcs(gen, {}));
        return { created: "npc", count: saved?.count || 1 };
      }

      case "quest": {
        const { generateQuests } = await import("./questGenerator");
        const gen = await generateQuests(description, providerLog);
        const saved = await import("./questGenerator").then(m => m.persistGeneratedQuests(gen));
        return { created: "quest", count: saved?.length || 1 };
      }

      case "item": {
        // Items are created via map/monster/quest generation
        return { created: "item", note: "Items created via other generators" };
      }

      case "craft": {
        // Craft recipes created via quest/item generation
        return { created: "craft", note: "Crafts created via other generators" };
      }

      case "boss": {
        const { generateMonster } = await import("./monsterGenerator");
        const gen = await generateMonster(`${description} (BOSS, nivel alto, HP 10x, drops raros)`, []);
        const saved = await import("./monsterGenerator").then(m => m.persistGeneratedMonster(gen));
        return { created: "boss", count: saved?.count || 1 };
      }

      case "set": {
        // Set effects created via admin or special events
        return { created: "set", note: "Sets created via admin panel" };
      }

      case "event": {
        const { generateEvent } = await import("./eventGenerator");
        const gen = await import("./eventGenerator").then(m => m.generateEvent(description, []));
        const saved = await import("./eventGenerator").then(m => m.persistGeneratedEvent(gen));
        return { created: "event", name: saved?.event?.name };
      }

      default:
        return { error: `Unknown content type: ${type}` };
    }
  } catch (err: any) {
    return { error: err.message };
  }
}

async function executeDelete(prisma: PrismaClient, params: { target: string; filter: string }) {
  const { target, filter } = params;

  const tableMap: Record<string, any> = {
    maps: prisma.map,
    monsters: prisma.monster,
    npcs: prisma.npc,
    quests: prisma.quest,
    items: prisma.item,
    crafts: prisma.craftRecipe,
    events: prisma.gameEvent,
    guilds: prisma.guild,
    worldBosses: prisma.worldBoss,
    shopItems: prisma.shopItem,
    eventShopItems: prisma.eventShopItem,
  };

  const table = tableMap[params.target];
  if (!table) return { error: `Target desconhecido: ${params.target}` };

  const protectedNames = [
    "Adaga de Iniciante", "Cajado de Iniciante", "Espada de Iniciante",
    "Armadura de Iniciante", "Capacete de Iniciante", "Capa de Iniciante",
    "Lança de Iniciante", "Martelo de Iniciante", "Poção de Vida", "Poção de Mana",
  ];

  if (params.target === "items" && params.filter === "all") {
    const deleted = await prisma.item.deleteMany({
      where: { name: { notIn: protectedNames } },
    });
    return { deleted: deleted.count, message: `${deleted.count} itens deletados (iniciantes preservados)` };
  }

  if (params.target === "enchantments") {
    return { error: "Encantamentos são protegidos" };
  }

  if (params.filter === "all") {
    const deleted = await table.deleteMany({});
    return { deleted: deleted.count };
  }

  return { error: "Ação de delete incompleta" };
}

async function executeDeleteOne(prisma: PrismaClient, params: { target: string; name: string }) {
  const { target, name } = params;

  const tableMap: Record<string, any> = {
    maps: prisma.map,
    monsters: prisma.monster,
    npcs: prisma.npc,
    quests: prisma.quest,
    items: prisma.item,
    crafts: prisma.craftRecipe,
    events: prisma.gameEvent,
    guilds: prisma.guild,
    worldBosses: prisma.worldBoss,
    shopItems: prisma.shopItem,
    eventShopItems: prisma.eventShopItem,
  };

  const table = tableMap[params.target];
  if (!table) return { error: `Target desconhecido: ${params.target}` };

  const item = await table.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
  if (!item) return { error: `Não encontrei "${name}" em ${params.target}` };

  await table.delete({ where: { id: item.id } });
  return { deleted: 1, name: item.name };
}

async function executeList(prisma: PrismaClient, params: { target: string }) {
  const tableMap: Record<string, any> = {
    maps: prisma.map,
    monsters: prisma.monster,
    npcs: prisma.npc,
    quests: prisma.quest,
    items: prisma.item,
    crafts: prisma.craftRecipe,
    events: prisma.gameEvent,
    guilds: prisma.guild,
    shopItems: prisma.shopItem,
    eventShopItems: prisma.eventShopItem,
    worldBosses: prisma.worldBoss,
  };

  const table = tableMap[params.target];
  if (!table) return { error: `Target desconhecido: ${params.target}` };

  const items = await table.findMany({ select: { id: true, name: true } });
  return { count: items.length, items };
}
