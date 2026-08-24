// ===== QUEST GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "./hfProviders";

export interface GeneratedQuests {
  quests: any[];
  errors: string[];
}

const VALID_QUEST_TYPES = ["main", "side", "event", "daily", "weekly", "guild", "craft", "exploration"];
const QUEST_OBJECTIVE_TYPES = ["kill", "collect", "talk", "visit", "craft", "equip", "level_up", "guild_contribute"];

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function buildPrompt(idea: string, hints: any): string {
  return `Você é o designer de quests de um MMORPG brasileiro. Crie quests baseadas na ideia: "${idea}"

Maps disponíveis: ${hints.mapsHint}
Monstros disponíveis: ${hints.monstersHint}
NPCs disponíveis: ${hints.npcsHint}
Itens disponíveis: ${hints.itemsHint}
Encantamentos: ${hints.enchantmentsHint}

Responda APENAS com JSON válido:

{
  "quests": [
    {
      "title": "Título da quest (curto, marcante)",
      "slug": "slug-unico",
      "description": "2-3 frases da história/objetivo",
      "type": "main|side|event|daily|weekly|guild|craft|exploration",
      "difficulty": "easy|medium|hard|expert",
      "requiredLevel": 1,
      "objectives": [
        {
          "type": "kill|collect|talk|visit|craft|equip|level_up|guild_contribute",
          "target": "nome do monstro|item|NPC|mapa",
          "amount": 1,
          "mapId": "uuid-do-mapa-ou-null"
        }
      ],
      "rewards": {
        "xp": 100,
        "gold": 50,
        "items": [{ "itemName": "Nome do item", "quantity": 1 }],
        "classXp": 0
      },
      "giverNpcId": "uuid-do-npc-ou-null",
      "mapId": "uuid-do-mapa-ou-null",
      "isRepeatable": false,
      "cooldownHours": 0,
      "maxCompletions": 1,
      "prerequisiteQuestIds": [],
      "isActive": true
    }
  ]
}

REGRAS:
- 3-8 quests por região
- Tipos: main (história principal), side (secundária), event (evento), daily (diária), weekly (semanal), guild (guilda), craft (craft), exploration (exploração)
- Objectives: kill (matar), collect (coletar), talk (falar), visit (visitar), craft (criar), equip (equipar), level_up (upar), guild_contribute (doar para guilda)
- Rewards: xp, gold, items (por nome), classXp
- giverNpcId: NPC que dá a quest
- mapId: mapa onde a quest acontece
- isRepeatable: se pode repetir
- cooldownHours: cooldown para repetir
- maxCompletions: max vezes que pode completar
- prerequisiteQuestIds: quests que devem ser completadas antes
- Quest chains: quest A desbloqueia quest B`;
}

export function normalize(raw: any): { quests: any[]; errors: string[] } {
  const quests: any[] = (Array.isArray(raw?.quests) ? raw.quests : []).slice(0, 8).map((q: any) => {
    const type = VALID_QUEST_TYPES.includes(q?.type) ? q.type : "side";
    const difficulty = ["easy", "medium", "hard", "expert"].includes(q?.difficulty) ? q.difficulty : "medium";

    return {
      title: q?.title || "Quest",
      slug: slugify(q?.slug || q?.title || "quest"),
      description: q?.description || "",
      type,
      difficulty,
      requiredLevel: Math.max(1, Math.min(100, Math.round(num(q?.requiredLevel, 1)))),
      objectives: Array.isArray(q?.objectives) ? q.objectives.slice(0, 5).map((o: any) => {
        const objType = QUEST_OBJECTIVE_TYPES.includes(o?.type) ? o.type : "kill";
        return {
          type: objType,
          target: o?.target || "Alvo",
          amount: Math.max(1, Math.round(num(o?.amount, 1))),
          mapId: o?.mapId || null,
        };
      }) : [],
      rewards: {
        xp: Math.max(0, Math.round(num(q?.rewards?.xp, 100))),
        gold: Math.max(0, Math.round(num(q?.rewards?.gold, 50))),
        items: Array.isArray(q?.rewards?.items) ? q.rewards.items.slice(0, 3).map((i: any) => ({
          itemName: i?.itemName || "Item",
          quantity: Math.max(1, Math.round(num(i?.quantity, 1))),
        })) : [],
        classXp: Math.max(0, Math.round(num(q?.rewards?.classXp, 0))),
      },
      giverNpcId: q?.giverNpcId || null,
      mapId: q?.mapId || null,
      isRepeatable: !!q?.isRepeatable,
      cooldownHours: Math.max(0, Math.round(num(q?.cooldownHours, 0))),
      maxCompletions: Math.max(1, Math.round(num(q?.maxCompletions, 1))),
      prerequisiteQuestIds: Array.isArray(q?.prerequisiteQuestIds) ? q.prerequisiteQuestIds : [],
      isActive: q?.isActive !== false,
    };
  });

  const errors: string[] = [];
  if (quests.length === 0) errors.push("Nenhuma quest criada");
  return { quests, errors };
}

export async function persistGeneratedQuests(gen: any, prisma: PrismaClient) {
  const results = [];
  for (const q of gen.quests) {
    const existing = await prisma.quest.findUnique({ where: { slug: q.slug } });
    if (existing) {
      results.push(await prisma.quest.update({ where: { id: existing.id }, data: q }));
    } else {
      results.push(await prisma.quest.create({ data: q }));
    }
  }
  return { count: results.length, quests: results };
}

export async function generateQuests(idea: string, providerLog: string[], hints: any) {
  const prompt = buildPrompt(idea, hints);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;

  const response = await callHFProviders(fullPrompt);
  providerLog.push(`Quests geradas via IA`);
  return JSON.parse(response);
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
