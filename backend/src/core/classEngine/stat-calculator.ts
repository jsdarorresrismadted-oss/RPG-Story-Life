import { DerivedStats, PassiveDef } from "./types";
import { CORE_STAT_KEYS, CoreStats, sumCoreStats } from "../stats/coreStats";

// Bases mínimas da engine (floor): o resto vem dos Status Class via conversão fixa.
const BASE_STATS: DerivedStats = {
  level: 1,
  hp: 100,
  mana: 50,
  attack: 10,
  defense: 10,
  magic: 10,
  magicDefense: 10,
  speed: 10,
  attackPower: 0,
  spellPower: 0,
  hitChance: 85,
  critChance: 2,
  critDamage: 150,
  dodge: 3,
  attackSpeedMs: 2000,
  manaRegenPerTick: 5,
  healthRegenPerTick: 1,
  threatPerAttack: 1,
  aggroPerHit: 1,
  damagePercent: 0,
  physicalDamagePercent: 0,
  magicalDamagePercent: 0,
  damageResistance: 0,
  physicalResistance: 0,
  magicalResistance: 0,
  penetration: 0,
  healingPercent: 0,
  dotPercent: 0,
  overhealPercent: 0,
  manaCostReduction: 0,
  cooldownReduction: 0,
};

function num(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Lê um objeto JSON de stats tolerando chaves conhecidas: baseHp/hp, baseAttack/attack...
const KEY_ALIASES: Record<string, string[]> = {
  hp: ["baseHp", "hp", "maxHp"],
  mana: ["baseMana", "mana", "maxMana"],
  attack: ["baseAttack", "attack", "atk"],
  defense: ["baseDefense", "defense", "def"],
  magic: ["baseMagic", "magic", "magicAttack", "magicPower"],
  magicDefense: ["baseMagicDefense", "magicDefense", "magicResist"],
  speed: ["baseSpeed", "speed"],
  critChance: ["critChance", "critBonus"],
  dodge: ["dodge", "dodgeBonus"],
};

function pickFrom(record: Record<string, any>, target: string): number {
  for (const alias of KEY_ALIASES[target] || [target]) {
    const v = record[alias];
    if (v !== undefined && v !== null) return Number(v) || 0;
  }
  return 0;
}

// ===== Conversão OFICIAL e ÚNICA de Status Class → Combat Stats =====
// O criador da Classe preenche apenas os 6 Status Class (coreStats).
// Regras por ponto aplicado (fatores configuráveis na engine para balanceamento):
//   • Flat: Attack Power, Spell Power, Max Health e Mana = +0,5 por ponto.
//   • %: chances, boosts, resistências, penetração e cooldown = +0,25% por ponto.
export const CLASS_STAT_CONVERSION: Record<string, Record<string, number>> = {
  strength: { attackPower: 0.5, physicalBoost: 0.25, armorPenetration: 0.25 },
  intellect: { spellPower: 0.5, magicalBoost: 0.25, magicPenetration: 0.25 },
  endurance: { maxHealth: 0.5, physicalResistance: 0.25, magicalResistance: 0.25 },
  dexterity: { hitChance: 0.25, evasion: 0.25 },
  wisdom: { mana: 0.5, manaRegen: 0.25, healingBoost: 0.25, cooldownReduction: 0.25 },
  luck: { critChance: 0.25, critMultiplier: 0.25 },
};

// Onde cada alvo da conversão cai dentro de DerivedStats.
const CONVERSION_TARGETS: Record<string, keyof DerivedStats> = {
  attackPower: "attackPower",
  physicalBoost: "physicalDamagePercent",
  armorPenetration: "penetration",
  spellPower: "spellPower",
  magicalBoost: "magicalDamagePercent",
  magicPenetration: "penetration",
  maxHealth: "hp",
  physicalResistance: "physicalResistance",
  magicalResistance: "magicalResistance",
  hitChance: "hitChance",
  evasion: "dodge",
  mana: "mana",
  manaRegen: "manaRegenPerTick",
  healingBoost: "healingPercent",
  cooldownReduction: "cooldownReduction",
  critChance: "critChance",
  critMultiplier: "critDamage",
};

export interface StatsInput {
  level: number;
  hp?: number;
  mana?: number;
  statModel: {
    base?: Record<string, any>;
    perLevel?: Record<string, any>;
    scaling?: Record<string, any>;
    coreStats?: Record<string, any>;
    bonuses?: Record<string, any>; // usado apenas para injetar boosters (damageBoost/defenseBoost)
  };
  resource?: Record<string, any>;
  passives: PassiveDef[]; // apenas passivas desbloqueadas pelo rank
  coreStats?: CoreStats; // Core Stats vindos de itens/encantamentos equipados
  attackSpeedMs?: number; // ÚNICA fonte de velocidade de ataque: a arma equipada (sem arma = 2000ms)
  weaponDps?: number; // DPS natural da arma equipada (soma ao attack power)
}

function flatPassiveMods(passives: PassiveDef[], key: string): number {
  let total = 0;
  for (const p of passives) {
    if (p.statModifiers?.flat) total += num(p.statModifiers.flat[key], 0);
  }
  return total;
}

function percentPassiveMods(passives: PassiveDef[], key: string): number {
  let total = 0;
  for (const p of passives) {
    if (p.statModifiers?.percent) total += num(p.statModifiers.percent[key], 0);
  }
  return total;
}

function applyPercent(stat: number, totalPercent: number): number {
  return stat * (1 + totalPercent / 100);
}

// Aplica a matriz fixa sobre o total de Status Class (classe + itens + encantamentos).
function applyCoreConversion(core: CoreStats, stats: DerivedStats): void {
  for (const stat of CORE_STAT_KEYS) {
    const value = num(core[stat], 0);
    if (!value) continue;
    const table = CLASS_STAT_CONVERSION[stat];
    if (!table) continue;
    for (const [target, factor] of Object.entries(table)) {
      const derivedKey = CONVERSION_TARGETS[target];
      if (derivedKey) stats[derivedKey] += value * factor;
    }
  }
}

export function computeStats(input: StatsInput): DerivedStats {
  const resource = input.resource || {};
  const coreStatsBase = input.statModel?.coreStats || {};

  const stats: DerivedStats = { ...BASE_STATS };

  // Status Class totais = classe (fixos) + itens/encantamentos equipados
  const modelCore = sumCoreStats([
    {
      strength: pickFrom(coreStatsBase, "strength"),
      intellect: pickFrom(coreStatsBase, "intellect"),
      endurance: pickFrom(coreStatsBase, "endurance"),
      dexterity: pickFrom(coreStatsBase, "dexterity"),
      wisdom: pickFrom(coreStatsBase, "wisdom"),
      luck: pickFrom(coreStatsBase, "luck"),
    },
  ]);
  const totalCore = sumCoreStats([modelCore, input.coreStats]);

  // Conversão central: Status Class → Combat Stats (matriz fixa da engine)
  applyCoreConversion(totalCore, stats);

  // Passivas de classe (flat) — modificadores sobre os derivados
  stats.hp += flatPassiveMods(input.passives, "hp");
  stats.mana += flatPassiveMods(input.passives, "mana");
  stats.attack += flatPassiveMods(input.passives, "attack");
  stats.defense += flatPassiveMods(input.passives, "defense");
  stats.magic += flatPassiveMods(input.passives, "magic");
  stats.magicDefense += flatPassiveMods(input.passives, "magicDefense");
  stats.speed += flatPassiveMods(input.passives, "speed");
  stats.hitChance += flatPassiveMods(input.passives, "hitChance") + percentPassiveMods(input.passives, "hitChance");
  stats.critChance += flatPassiveMods(input.passives, "critChance") + percentPassiveMods(input.passives, "critChance");
  stats.critDamage += flatPassiveMods(input.passives, "critDamage") + percentPassiveMods(input.passives, "critDamage");
  stats.dodge += flatPassiveMods(input.passives, "dodge") + percentPassiveMods(input.passives, "dodge");
  stats.cooldownReduction += flatPassiveMods(input.passives, "cooldownReduction") + percentPassiveMods(input.passives, "cooldownReduction");
  stats.damagePercent += flatPassiveMods(input.passives, "damagePercent") + percentPassiveMods(input.passives, "damagePercent");
  stats.physicalDamagePercent += flatPassiveMods(input.passives, "physicalDamagePercent") + percentPassiveMods(input.passives, "physicalDamagePercent");
  stats.magicalDamagePercent += flatPassiveMods(input.passives, "magicDamagePercent") + percentPassiveMods(input.passives, "magicDamagePercent");
  stats.healingPercent += flatPassiveMods(input.passives, "healingPercent") + percentPassiveMods(input.passives, "healingPercent");
  stats.dotPercent += flatPassiveMods(input.passives, "dotPercent") + percentPassiveMods(input.passives, "dotPercent");
  stats.overhealPercent += flatPassiveMods(input.passives, "overhealPercent") + percentPassiveMods(input.passives, "overhealPercent");
  stats.manaCostReduction += flatPassiveMods(input.passives, "manaCostReduction") + percentPassiveMods(input.passives, "manaCostReduction");
  stats.physicalResistance += flatPassiveMods(input.passives, "physicalResistance");
  stats.magicalResistance += flatPassiveMods(input.passives, "magicalResistance");
  stats.damageResistance += flatPassiveMods(input.passives, "damageResistance");
  stats.penetration += flatPassiveMods(input.passives, "penetration");
  stats.manaRegenPerTick += flatPassiveMods(input.passives, "manaRegen") + num(resource.manaRegenPerTick, 0);
  stats.healthRegenPerTick += flatPassiveMods(input.passives, "healthRegen");
  stats.threatPerAttack = num(resource.threatPerAttack, 1);
  stats.aggroPerHit = num(resource.aggroPerHit, 1);

  // Attack Speed: definida EXCLUSIVAMENTE pela arma equipada (attackSpeedMs do item).
  // A classe NÃO define intervalo nem velocidade de ataque. Sem arma: 2000ms padrão.
  stats.attackSpeedMs = Math.max(100, Math.round(input.attackSpeedMs && input.attackSpeedMs > 0 ? input.attackSpeedMs : 2000));

  // Boosters equipados (gacha): dano e defesa — único uso do `bonuses` no modelo
  const bonuses = input.statModel?.bonuses || {};
  stats.damagePercent += num(bonuses.damageBoost, 0);
  stats.physicalResistance += num(bonuses.defenseBoost, 0);
  stats.magicalResistance += num(bonuses.defenseBoost, 0);

  // Percentuais aplicados aos núcleos (passivas "percent")
  stats.hp = Math.floor(applyPercent(stats.hp, percentPassiveMods(input.passives, "hp")));
  stats.mana = Math.floor(applyPercent(stats.mana, percentPassiveMods(input.passives, "mana")));
  stats.attack = Math.floor(applyPercent(stats.attack, percentPassiveMods(input.passives, "attack")));
  stats.defense = Math.floor(applyPercent(stats.defense, percentPassiveMods(input.passives, "defense")));
  stats.magic = Math.floor(applyPercent(stats.magic, percentPassiveMods(input.passives, "magic")));
  stats.magicDefense = Math.floor(applyPercent(stats.magicDefense, percentPassiveMods(input.passives, "magicDefense")));
  stats.speed = Math.floor(applyPercent(stats.speed, percentPassiveMods(input.passives, "speed")));

  // Attack/Spell Power: conversão + passivas + DPS da arma (vira dano físico por ataque)
  stats.attackPower = Math.max(1, Math.floor(applyPercent(stats.attackPower, percentPassiveMods(input.passives, "attackPowerPercent")) + flatPassiveMods(input.passives, "attackPower")));
  stats.spellPower = Math.max(1, Math.floor(applyPercent(stats.spellPower, percentPassiveMods(input.passives, "spellPowerPercent")) + flatPassiveMods(input.passives, "spellPower")));
  if (input.weaponDps) {
    stats.attackPower = Math.floor(stats.attackPower + (input.weaponDps * stats.attackSpeedMs) / 1000);
  }

  stats.maxHp = stats.hp;
  stats.maxMana = stats.mana;

  // Clamps de sanidade
  stats.hitChance = Math.min(100, Math.max(0, stats.hitChance));
  stats.critChance = Math.max(0, stats.critChance);
  stats.critDamage = Math.max(50, stats.critDamage);
  stats.dodge = Math.min(60, Math.max(0, stats.dodge));
  stats.cooldownReduction = Math.max(0, stats.cooldownReduction);

  return stats;
}

export function computeMonsterStats(monster: any): DerivedStats {
  const stats: DerivedStats = { ...BASE_STATS };
  stats.level = monster.level ?? 1;
  stats.hp = num(monster.hp, 50);
  stats.mana = num(monster.mana, 20);
  stats.attack = num(monster.attack, 10);
  stats.defense = num(monster.defense, 5);
  stats.magic = num(monster.magic, 5);
  stats.magicDefense = num(monster.magicDefense, 5);
  stats.speed = num(monster.speed, 10);
  stats.attackPower = stats.attack;
  stats.spellPower = stats.magic;
  stats.critChance = num(monster.criticalChance, 2);
  stats.critDamage = num(monster.criticalDamage, 150);
  stats.dodge = num(monster.dodge, 1);
  stats.attackSpeedMs = Math.max(800, num(monster.attackSpeed, 2000));
  stats.hitChance = num(monster.hitChance, 85);
  stats.penetration = num(monster.penetration, 0);
  stats.damageResistance = num(monster.damageResistance, 0);
  stats.physicalResistance = num(monster.physicalResistance, 0);
  stats.magicalResistance = num(monster.magicalResistance, 0);
  stats.dotPercent = num(monster.dotPercent, 0);
  stats.healingPercent = num(monster.healingPercent, 0);
  stats.overhealPercent = num(monster.overhealPercent, 0);
  stats.manaCostReduction = num(monster.manaCostReduction, 0);
  stats.cooldownReduction = num(monster.cooldownReduction, 0);
  stats.manaRegenPerTick = num(monster.manaRegenPerTick, 5);
  stats.healthRegenPerTick = num(monster.healthRegenPerTick, 0);
  stats.maxHp = stats.hp;
  stats.maxMana = stats.mana;
  return stats;
}

export function applyStatModifiers(stats: DerivedStats, mods: { flat?: Record<string, number>; percent?: Record<string, number> }): DerivedStats {
  const next = { ...stats };
  if (mods.flat) {
    for (const [k, v] of Object.entries(mods.flat)) {
      if (k in next || k === "maxHp" || k === "maxMana") {
        const target = k === "maxHp" ? "hp" : k === "maxMana" ? "mana" : k;
        next[target] = Math.max(0, next[target] + Number(v) || 0);
      }
    }
  }
  if (mods.percent) {
    for (const [k, v] of Object.entries(mods.percent)) {
      const target = k === "maxHp" ? "hp" : k === "maxMana" ? "mana" : k;
      if (target in next) {
        next[target] = Math.max(0, next[target] * (1 + (Number(v) || 0) / 100));
      }
    }
  }
  next.maxHp = next.hp;
  next.maxMana = next.mana;
  return next;
}
