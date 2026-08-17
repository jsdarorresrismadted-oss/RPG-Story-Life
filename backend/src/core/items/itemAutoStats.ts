// ===== Atributos automáticos de equipamentos (elmo/armadura/capa) =====
// Arma/elmo/armadura/capa NÃO têm DPS/velocidade próprios (só o encantamento de
// arma dá isso). Elmos, armaduras e capas têm ATRIBUTOS, calculados pela fórmula
// abaixo a partir de NÍVEL e RARIDADE (o admin só escolhe esses dois):
//   base = 1.2 x nível x multiplicador da raridade
//   principal do tipo (elmo/armadura = endurance+dexterity; capa = wisdom+luck)
//   recebe a base; os demais 20-55% da base; teto 200.
// Se o item não tem atributos (itens antigos), vale o MÍNIMO por nível (1-5),
// igual ao DPS mínimo das armas nuas.

export const ITEM_RARITY_MULT: Record<string, number> = {
  common: 1,
  uncommon: 1.6,
  rare: 2.6,
  epic: 4.5,
  legendary: 8,
  mythic: 14,
};

export const EQUIP_STAT_TYPES = ["helm", "armor", "cape"] as const;

export const ITEM_STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"] as const;

export const ITEM_STAT_MAX = 200;

const PRIMARY_BY_TYPE: Record<string, string[]> = {
  helm: ["endurance", "dexterity"],
  armor: ["endurance", "dexterity"],
  cape: ["wisdom", "luck"],
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Atributos calculados por nível e raridade. Só elmo/armadura/capa; armas → tudo 0. */
export function autoEquipmentStats(type: string, level: number, rarity: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ITEM_STAT_KEYS) out[k] = 0;
  const primary = PRIMARY_BY_TYPE[type];
  if (!primary) return out;
  const base = Math.max(1, Math.round(1.2 * (Number(level) || 1) * (ITEM_RARITY_MULT[rarity] ?? 1)));
  const seed = hashStr(`${type}|${rarity}|${level}`);
  let idx = 0;
  for (const k of ITEM_STAT_KEYS) {
    if (primary.includes(k)) {
      out[k] = Math.min(ITEM_STAT_MAX, base + (primary[0] === k ? 0 : Math.round(base * 0.15)));
    } else {
      const frac = 0.2 + ((seed >> (idx * 3)) & 7) / 20; // 0.20 a 0.55
      out[k] = Math.max(1, Math.min(ITEM_STAT_MAX, Math.round(base * frac)));
    }
    idx++;
  }
  return out;
}

/** Atributos mínimos por nível (1 a 5 em todos) — fallback de itens antigos sem stats. */
export function minEquipmentStats(level: number): Record<string, number> {
  const v = Math.min(5, 1 + Math.floor((Number(level) || 1) / 30));
  const out: Record<string, number> = {};
  for (const k of ITEM_STAT_KEYS) out[k] = v;
  return out;
}

/** Algum atributo preenchido? (0 em todos = item antigo/casca → usa o mínimo). */
export function hasAnyItemStat(item: Record<string, any> | null | undefined): boolean {
  return !!item && ITEM_STAT_KEYS.some((k) => Number(item[k]) > 0);
}

/** Stats efetivas do equipamento: encantamento > atributos do item > mínimo por nível. */
export function effectiveItemStats(item: { type?: string; enchantment?: any; [k: string]: any } | null | undefined, playerLevel: number): Record<string, number> {
  if (!item) return minEquipmentStats(playerLevel);
  if (item.enchantment) {
    // Encantamento SUBSTITUI os atributos do item.
    const ench = item.enchantment.computedStats
      ? { ...item.enchantment.computedStats }
      : {
          strength: Number(item.enchantment.strength) || 0,
          intellect: Number(item.enchantment.intellect) || 0,
          endurance: Number(item.enchantment.endurance) || 0,
          dexterity: Number(item.enchantment.dexterity) || 0,
          wisdom: Number(item.enchantment.wisdom) || 0,
          luck: Number(item.enchantment.luck) || 0,
        };
    return ench;
  }
  if (hasAnyItemStat(item)) {
    const out: Record<string, number> = {};
    for (const k of ITEM_STAT_KEYS) out[k] = Math.max(1, Number(item[k]) || 0);
    return out;
  }
  return minEquipmentStats(playerLevel);
}