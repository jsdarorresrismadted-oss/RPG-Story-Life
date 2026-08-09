// ===== Fórmula de progressão de encantamentos (fallback do jogo) =====
// Espelho de backend/src/core/enchantments/enchantmentStats.ts.
// O backend já envia `computedStats` nos endpoints; este helper serve de
// fallback caso algum encantamento venha sem o campo calculado.
// Progressão LINEAR: cada atributo cresce +2 por nível; no nível 1 o
// atributo principal vale o dobro dos secundários (ex.: Sorte Nv.1 +2/+4).

export const ENCHANT_MAX_LEVEL = 100;
export const ENCHANT_MIN_LEVEL = 1;
export const ENCHANT_STEP_PER_LEVEL = 2;

export const CORE_STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];

export function clampEnchantLevel(level: number): number {
  return Math.max(ENCHANT_MIN_LEVEL, Math.min(ENCHANT_MAX_LEVEL, Math.floor(level) || ENCHANT_MIN_LEVEL));
}

export function enchantmentStats(e: {
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  level?: number;
}): Record<string, number> {
  const level = clampEnchantLevel(Number(e.level) || 1);
  const out: Record<string, number> = {};
  for (const stat of CORE_STAT_KEYS) {
    const v = Number((e as any)[stat]) || 0;
    out[stat] = Math.max(1, v + ENCHANT_STEP_PER_LEVEL * (level - ENCHANT_MIN_LEVEL));
  }
  return out;
}

/** Stats efetivas do encantamento (usa computedStats do backend se existir). */
export function effectiveEnchantmentStats(e: {
  computedStats?: Record<string, number>;
  strength?: number;
  intellect?: number;
  endurance?: number;
  dexterity?: number;
  wisdom?: number;
  luck?: number;
  level?: number;
}): Record<string, number> {
  return e?.computedStats ?? enchantmentStats(e ?? {});
}
