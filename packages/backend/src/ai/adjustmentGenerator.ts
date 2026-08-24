// ===== ADJUSTMENT GENERATOR (BALANCE) =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "./hfProviders";

export interface AdjustmentPlan {
  items: any[];
  quests: any[];
  maps: any[];
  monsters: any[];
  skills: any[];
  classes: any[];
  economy: any;
  errors: string[];
}

const ITEM_FIELDS = ["name", "description", "rarity", "level", "buyPrice", "sellPrice", "attackSpeedMs", "dps", "strength", "intellect", "endurance", "dexterity", "wisdom", "luck", "boostType", "boostValue", "isActive"];
const QUEST_FIELDS = ["title", "description", "type", "difficulty", "requiredLevel", "objectives", "rewards", "isRepeatable", "cooldownHours", "isActive"];
const MAP_FIELDS = ["name", "description", "requiredLevel", "region", "isActive", "type", "raidDifficulty", "raidWaves"];

export async function generateItemAdjustments(prompt: string, providerLog: string[]): Promise<AdjustmentPlan> {
  const fullPrompt = `${buildItemAdjustmentPrompt(prompt)}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;
  const response = await callHFProviders(fullPrompt);
  providerLog.push("Ajustes de itens gerados via IA");
  return JSON.parse(response);
}

export async function generateQuestAdjustments(prompt: string, providerLog: string[]): Promise<AdjustmentPlan> {
  const fullPrompt = `${buildQuestAdjustmentPrompt(prompt)}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;
  const response = await callHFProviders(fullPrompt);
  providerLog.push("Ajustes de quests gerados via IA");
  return JSON.parse(response);
}

export async function generateMapAdjustments(prompt: string, providerLog: string[]): Promise<AdjustmentPlan> {
  const fullPrompt = `${buildMapAdjustmentPrompt(prompt)}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;
  const response = await callHFProviders(fullPrompt);
  providerLog.push("Ajustes de mapas gerados via IA");
  return JSON.parse(response);
}

export async function applyAdjustments(adjustments: AdjustmentPlan, prisma: PrismaClient): Promise<any> {
  const results = { items: 0, quests: 0, maps: 0, monsters: 0, skills: 0, classes: 0, errors: [] as string[] };

  // Items
  for (const item of adjustments.items) {
    try {
      if (item.id) {
        await prisma.item.update({ where: { id: item.id }, data: item });
      } else if (item.name) {
        await prisma.item.upsert({ where: { name: item.name }, update: item, create: item });
      }
      results.items++;
    } catch (e: any) { results.errors.push(`Item ${item.name || item.id}: ${e.message}`); }
  }

  // Quests
  for (const quest of adjustments.quests) {
    try {
      if (quest.id) {
        await prisma.quest.update({ where: { id: quest.id }, data: quest });
      } else if (quest.slug) {
        await prisma.quest.upsert({ where: { slug: quest.slug }, update: quest, create: quest });
      }
      results.quests++;
    } catch (e: any) { results.errors.push(`Quest ${quest.title || quest.id}: ${e.message}`); }
  }

  // Maps
  for (const map of adjustments.maps) {
    try {
      if (map.id) {
        await prisma.map.update({ where: { id: map.id }, data: map });
      } else if (map.slug) {
        await prisma.map.upsert({ where: { slug: map.slug }, update: map, create: map });
      }
      results.maps++;
    } catch (e: any) { results.errors.push(`Map ${map.name || map.id}: ${e.message}`); }
  }

  // Monsters
  for (const m of adjustments.monsters) {
    try {
      if (m.id) {
        await prisma.monster.update({ where: { id: m.id }, data: m });
      } else if (m.name) {
        await prisma.monster.upsert({ where: { name: m.name }, update: m, create: m });
      }
      results.monsters++;
    } catch (e: any) { results.errors.push(`Monster ${m.name || m.id}: ${e.message}`); }
  }

  return results;
}

function buildItemAdjustmentPrompt(prompt: string): string {
  return `Você é o Balance Designer do RPG "Story Life". Analise e proponha ajustes de itens.

PEDIDO: ${prompt}

Responda APENAS com JSON:

{
  "items": [
    { "id": "uuid", "name": "Nome", "rarity": "rare", "level": 10, "strength": 15, "dps": 25, "boostValue": 20, "buyPrice": 1000, "isActive": true }
  ],
  "quests": [],
  "maps": [],
  "monsters": [],
  "skills": [],
  "classes": [],
  "economy": { "inflationRisk": "low", "goldSinkNeeded": false }
}

CAMPOS PERMITIDOS:
Items: ${["name", "rarity", "level", "buyPrice", "sellPrice", "attackSpeedMs", "dps", "strength", "intellect", "endurance", "dexterity", "wisdom", "luck", "boostType", "boostValue", "isActive"].join(", ")}
Quests: title, difficulty, requiredLevel, rewards, objectives, isRepeatable, cooldownHours
Maps: name, requiredLevel, region, raidDifficulty, raidWaves
Monsters: hp, attack, defense, magic, magicDefense, speed, xpReward, goldReward
Classes: base stats, scaling, conversions`;
}

function buildQuestAdjustmentPrompt(prompt: string): string {
  return `Você é o Quest Designer. Analise e ajuste quests.

PEDIDO: ${prompt}

Responda JSON com quests ajustadas.`;
}

function buildMapAdjustmentPrompt(prompt: string): string {
  return `Você é o World Designer. Analise e ajuste mapas.

PEDIDO: ${prompt}

Responda JSON com mapas ajustados.`;
}
