// ===== Fórmula de progressão de encantamentos (espelho do backend) =====
// Mantém os MESMOS valores de backend/src/core/enchantments/enchantmentStats.ts
// para preview instantâneo no formulário. A fonte da verdade é o backend.
// Progressão LINEAR: cada atributo cresce +ENCHANT_STEP_PER_LEVEL por nível;
// no Nv.1 o atributo principal vale o dobro dos secundários (ex.: +2/+4).

export const ENCHANT_MAX_LEVEL = 150;
export const ENCHANT_MIN_LEVEL = 1;
export const ENCHANT_STEP_PER_LEVEL = 2;

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
    out[stat] = Math.max(1, v + ENCHANT_STEP_PER_LEVEL * (level - ENCHANT_MIN_LEVEL));
  }
  return out;
}
