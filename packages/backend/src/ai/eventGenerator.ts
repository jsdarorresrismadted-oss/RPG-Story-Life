// ===== EVENT GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "../hfProviders";

export interface GeneratedEvent {
  event: any;
  items: any[];
  monsters: any[];
  quests: any[];
  crafts: any[];
  shop: any[];
  withBoost: string[];
  craftableClasses: string[];
  errors: string[];
}

const ITEM_TYPES = ["weapon", "class", "helm", "armor", "cape", "ring", "necklace", "consumable"];
const RARITIES = ["common", "uncommon", "rare", "epic", "mythic", "limited"];
const BOOST_TYPES = ["defense", "damage", "dropChance", "xp", "gold", "classXp"];

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPrompt(idea: string): string {
  return `Você é o designer de eventos de um MMORPG brasileiro. Crie um EVENTO TEMPORÁRIO baseado na ideia: "${idea}"

Responda APENAS com JSON válido:

{
  "event": {
    "name": "Nome do evento (curto, marcante)",
    "slug": "slug-unico",
    "description": "2-3 frases da lore/mecânica",
    "type": "raid",
    "levelMin": 1,
    "levelMax": 20,
    "xpBonus": 0,
    "goldBonus": 0,
    "dropBonus": 0,
    "durationDays": 7
  },
  "raid": {
    "mapName": "Nome do mapa do raid",
    "mapSlug": "slug-unico",
    "mapDescription": "1 frase do cenário",
    "region": "Nome da região",
    "requiredLevel": 1,
    "raidWaves": 10,
    "raidDifficulty": 2,
    "maxRaidAttempts": 3,
    "raidResetHours": 24,
    "pinLeft": 50,
    "pinTop": 50
  },
  "monsters": [
    {
      "name": "...", "description": "...", "level": 1, "isBoss": false,
      "element": "físico", "faction": "evento",
      "hp": 50, "mana": 20, "attack": 10, "defense": 5, "magic": 5, "magicDefense": 5,
      "speed": 10, "criticalChance": 2, "criticalDamage": 150, "dodge": 1, "accuracy": 90,
      "attackSpeed": 2000, "xpReward": 0, "goldReward": 0,
      "skills": [{ "name": "...", "kind": "attack", "trigger": "active", "target": "enemy", "cooldown": 8000, "manaCost": 0, "actions": [{ "action": "damage", "amount": 15 }] }]
    }
  ],
  "items": [
    {
      "name": "...", "description": "...", "type": "weapon", "subtype": "sword",
      "rarity": "rare", "level": 5, "icon": null,
      "strength": 10, "intellect": 0, "endurance": 0, "dexterity": 0, "wisdom": 0, "luck": 0,
      "boostType": null, "boostValue": 0,
      "attackSpeedMs": 1800, "dps": 15,
      "effects": null, "buyPrice": 500, "sellPrice": 100
    }
  ],
  "crafts": [
    {
      "name": "Receita do Item",
      "resultItem": "NOME do item (da lista items OU item já existente)",
      "ingredients": [{ "itemName": "Nome do material", "quantity": 1 }],
      "resultClass": null,
      "goldCost": 0
    }
  ],
  "quests": [
    {
      "title": "Título", "description": "Desc", "type": "main",
      "difficulty": "medium", "requiredLevel": 1,
      "objectives": [{ "type": "kill", "target": "Nome do monstro", "amount": 1 }],
      "xpReward": 100, "goldReward": 50,
      "itemRewards": [{ "itemName": "Item", "quantity": 1 }],
      "giverNpc": "Nome do NPC", "map": "Nome do mapa",
      "isRepeatable": false
    }
  ],
  "shop": [
    { "itemName": "Nome do item", "price": 100, "stock": -1, "requiredLevel": 1 }
  ],
  "withBoost": ["nome do item com boost"],
  "craftableClasses": ["nome da classe existente"]
}

REGRAS:
- 4-8 monstros, EXATAMENTE 1 boss (isBoss: true, HP/attack ~2x)
- Itens: 4-12, variar tipos, raridades common/uncommon/rare/epic/mythic/limited
- Limited = raridade exclusiva de evento (boosters 100-250%)
- Boost: só ALGUNS itens (máx 2 - tipicamente 1 arma + 1 armadura) com boostType/boostValue
- Crafts: ingredientes por NOME (podem ser materiais novos OU itens existentes)
- Quests: 1-5, objetivos só "kill" de monstros DO EVENTO
- Shop: 3-10 ofertas, preços em ouro
- craftableClasses: referenciar classes EXISTENTES apenas
- Tudo em pt-BR, nomes coesos com tema`};
}

export function normalize(raw: any): GeneratedEvent {
  // Simplified normalization - in production would be more robust
  return raw as GeneratedEvent;
}

export async function persistGeneratedEvent(gen: GeneratedEvent, prisma: PrismaClient) {
  // Create event
  const event = await prisma.gameEvent.create({
    data: {
      ...gen.event,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  // Create items
  const itemIds = new Map<string, string>();
  for (const it of gen.items) {
    const item = await prisma.item.upsert({
      where: { name: it.name },
      update: it,
      create: { ...it, isActive: true, eventId: event.id },
    });
    itemIds.set(it.name, item.id);
  }

  // Create monsters
  for (const m of gen.monsters) {
    await prisma.monster.create({ data: { ...m, eventId: event.id } });
  }

  // Create quests
  for (const q of gen.quests) {
    await prisma.quest.create({ data: { ...q, eventId: event.id } });
  }

  // Create crafts
  for (const c of gen.crafts) {
    await prisma.craftRecipe.create({ data: { ...c, eventId: event.id } });
  }

  // Create event shop
  for (const s of gen.shop) {
    const item = itemIds.get(s.itemName) || (await prisma.item.findFirst({ where: { name: s.itemName } }));
    if (item) {
      await prisma.eventShopItem.create({
        data: { eventId: event.id, itemId: item.id, price: BigInt(s.price), currency: "gold" },
      });
    }
  }

  return { event, itemCount: gen.items.length, monsterCount: gen.monsters.length };
}

export async function generateEvent(idea: string, providerLog: string[]) {
  const prompt = buildPrompt(idea);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;

  const response = await callHFProviders(fullPrompt);
  providerLog.push(`Evento gerado via IA`);
  return JSON.parse(response);
}