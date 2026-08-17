// ===== Fórmula de progressão de encantamentos (espelho do backend) =====
// Mantém os MESMOS valores de backend/src/core/enchantments/enchantmentStats.ts
// para preview instantâneo no formulário. A fonte da verdade é o backend.
// Progressão LINEAR: cada atributo cresce +ENCHANT_STEP_PER_LEVEL por nível;
// no Nv.1 o atributo principal vale o dobro dos secundários (ex.: +2/+4).

export const ENCHANT_MAX_LEVEL = 150;
export const ENCHANT_MIN_LEVEL = 1;
export const ENCHANT_STEP_PER_LEVEL = 2;
export const ENCHANT_STAT_MAX = 90;
export const ENCHANT_DPS_MAX = 308;

export const ENCHANTMENT_CATEGORIES = [
  "strength",
  "intellect",
  "endurance",
  "dexterity",
  "wisdom",
  "luck",
];

export const CORE_STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];

export function clampLevel(level: number): number {
  return Math.max(ENCHANT_MIN_LEVEL, Math.min(ENCHANT_MAX_LEVEL, Math.floor(level) || ENCHANT_MIN_LEVEL));
}

// A cada 2 níveis um encantamento é VIP (pares: 2, 4, 6...) — alterna normal/VIP.
// VIP = velocidade sugerida 1.5s e requer assinatura VIP (não muda o DPS).
export function isVipLevel(level: number): boolean {
  return clampLevel(level) % 2 === 0;
}

export function statAtLevel(base: number, level: number): number {
  const lvl = clampLevel(level);
  return Math.max(1, Math.min(ENCHANT_STAT_MAX, (Number(base) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL)));
}

export function dpsAtLevel(baseDps: number, level: number): number {
  const lvl = clampLevel(level);
  const linear = (Number(baseDps) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL);
  return Math.max(1, Math.min(ENCHANT_DPS_MAX, linear));
}

export function speedAtLevel(baseSpeed: number | null | undefined, level: number): number {
  const v = Number(baseSpeed) || 0;
  if (v > 0) return Math.max(500, Math.min(2600, Math.round(v)));
  return isVipLevel(level) ? 1500 : 2000;
}

export function computeEnchantmentStats(enchantment: {
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  level?: number;
}): Record<string, number> {
  const level = clampLevel(Number(enchantment.level) || 1);
  const out: Record<string, number> = {};
  for (const stat of CORE_STAT_KEYS) {
    const v = Number((enchantment as any)[stat]) || 0;
    out[stat] = statAtLevel(v, level);
  }
  return out;
}

export function computeEnchantmentValues(enchantment: {
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  level?: number;
  dps?: number;
  attackSpeedMs?: number;
}): Record<string, number> {
  return {
    ...computeEnchantmentStats(enchantment),
    dps: dpsAtLevel(Number(enchantment.dps) || 0, levelOf(enchantment)),
    attackSpeedMs: speedAtLevel(enchantment.attackSpeedMs, levelOf(enchantment)),
  };
}

function levelOf(e: { level?: number }): number {
  return clampLevel(Number(e.level) || 1);
}

export interface EnchantmentValues {
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  dps: number;
  attackSpeedMs: number;
}

// Escala padrão de criação: principal (category) 10, demais 5, DPS 10, 2s (VIP: 1.5s).
export function defaultEnchantmentScale(category: string, level: number): EnchantmentValues & { requiredVip: boolean } {
  const lvl = clampLevel(level);
  const base: Record<string, number> = { strength: 5, intellect: 5, endurance: 5, dexterity: 5, wisdom: 5, luck: 5 };
  if (ENCHANTMENT_CATEGORIES.includes(category)) base[category] = 10;
  const out: EnchantmentValues = {
    strength: statAtLevel(base.strength, lvl),
    intellect: statAtLevel(base.intellect, lvl),
    endurance: statAtLevel(base.endurance, lvl),
    dexterity: statAtLevel(base.dexterity, lvl),
    wisdom: statAtLevel(base.wisdom, lvl),
    luck: statAtLevel(base.luck, lvl),
    dps: dpsAtLevel(10, lvl),
    attackSpeedMs: isVipLevel(lvl) ? 1500 : 2000,
  };
  return { ...out, requiredVip: isVipLevel(lvl) };
}
