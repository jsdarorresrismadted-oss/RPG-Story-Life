// ===== Fórmula de progressão de encantamentos (fallback do jogo) =====
// Espelho de backend/src/core/enchantments/enchantmentStats.ts.
// O backend já envia `computedStats` nos endpoints; este helper serve de
// fallback caso algum encantamento venha sem o campo calculado.
// Progressão LINEAR: cada atributo cresce +2 por nível; no nível 1 o
// atributo principal vale o dobro dos secundários (ex.: Sorte Nv.1 +2/+4).
// DPS: +2 por nível (teto 90); níveis VIP (múltiplos de 5) recebem +5.
// Velocidade: base fixa (padrão 2000ms; VIP pode usar 1500ms).

export const ENCHANT_MAX_LEVEL = 150;
export const ENCHANT_MIN_LEVEL = 1;
export const ENCHANT_STEP_PER_LEVEL = 2;
export const ENCHANT_STAT_MAX = 90;
export const ENCHANT_DPS_MAX = 90;

export const CORE_STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];

export function clampEnchantLevel(level: number): number {
  return Math.max(ENCHANT_MIN_LEVEL, Math.min(ENCHANT_MAX_LEVEL, Math.floor(level) || ENCHANT_MIN_LEVEL));
}

export function isVipEnchantLevel(level: number): boolean {
  return clampEnchantLevel(level) % 5 === 0;
}

function statAtLevel(base: number, level: number): number {
  const lvl = clampEnchantLevel(level);
  return Math.max(1, Math.min(ENCHANT_STAT_MAX, (Number(base) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL)));
}

function dpsAtLevel(baseDps: number, level: number): number {
  const lvl = clampEnchantLevel(level);
  const linear = (Number(baseDps) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL);
  const bonus = isVipEnchantLevel(lvl) ? 5 : 0;
  return Math.max(1, Math.min(ENCHANT_DPS_MAX, linear + bonus));
}

function speedAtLevel(baseSpeed: number | null | undefined, level: number): number {
  const v = Number(baseSpeed) || 0;
  if (v > 0) return Math.max(500, Math.min(2600, Math.round(v)));
  return isVipEnchantLevel(level) ? 1500 : 2000;
}

export function enchantmentStats(e: {
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
  const level = clampEnchantLevel(Number(e.level) || 1);
  const out: Record<string, number> = {};
  for (const stat of CORE_STAT_KEYS) {
    out[stat] = statAtLevel(Number((e as any)[stat]) || 0, level);
  }
  out.dps = dpsAtLevel(Number(e.dps) || 0, level);
  out.attackSpeedMs = speedAtLevel(e.attackSpeedMs, level);
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
  dps?: number;
  attackSpeedMs?: number;
}): Record<string, number> {
  return e?.computedStats ?? enchantmentStats(e ?? {});
}
