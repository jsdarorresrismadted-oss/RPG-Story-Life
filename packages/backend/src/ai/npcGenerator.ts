// ===== NPC GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "./hfProviders";

export interface GeneratedNPCs {
  npcs: any[];
  errors: string[];
}

const VALID_NPC_TYPES = ["vendor", "shop", "enchantments", "classes", "quest_giver", "quest", "dialogue", "travel", "guild"];

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPrompt(idea: string, mapsHint: string, itemsHint: string, enchantmentsHint: string): string {
  return `Você é o designer de NPCs de um MMORPG brasileiro. Crie NPCs baseados na ideia: "${idea}"

Maps disponíveis: ${mapsHint}
Itens disponíveis: ${itemsHint}
Encantamentos disponíveis: ${enchantmentsHint}

Responda APENAS com JSON válido:

{
  "npcs": [
    {
      "name": "Nome único do NPC",
      "description": "1-2 frases sobre quem é e o que faz",
      "type": "vendor|shop|enchantments|classes|quest_giver|quest|dialogue|travel|guild",
      "mapId": "uuid-do-mapa-ou-null",
      "isActive": true,
      "sortOrder": 0,
      "actions": [
        {
          "type": "shop|quest|dialogue|travel|craft|enchant|guild|custom",
          "label": "Texto do botão (ex: 'Loja', 'Quests', 'Encantar')",
          "icon": "ícone-opcional",
          "order": 0,
          "requirements": null,
          "target": "shop_id|quest_id|map_id|null",
          "isActive": true
        }
      ]
    }
  ]
}

REGRAS:
- 2-6 NPCs por região
- Tipos válidos: vendor, shop, enchantments, classes, quest_giver, quest, dialogue, travel, guild
- Um NPC pode ter múltiplas ações (shop + quest + dialogue)
- actions[].target: UUID da shop, quest, mapa, ou null
- mapId: UUID do mapa onde o NPC fica, ou null se for global`;
}

export function normalize(raw: any): { npcs: any[]; errors: string[] } {
  const npcs: any[] = (Array.isArray(raw?.npcs) ? raw.npcs : []).slice(0, 6).map((n: any) => {
    const type = VALID_NPC_TYPES.includes(n?.type) ? n.type : "vendor";
    return {
      name: n?.name || "NPC",
      description: n?.description || "",
      type,
      mapId: n?.mapId || null,
      isActive: n?.isActive !== false,
      sortOrder: Math.max(0, Math.round(n?.sortOrder || 0)),
      actions: Array.isArray(n?.actions) ? n.actions.slice(0, 5).map((a: any, i: number) => ({
        type: a?.type || "custom",
        label: a?.label || "Ação",
        icon: a?.icon || null,
        order: Math.max(0, Math.round(a?.order || i)),
        requirements: a?.requirements ? JSON.stringify(a.requirements) : null,
        target: a?.target || null,
        isActive: a?.isActive !== false,
      })) : [],
    };
  });

  const errors: string[] = [];
  if (npcs.length === 0) errors.push("Nenhum NPC criado");
  return { npcs, errors };
}

export async function persistGeneratedNpcs(gen: any, context: { mapId?: string }, prisma: PrismaClient) {
  const results = [];
  for (const npc of gen.npcs) {
    const existing = await prisma.npc.findFirst({ where: { name: npc.name } });
    let savedNpc;
    if (existing) {
      savedNpc = await prisma.npc.update({ where: { id: existing.id }, data: npc });
    } else {
      savedNpc = await prisma.npc.create({
        data: { ...npc, mapId: npc.mapId || context.mapId },
      });
    }

    if (npc.actions && npc.actions.length > 0) {
      await prisma.npcAction.deleteMany({ where: { npcId: savedNpc.id } });
      for (const [i, action] of npc.actions.entries()) {
        await prisma.npcAction.create({
          data: { ...action, npcId: savedNpc.id, order: i },
        });
      }
    }
    results.push(savedNpc);
  }
  return { count: results.length, npcs: results };
}

export async function generateNpcs(idea: string, providerLog: string[], mapsHint: string, itemsHint: string, enchantmentsHint: string) {
  const { callHFProviders } = await import("./hfProviders");

  const prompt = buildPrompt(idea, mapsHint, itemsHint, enchantmentsHint);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;

  const response = await callHFProviders(fullPrompt);
  providerLog.push(`NPCs gerados via IA`);
  return JSON.parse(response);
}
