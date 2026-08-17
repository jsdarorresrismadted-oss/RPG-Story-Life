// ===== Fórmula de progressão de encantamentos =====
// ÚNICA fonte da verdade dos valores de encantamento:
// - Cada encantamento guarda os valores BASE no nível 1 (colunas strength..luck, dps, attackSpeedMs).
// - Os valores de qualquer nível são calculados por ESTA fórmula — nunca aleatórios.
// - Progressão LINEAR: cada atributo cresce +ENCHANT_STEP_PER_LEVEL por nível.
//   No nível 1, o atributo principal (category) vale o dobro dos secundários.
//   Ex.: Sorte Nv.1 = +2 nos demais e +4 em Sorte; Sorte Nv.2 = +4/+6; Nv.3 = +6/+8; etc.
// - DPS: 10 no nível 1 e +2 por nível (10, 12, 14...) até 308 no nível 150 — linear puro.
// - Níveis VIP (pares): a cada 2 níveis um encantamento é VIP (2, 4, 6...) — alterna
//   um normal e um VIP; VIP = velocidade de ataque 1500ms e requer assinatura VIP.
// - Velocidade de ataque: base fixa do encantamento (padrão 2000ms; VIPs usam 1500ms).
// - A Combat Engine usa os valores calculados aqui (o encantamento SUBSTITUI o item).

export const ENCHANT_MAX_LEVEL = 150;
export const ENCHANT_MIN_LEVEL = 1;

// Aumento por nível de cada atributo (linear).
export const ENCHANT_STEP_PER_LEVEL = 2;

// Teto do DPS calculado pela escala (10 no nível 1, +2 por nível, 308 no nível 150).
// ENCHANT_STAT_MAX é o teto dos atributos.
export const ENCHANT_STAT_MAX = 90;
export const ENCHANT_DPS_MAX = 308;

// A cada 2 níveis um encantamento é VIP (pares: 2, 4, 6...) — alterna normal/VIP.
// VIP: velocidade 1500ms e requer assinatura VIP.
export function isVipLevel(level: number): boolean {
  return clampLevel(level) % 2 === 0;
}

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

export interface EnchantmentValues extends CoreStatValues {
  dps: number;
  attackSpeedMs: number;
}

export function clampLevel(level: number): number {
  return Math.max(ENCHANT_MIN_LEVEL, Math.min(ENCHANT_MAX_LEVEL, Math.floor(level) || ENCHANT_MIN_LEVEL));
}

/** Valor de UM atributo no nível informado: base + STEP * (level - 1), mínimo 1, teto ENCHANT_STAT_MAX. */
export function statAtLevel(base: number, level: number): number {
  const lvl = clampLevel(level);
  return Math.max(1, Math.min(ENCHANT_STAT_MAX, (Number(base) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL)));
}

/**
 * DPS no nível informado: base (nível 1) +2 por nível, teto ENCHANT_DPS_MAX.
 * Linear puro — o VIP não muda o DPS (10, 12, 14... até 308 no nível 150).
 */
export function dpsAtLevel(baseDps: number, level: number): number {
  const lvl = clampLevel(level);
  const linear = (Number(baseDps) || 0) + ENCHANT_STEP_PER_LEVEL * (lvl - ENCHANT_MIN_LEVEL);
  return Math.max(1, Math.min(ENCHANT_DPS_MAX, linear));
}

/** Velocidade de ataque (ms): base fixa do encantamento (padrão 2000; VIP pode usar 1500). */
export function speedAtLevel(baseSpeed: number | null | undefined, level: number): number {
  const v = Number(baseSpeed) || 0;
  if (v > 0) return Math.max(500, Math.min(2600, Math.round(v)));
  return isVipLevel(level) ? 1500 : 2000;
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

/** Stats + DPS + velocidade calculados no nível do encantamento. */
export function computeEnchantmentValues(enchantment: {
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  level: number;
  dps?: number | null;
  attackSpeedMs?: number | null;
}): EnchantmentValues {
  const level = clampLevel(enchantment.level);
  return {
    ...computeEnchantmentStats(enchantment),
    dps: dpsAtLevel(Number(enchantment.dps) || 0, level),
    attackSpeedMs: speedAtLevel(enchantment.attackSpeedMs, level),
  };
}

/**
 * Escala padrão para CRIAR um encantamento sem digitar valores:
 * stats = principal (category) 10, demais 5; DPS 10 (+2 por nível); velocidade 2000ms
 * (níveis VIP, a cada 2: 1500ms e requer assinatura VIP). O staff só escolhe o nível.
 */
export function defaultEnchantmentScale(category: string, level: number): EnchantmentValues & { requiredVip: boolean } {
  const lvl = clampLevel(level);
  const base: Record<string, number> = { strength: 5, intellect: 5, endurance: 5, dexterity: 5, wisdom: 5, luck: 5 };
  if (ENCHANTMENT_CATEGORIES.includes(category as any)) base[category] = 10;
  return {
    strength: statAtLevel(base.strength, lvl),
    intellect: statAtLevel(base.intellect, lvl),
    endurance: statAtLevel(base.endurance, lvl),
    dexterity: statAtLevel(base.dexterity, lvl),
    wisdom: statAtLevel(base.wisdom, lvl),
    luck: statAtLevel(base.luck, lvl),
    dps: dpsAtLevel(10, lvl),
    attackSpeedMs: isVipLevel(lvl) ? 1500 : 2000,
    requiredVip: isVipLevel(lvl),
  };
}

/** Projeção de todos os níveis (1-100) para o painel admin. */
export function enchantmentProgression(enchantment: Parameters<typeof computeEnchantmentValues>[0]): Array<{ level: number; stats: EnchantmentValues }> {
  const out: Array<{ level: number; stats: EnchantmentValues }> = [];
  for (let level = ENCHANT_MIN_LEVEL; level <= ENCHANT_MAX_LEVEL; level++) {
    out.push({ level, stats: computeEnchantmentValues({ ...enchantment, level } as any) });
  }
  return out;
}

/** Anexa os valores calculados ao objeto serializado (para o jogo e o admin). */
export function withEnchantmentStats<T extends Record<string, any>>(enchantment: T): T & { computedStats: EnchantmentValues } {
  return { ...enchantment, computedStats: computeEnchantmentValues(enchantment as any) };
}

// ===== DPS/Velocidade EFETIVOS da arma =====
// Itens são CASCAS: arma sem encantamento tem DPS mínimo por nível (1-5) para o
// jogo seguir jogável, mas o poder real vem do encantamento (que substitui tudo).

/** DPS efetivo da arma: encantamento aplicado > dps natural > mínimo por nível. undefined = sem arma. */
export function effectiveWeaponDps(weapon: { dps?: number | null; attackSpeedMs?: number | null; enchantment?: any } | null | undefined, level: number): number | undefined {
  if (!weapon) return undefined;
  const ench = weapon.enchantment ? computeEnchantmentValues(weapon.enchantment) : null;
  const dps = ench ? ench.dps : Number(weapon.dps) || 0;
  if (dps > 0) return dps;
  // Arma nua: DPS mínimo 1 a 5 conforme o nível do jogador (itens são cascas).
  return Math.min(5, 1 + Math.floor((Number(level) || 1) / 30));
}

/** Velocidade de ataque efetiva da arma: encantamento > item. undefined = padrão 2000ms. */
export function effectiveWeaponSpeed(weapon: { dps?: number | null; attackSpeedMs?: number | null; enchantment?: any } | null | undefined): number | undefined {
  if (!weapon) return undefined;
  const ench = weapon.enchantment ? computeEnchantmentValues(weapon.enchantment) : null;
  const speed = ench ? ench.attackSpeedMs : Number(weapon.attackSpeedMs) || 0;
  return speed > 0 ? speed : undefined;
}
