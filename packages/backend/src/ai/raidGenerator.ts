// ===== RAID GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "../hfProviders";

export interface GeneratedRaid {
  map: any;
  monsters: any[];
  boss: any;
  errors: string[];
}

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPrompt(idea: string): string {
  return `Você é o designer de raids de um MMORPG brasileiro. Crie uma RAID baseada na ideia: "${idea}"

Responda APENAS com JSON válido:

{
  "map": {
    "name": "Nome do mapa da raid",
    "slug": "slug-unico",
    "description": "1 frase do cenário",
    "region": "Nome da região",
    "requiredLevel": 10,
    "type": "raid",
    "raidWaves": 10,
    "raidDifficulty": 2.5,
    "maxRaidAttempts": 3,
    "raidResetHours": 24,
    "pinLeft": 50,
    "pinTop": 50
  },
  "monsters": [
    {
      "name": "Nome do monstro da onda",
      "description": "Descrição",
      "level": 15,
      "isBoss": false,
      "element": "físico",
      "faction": "raid",
      "hp": 500,
      "mana": 100,
      "attack": 50,
      "defense": 30,
      "magic": 30,
      "magicDefense": 30,
      "speed": 15,
      "criticalChance": 5,
      "criticalDamage": 150,
      "dodge": 5,
      "accuracy": 95,
      "attackSpeed": 1800,
      "xpReward": 500,
      "goldReward": 200,
      "skills": [
        { "name": "Golpe Brutal", "kind": "attack", "trigger": "active", "target": "enemy", "cooldown": 10000, "manaCost": 0, "actions": [{ "action": "damage", "amount": 30 }] }
      ]
    }
  ],
  "boss": {
    "name": "Nome do Boss Final",
    "description": "Boss épico da raid",
    "level": 25,
    "isBoss": true,
    "isElite": true,
    "element": "dark",
    "faction": "raid_boss",
    "hp": 50000,
    "mana": 5000,
    "attack": 300,
    "defense": 150,
    "magic": 200,
    "magicDefense": 150,
    "speed": 20,
    "criticalChance": 10,
    "criticalDamage": 200,
    "dodge": 10,
    "accuracy": 100,
    "attackSpeed": 1500,
    "xpReward": 10000,
    "goldReward": 5000,
    "skills": [
      { "name": "Ira do Abismo", "kind": "attack", "trigger": "active", "target": "all_enemies", "cooldown": 20000, "manaCost": 100, "actions": [{ "action": "damage", "amount": 100 }] },
      { "name": "Escudo das Trevas", "kind": "buff", "trigger": "on_low_hp", "target": "self", "cooldown": 60000, "manaCost": 50, "actions": [{ "action": "shield", "amount": 5000 }] }
    ]
  }
}

REGRAS:
- Mapa tipo "raid" com configurações apropriadas
- 4-8 monstros das ondas (isBoss: false, progressivamente mais fortes)
- EXATAMENTE 1 boss (isBoss: true, HP 10-50x, attack 5-10x, drops raros)
- Boss tem skills épicas (ulti, shield, transform, etc)
- Monstros das ondas: level apropriado, HP/attack escalando
- Boss: HP 10-50x normal, attack 5-10x, skills épicas`};
}

export function normalize(raw: any): any {
  return raw;
}

export async function persistGeneratedRaid(gen: any, prisma: PrismaClient) {
  // Create map
  const map = await prisma.map.create({ data: gen.map });

  // Create monsters
  for (const m of gen.monsters) {
    const monster = await prisma.monster.create({ data: m });
    await prisma.mapMonster.create({
      data: { mapId: map.id, monsterId: monster.id, spawnX: 50, spawnY: 50, respawnTime: 60, maxCount: 1 },
    });
  }

  // Create boss
  const boss = await prisma.monster.create({ data: gen.boss });
  await prisma.mapMonster.create({
    data: { mapId: map.id, monsterId: boss.id, spawnX: 50, spawnY: 50, respawnTime: 300, maxCount: 1, isBoss: true },
  });

  // Create raid config
  await prisma.raidConfig.create({
    data: { mapId: map.id, maxWaves: gen.map.raidWaves || 10, difficulty: gen.map.raidDifficulty || 2.5 },
  });

  return { map, boss, monsterCount: gen.monsters.length };
}

export async function generateRaid(idea: string, providerLog: string[]) {
  const prompt = buildPrompt(idea);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;

  const response = await callHFProviders(fullPrompt);
  providerLog.push(`Raid gerada via IA`);
  return JSON.parse(response);
}

function buildPrompt(idea: string): string {
  return `Você é o designer de raids de um MMORPG brasileiro. Crie uma RAID baseada na ideia: "${idea}"

Responda APENAS com JSON válido:

{
  "map": {
    "name": "Nome do mapa da raid",
    "slug": "slug-unico",
    "description": "1 frase do cenário",
    "region": "Nome da região",
    "requiredLevel": 10,
    "type": "raid",
    "raidWaves": 10,
    "raidDifficulty": 2.5,
    "maxRaidAttempts": 3,
    "raidResetHours": 24,
    "pinLeft": 50,
    "pinTop": 50
  },
  "monsters": [
    {
      "name": "Nome do monstro da onda",
      "description": "Descrição",
      "level": 15,
      "isBoss": false,
      "element": "físico",
      "faction": "raid",
      "hp": 500,
      "mana": 100,
      "attack": 50,
      "defense": 30,
      "magic": 30,
      "magicDefense": 30,
      "speed": 15,
      "criticalChance": 5,
      "criticalDamage": 150,
      "dodge": 5,
      "accuracy": 95,
      "attackSpeed": 1800,
      "xpReward": 500,
      "goldReward": 200,
      "skills": [
        { "name": "Golpe Brutal", "kind": "attack", "trigger": "active", "target": "enemy", "cooldown": 10000, "manaCost": 0, "actions": [{ "action": "damage", "amount": 30 }] }
      ]
    }
  ],
  "boss": {
    "name": "Nome do Boss Final",
    "description": "Boss épico da raid",
    "level": 25,
    "isBoss": true,
    "isElite": true,
    "element": "dark",
    "faction": "raid_boss",
    "hp": 50000,
    "mana": 5000,
    "attack": 300,
    "defense": 150,
    "magic": 200,
    "magicDefense": 150,
    "speed": 20,
    "criticalChance": 10,
    "criticalDamage": 200,
    "dodge": 10,
    "accuracy": 100,
    "attackSpeed": 1500,
    "xpReward": 10000,
    "goldReward": 5000,
    "skills": [
      { "name": "Ira do Abismo", "kind": "attack", "trigger": "active", "target": "all_enemies", "cooldown": 20000, "manaCost": 100, "actions": [{ "action": "damage", "amount": 100 }] },
      { "name": "Escudo das Trevas", "kind": "buff", "trigger": "on_low_hp", "target": "self", "cooldown": 60000, "manaCost": 50, "actions": [{ "action": "shield", "amount": 5000 }] }
    ]
  }
}`;
}