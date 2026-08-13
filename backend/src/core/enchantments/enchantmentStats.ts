// ===== Fórmula de progressão de encantamentos =====
// ÚNICA fonte da verdade dos valores de encantamento:
// - Cada encantamento guarda os valores BASE no nível 1 (colunas strength..luck).
// - Os valores de qualquer nível são calculados por ESTA fórmula — nunca aleatórios.
// - Progressão LINEAR: cada atributo cresce +ENCHANT_STEP_PER_LEVEL por nível.
//   No nível 1, o atributo principal (category) vale o dobro dos secundários.
//   Ex.: Sorte Nv.1 = +2 nos demais e +4 em Sorte; Sorte Nv.2 = +4/+6; Nv.3 = +6/+8; etc.
// - A Combat Engine usa os valores calculados aqui (o encantamento SUBSTITUI o item).

export const ENCHANT_MAX_LEVEL = 150;
export const ENCHANT_MIN_LEVEL = 1;

// Aumento por nível de cada atributo (linear).
export const ENCHANT_STEP_PER_LEVEL = 2;

export const ENCHANTMENT_CATEGORIES = [
  "strength",
  "intellect",
  "endurance",
  "dexterity",
  "wisdom",
  "luck",
] as const;

export type EnchantmentCategory = (typeof ENCHANTMENT_CATEGORIES)[number];

export const CORE_STATS: (keyof CoreStatValues)[] = [
  "strength",
  "intellect",
  "endurance",
  "dexterity",
  "wisdom",
  "luck",
];

export interface CoreStatValues {
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
}

export function clampLevel(level: number): number {
  return Math.max(ENCHANT_MIN_LEVEL, Math.min(ENCHANT_MAX_LEVEL, Math.floor(level) || ENCHANT_MIN_LEVEL));
}

/** Valor de UM atributo no nível informado: base + STEP * (level - 1), mínimo 1. */
export function statAtLevel(base: number, level: number): number {
  const lvl = clampLevel(level);
  return Math.max(1, (Number(base) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL));
}

/** Os 6 atributos calculados no nível do encantamento (base = nível 1). */
export function computeEnchantmentStats(enchantment: {
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  level: number;
}): CoreStatValues {
  const level = clampLevel(enchantment.level);
  const base: CoreStatValues = {
    strength: Number(enchantment.strength) || 0,
    intellect: Number(enchantment.intellect) || 0,
    endurance: Number(enchantment.endurance) || 0,
    dexterity: Number(enchantment.dexterity) || 0,
    wisdom: Number(enchantment.wisdom) || 0,
    luck: Number(enchantment.luck) || 0,
  };
  const out = {} as CoreStatValues;
  for (const stat of CORE_STATS) {
    out[stat] = statAtLevel(base[stat], level);
  }
  return out;
}

/** Projeção de todos os níveis (1-100) para o painel admin. */
export function enchantmentProgression(enchantment: Parameters<typeof computeEnchantmentStats>[0]): Array<{ level: number; stats: CoreStatValues }> {
  const out: Array<{ level: number; stats: CoreStatValues }> = [];
  for (let level = ENCHANT_MIN_LEVEL; level <= ENCHANT_MAX_LEVEL; level++) {
    out.push({ level, stats: computeEnchantmentStats({ ...enchantment, level }) });
  }
  return out;
}

/** Anexa os valores calculados ao objeto serializado (para o jogo e o admin). */
export function withEnchantmentStats<T extends Record<string, any>>(enchantment: T): T & { computedStats: CoreStatValues } {
  return { ...enchantment, computedStats: computeEnchantmentStats(enchantment as any) };
}
