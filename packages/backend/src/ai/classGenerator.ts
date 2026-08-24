// ===== CLASS GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "./hfProviders";

export interface GeneratedClass {
  cls: any;
  sm: any;
  skills: any[];
  passives: any[];
  effects: any[];
  preview: Record<string, number>;
  errors?: string[];
}

const CATEGORY_TEMPLATES: Record<string, any> = {
  tank: {
    base: { hp: 140, mana: 60, magic: 4, speed: 5, attack: 14, defense: 16, magicDefense: 12 },
    scaling: { aggroPerHit: 30, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 25, manaRegenPerTick: 4, critChancePerSpeed: 0.5, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.5 },
      { stat: "endurance", target: "hp", factor: 12 },
      { stat: "endurance", target: "defense", factor: 0.8 },
      { stat: "dexterity", target: "hitChance", factor: 0.3 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 2, critMultiplier: 150, evasion: 1, cooldownReduction: 0 },
    bonuses: { damageResistance: 10, physicalResistance: 15, magicalResistance: 10, threatPerAttack: 25 },
  },
  caster: {
    base: { hp: 90, mana: 130, magic: 20, speed: 6, attack: 6, defense: 8, magicDefense: 12 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 10, manaRegenPerTick: 12, critChancePerSpeed: 0.5, healthRegenPerTick: 1, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "intellect", target: "spellPower", factor: 1.5 },
      { stat: "wisdom", target: "mana", factor: 8 },
      { stat: "wisdom", target: "magicDefense", factor: 0.6 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 2, critMultiplier: 150, evasion: 1, cooldownReduction: 0 },
    bonuses: { damageResistance: 5, physicalResistance: 5, magicalResistance: 15, threatPerAttack: 10 },
  },
  dps: {
    base: { hp: 110, mana: 80, magic: 10, speed: 12, attack: 18, defense: 10, magicDefense: 10 },
    scaling: { aggroPerHit: 20, dodgePerSpeed: 0.3, critDamageBase: 150, threatPerAttack: 15, manaRegenPerTick: 6, critChancePerSpeed: 0.8, healthRegenPerTick: 1, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.5 },
      { stat: "dexterity", target: "critChance", factor: 0.5 },
      { stat: "dexterity", target: "hitChance", factor: 0.4 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 5, critMultiplier: 150, evasion: 5, cooldownReduction: 0 },
    bonuses: { damageResistance: 5, physicalResistance: 10, magicalResistance: 5, threatPerAttack: 15 },
  },
  support: {
    base: { hp: 100, mana: 150, magic: 15, speed: 8, attack: 8, defense: 10, magicDefense: 14 },
    scaling: { aggroPerHit: 5, dodgePerSpeed: 0.2, critDamageBase: 150, threatPerAttack: 5, manaRegenPerTick: 20, critChancePerSpeed: 0.3, healthRegenPerTick: 5, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "wisdom", target: "mana", factor: 10 },
      { stat: "intellect", target: "spellPower", factor: 1.2 },
      { stat: "wisdom", target: "magicDefense", factor: 0.8 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 3, critMultiplier: 150, evasion: 3, cooldownReduction: 10 },
    bonuses: { damageResistance: 5, physicalResistance: 5, magicalResistance: 10, threatPerAttack: 5 },
  },
};

export interface GeneratedClass {
  cls: any;
  sm: any;
  skills: any[];
  passives: any[];
  effects: any[];
  preview: Record<string, number>;
  errors?: string[];
}

export function buildPrompt(idea: string): string {
  return `Você é o designer de classes de um MMORPG brasileiro. Crie uma CLASSE baseada na ideia: "${idea}"

Responda APENAS com JSON válido:

{
  "cls": {
    "name": "Nome da classe (ex: Cavaleiro Negro)",
    "slug": "slug-unico",
    "description": "2-3 frases do lore/estilo de jogo",
    "icon": null,
    "isStarter": false,
    "isVip": false,
    "isActive": true
  },
  "sm": {
    "category": "tank|caster|dps|support|hybrid",
    "base": { "hp": 100, "mana": 100, "magic": 10, "speed": 10, "attack": 10, "defense": 10, "magicDefense": 10 },
    "scaling": { "aggroPerHit": 10, "dodgePerSpeed": 0.2, "critDamageBase": 150, "threatPerAttack": 10, "manaRegenPerTick": 5, "critChancePerSpeed": 0.5, "healthRegenPerTick": 1, "spellPowerPerMagic": 1, "attackPowerPerAttack": 1 },
    "conversions": [
      { "stat": "strength", "target": "attackPower", "factor": 1.5 },
      { "stat": "intellect", "target": "spellPower", "factor": 1.5 }
    ],
    "combatStatsBase": { "hitChance": 100, "critChance": 5, "critMultiplier": 150, "evasion": 5, "cooldownReduction": 0 },
    "bonuses": { "damageResistance": 5, "physicalResistance": 5, "magicalResistance": 5 }
  },
  "skills": [
    {
      "name": "Nome da skill", "slug": "slug-unico",
      "description": "Descrição", "icon": null,
      "kind": "attack", "trigger": "active", "target": "enemy",
      "cooldown": 10000, "manaCost": 20, "levelRequired": 1, "rankRequired": 1,
      "actions": [{ "action": "damage", "amount": 20, "target": "enemy", "chance": 1 }]
    }
  ],
  "passives": [
    { "name": "Passiva", "slug": "slug", "description": "Desc", "rankRequired": 5, "effects": [] }
  ],
  "effects": [
    { "name": "Efeito", "slug": "slug", "description": "Desc", "type": "buff", "duration": 10, "magnitude": 10 }
  ]
}

REGRAS:
- Categoria: tank, caster, dps, support, hybrid
- NÃO crie sistemas novos, use templates acima como base
- Skills: 5-8 skills (1 por rank 1-5 + ult rank 10)
- Passivas: 3-5 (rank 5, 10, 15, 20, 25)
- Effects: 2-4 (buffs/debuffs/dots/hots)
- Balanceamento: compare com classes existentes`};
