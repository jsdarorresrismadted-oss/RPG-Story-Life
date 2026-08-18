// ===== Boosters de Arma =====
// Toda arma carrega 1-3 boosters (campo Item.boosters: [{ slug, name, kind, value }]).
// O valor MÁXIMO de cada booster é capado pela raridade da arma (mítico = 51%).
// Os kinds mapeiam para stats da engine (DerivedStats) ou pontos de dano do combate.

export type WeaponBoosterKind =
  | "damagePercent" // Dano Geral
  | "physicalDamagePercent" // Dano Físico
  | "magicalDamagePercent" // Dano Mágico
  | "pvpDamagePercent" // Dano PvP (contra jogador)
  | "pveDamagePercent" // Dano PvE (contra monstro)
  | "bossDamagePercent" // Dano contra Chefes
  | "critChance" // Chance Crítica
  | "critDamage" // Dano Crítico (additivo ao multiplicador)
  | "penetration" // Penetração (física e mágica)
  | "hitChance" // Precisão
  | "lifestealPercent" // Roubo de Vida
  | "manaStealPercent" // Roubo de Mana
  | "doubleStrikeChance" // Golpe Duplo (2º ataque automático)
  | "attackSpeedPercent" // Velocidade de Ataque (reduz intervalo)
  | "cooldownReduction" // Redução de Cooldown de skills
  | "dotPercent" // Dano em DOTs
  | "executionPercent" // Dano contra alvo com HP ≤ 30%
  | "fullHpDamagePercent"; // Dano contra alvo com HP cheio

export const WEAPON_BOOSTER_KINDS: Record<WeaponBoosterKind, { label: string; category: string; format: "%" | "add" }> = {
  damagePercent: { label: "Dano Geral", category: "Dano/Ofensiva", format: "%" },
  physicalDamagePercent: { label: "Dano Físico", category: "Dano/Ofensiva", format: "%" },
  magicalDamagePercent: { label: "Dano Mágico", category: "Dano/Ofensiva", format: "%" },
  pvpDamagePercent: { label: "Dano PvP", category: "PvP", format: "%" },
  pveDamagePercent: { label: "Dano PvE", category: "PvE", format: "%" },
  bossDamagePercent: { label: "Dano contra Chefes", category: "PvE", format: "%" },
  critChance: { label: "Chance Crítica", category: "Crítico/Precisão", format: "%" },
  critDamage: { label: "Dano Crítico", category: "Crítico/Precisão", format: "%" },
  penetration: { label: "Penetração", category: "Crítico/Precisão", format: "%" },
  hitChance: { label: "Precisão", category: "Crítico/Precisão", format: "%" },
  lifestealPercent: { label: "Roubo de Vida", category: "Efeitos/Combate", format: "%" },
  manaStealPercent: { label: "Roubo de Mana", category: "Efeitos/Combate", format: "%" },
  doubleStrikeChance: { label: "Golpe Duplo", category: "Efeitos/Combate", format: "%" },
  attackSpeedPercent: { label: "Velocidade de Ataque", category: "Efeitos/Combate", format: "%" },
  cooldownReduction: { label: "Redução de Cooldown", category: "Efeitos/Combate", format: "%" },
  dotPercent: { label: "Dano Contínuo (DOT)", category: "Efeitos/Combate", format: "%" },
  executionPercent: { label: "Golpe de Execução", category: "Especiais/Avançados", format: "%" },
  fullHpDamagePercent: { label: "Emboscada (HP cheio)", category: "Especiais/Avançados", format: "%" },
};

export const WEAPON_BOOSTER_CATEGORIES = ["Dano/Ofensiva", "PvP", "PvE", "Crítico/Precisão", "Efeitos/Combate", "Especiais/Avançados"] as const;

// Cap MÁXIMO do valor por raridade (%). Mítico = 51% (spec do dono).
export const WEAPON_BOOSTER_CAP_BY_RARITY: Record<string, number> = {
  common: 10,
  uncommon: 16,
  rare: 24,
  epic: 32,
  legendary: 42,
  mythic: 51,
};

export interface WeaponBoosterDef {
  slug: string;
  name: string;
  kind: WeaponBoosterKind;
  description: string;
}

export interface WeaponBoosterInstance {
  slug: string;
  name: string;
  kind: WeaponBoosterKind;
  value: number;
}

// Pool de conteúdo (nomes da lista do dono). Cada booster tem um kind mecânico.
export const WEAPON_BOOSTER_POOL: WeaponBoosterDef[] = [
  // Dano / Ofensiva
  { slug: "dano-brutal", name: "Dano Brutal", kind: "damagePercent", description: "Aumenta todo o dano causado." },
  { slug: "forca-selvagem", name: "Força Selvagem", kind: "damagePercent", description: "Dano geral aumentado." },
  { slug: "poder-bruto", name: "Poder Bruto", kind: "damagePercent", description: "Golpes causam mais dano." },
  { slug: "furor-de-batalha", name: "Fúria de Batalha", kind: "damagePercent", description: "Dano geral aumentado." },
  { slug: "golpe-pesado", name: "Golpe Pesado", kind: "physicalDamagePercent", description: "Aumenta o dano físico." },
  { slug: "impacto-devastador", name: "Impacto Devastador", kind: "physicalDamagePercent", description: "Ataques físicos mais fortes." },
  { slug: "lamina-afiada", name: "Lâmina Afiada", kind: "physicalDamagePercent", description: "Aumenta o dano físico." },
  { slug: "poder-arcano", name: "Poder Arcano", kind: "magicalDamagePercent", description: "Aumenta o dano mágico." },
  { slug: "chama-arcana", name: "Chama Arcana", kind: "magicalDamagePercent", description: "Feitiços causam mais dano." },
  { slug: "essencia-mistica", name: "Essência Mística", kind: "magicalDamagePercent", description: "Aumenta o dano mágico." },
  // PvP
  { slug: "dominador-de-arenas", name: "Dominador de Arenas", kind: "pvpDamagePercent", description: "Dano aumentado contra jogadores." },
  { slug: "cacador-de-jogadores", name: "Caçador de Jogadores", kind: "pvpDamagePercent", description: "Dano aumentado contra jogadores." },
  { slug: "golpe-de-arena", name: "Golpe de Arena", kind: "pvpDamagePercent", description: "Dano aumentado contra jogadores." },
  { slug: "furia-pvp", name: "Fúria PvP", kind: "pvpDamagePercent", description: "Dano aumentado contra jogadores." },
  // PvE
  { slug: "cacador-de-monstros", name: "Caçador de Monstros", kind: "pveDamagePercent", description: "Dano aumentado contra monstros." },
  { slug: "matador-de-criaturas", name: "Matador de Criaturas", kind: "pveDamagePercent", description: "Dano aumentado contra monstros." },
  { slug: "explorador-brutal", name: "Explorador Brutal", kind: "pveDamagePercent", description: "Dano aumentado contra monstros." },
  { slug: "matador-de-colossos", name: "Matador de Colossos", kind: "bossDamagePercent", description: "Dano aumentado contra chefes." },
  { slug: "rompedor-de-chefes", name: "Rompedor de Chefes", kind: "bossDamagePercent", description: "Dano aumentado contra chefes." },
  { slug: "destruidor-de-reinos", name: "Destruidor de Reinos", kind: "bossDamagePercent", description: "Dano aumentado contra chefes." },
  // Crítico / Precisão / Penetração
  { slug: "olho-de-falcao", name: "Olho de Falcão", kind: "critChance", description: "Aumenta a chance de crítico." },
  { slug: "precisao-mortal", name: "Precisão Mortal", kind: "critChance", description: "Aumenta a chance de crítico." },
  { slug: "instinto-de-cacador", name: "Instinto de Caçador", kind: "critChance", description: "Aumenta a chance de crítico." },
  { slug: "golpe-letal", name: "Golpe Letal", kind: "critDamage", description: "Aumenta o dano crítico." },
  { slug: "dano-devastador", name: "Dano Devastador", kind: "critDamage", description: "Aumenta o dano crítico." },
  { slug: "furia-destrutiva", name: "Fúria Destrutiva", kind: "critDamage", description: "Aumenta o dano crítico." },
  { slug: "fio-de-aco", name: "Fio de Aço", kind: "penetration", description: "Ignora parte da defesa do alvo." },
  { slug: "lamina-sombria", name: "Lâmina Sombria", kind: "penetration", description: "Ignora parte da defesa do alvo." },
  { slug: "perfurante", name: "Perfurante", kind: "penetration", description: "Ignora parte da defesa do alvo." },
  { slug: "ponteira-firme", name: "Ponteira Firme", kind: "hitChance", description: "Aumenta a chance de acerto." },
  { slug: "pulso-certeiro", name: "Pulso Certeiro", kind: "hitChance", description: "Aumenta a chance de acerto." },
  // Efeitos / Combate
  { slug: "sede-de-sangue", name: "Sede de Sangue", kind: "lifestealPercent", description: "Cura ao causar dano." },
  { slug: "vampirismo", name: "Vampirismo", kind: "lifestealPercent", description: "Cura ao causar dano." },
  { slug: "drenar-vida", name: "Drenar Vida", kind: "lifestealPercent", description: "Cura ao causar dano." },
  { slug: "dreno-arcano", name: "Dreno Arcano", kind: "manaStealPercent", description: "Recupera mana ao causar dano." },
  { slug: "ladrao-de-mana", name: "Ladrão de Mana", kind: "manaStealPercent", description: "Recupera mana ao causar dano." },
  { slug: "golpe-duplo", name: "Golpe Duplo", kind: "doubleStrikeChance", description: "Chance de atacar duas vezes." },
  { slug: "ataque-relampago", name: "Ataque Relâmpago", kind: "doubleStrikeChance", description: "Chance de atacar duas vezes." },
  { slug: "rajada-rapida", name: "Rajada Rápida", kind: "doubleStrikeChance", description: "Chance de atacar duas vezes." },
  { slug: "velocidade-ligeira", name: "Velocidade Ligeira", kind: "attackSpeedPercent", description: "Ataques automáticos mais rápidos." },
  { slug: "maos-rapidas", name: "Mãos Rápidas", kind: "attackSpeedPercent", description: "Ataques automáticos mais rápidos." },
  { slug: "furia-acelerada", name: "Fúria Acelerada", kind: "attackSpeedPercent", description: "Ataques automáticos mais rápidos." },
  { slug: "mente-agil", name: "Mente Ágil", kind: "cooldownReduction", description: "Skills recarregam mais rápido." },
  { slug: "instinto-de-combate", name: "Instinto de Combate", kind: "cooldownReduction", description: "Skills recarregam mais rápido." },
  { slug: "reflexo-rapido", name: "Reflexo Rápido", kind: "cooldownReduction", description: "Skills recarregam mais rápido." },
  { slug: "queimadura-sombria", name: "Queimadura Sombria", kind: "dotPercent", description: "Aumenta o dano de efeitos contínuos." },
  { slug: "veneno-lento", name: "Veneno Lento", kind: "dotPercent", description: "Aumenta o dano de efeitos contínuos." },
  { slug: "sangramento-profundo", name: "Sangramento Profundo", kind: "dotPercent", description: "Aumenta o dano de efeitos contínuos." },
  // Especiais / Avançados
  { slug: "golpe-de-execucao", name: "Golpe de Execução", kind: "executionPercent", description: "Dano aumentado contra alvos fracos." },
  { slug: "sentenca-final", name: "Sentença Final", kind: "executionPercent", description: "Dano aumentado contra alvos fracos." },
  { slug: "golpe-de-misericordia", name: "Golpe de Misericórdia", kind: "executionPercent", description: "Dano aumentado contra alvos fracos." },
  { slug: "emboscada", name: "Emboscada", kind: "fullHpDamagePercent", description: "Dano aumentado contra alvos com HP cheio." },
  { slug: "primeiro-golpe", name: "Primeiro Golpe", kind: "fullHpDamagePercent", description: "Dano aumentado contra alvos com HP cheio." },
  { slug: "ataque-surpresa", name: "Ataque Surpresa", kind: "fullHpDamagePercent", description: "Dano aumentado contra alvos com HP cheio." },
];

// Kinds preferidos por subtipo de arma.
const SUBTYPE_KIND_BIAS: Record<string, WeaponBoosterKind[]> = {
  staff: ["magicalDamagePercent", "cooldownReduction", "dotPercent", "damagePercent", "pvpDamagePercent", "pveDamagePercent"],
  dagger: ["physicalDamagePercent", "critChance", "critDamage", "attackSpeedPercent", "doubleStrikeChance", "penetration"],
  sword: ["physicalDamagePercent", "critChance", "critDamage", "penetration", "hitChance", "damagePercent"],
  longsword: ["physicalDamagePercent", "critDamage", "penetration", "damagePercent", "hitChance", "critChance"],
  axe: ["physicalDamagePercent", "critDamage", "damagePercent", "penetration", "hitChance", "doubleStrikeChance"],
  mace: ["physicalDamagePercent", "damagePercent", "penetration", "hitChance", "critChance", "critDamage"],
  spear: ["physicalDamagePercent", "penetration", "critChance", "hitChance", "doubleStrikeChance", "attackSpeedPercent"],
  bow: ["physicalDamagePercent", "critChance", "critDamage", "penetration", "attackSpeedPercent", "hitChance"],
};

// Rolagem de valor dentro do cap da raridade (min = metade do cap).
export function rollWeaponBoosterValue(kind: WeaponBoosterKind, rarity: string): number {
  const cap = WEAPON_BOOSTER_CAP_BY_RARITY[rarity] ?? 10;
  const min = Math.max(1, Math.round(cap / 2));
  const base = min + Math.floor(Math.random() * (cap - min + 1));
  const isAdd = WEAPON_BOOSTER_KINDS[kind]?.format === "add";
  return isAdd ? Math.max(1, Math.round(base / 10)) : base;
}

// Sorteia `count` boosters únicos do pool (sem repetir slug).
// Quando subtype é informado, favorece boosters do tipo correto (~60% biased, 40% geral).
export function rollWeaponBoosters(rarity: string, count = 3, pool: WeaponBoosterDef[] = WEAPON_BOOSTER_POOL, subtype?: string): WeaponBoosterInstance[] {
  const biasedKinds = subtype ? SUBTYPE_KIND_BIAS[subtype.toLowerCase()] : undefined;
  const out: WeaponBoosterInstance[] = [];
  const usedSlugs = new Set<string>();
  const target = Math.min(count, pool.length);
  while (out.length < target && usedSlugs.size < pool.length) {
    // 60% chance de pegar do conjunto biased se existir
    let candidates = pool;
    if (biasedKinds && Math.random() < 0.6) {
      const biased = pool.filter((b) => biasedKinds.includes(b.kind) && !usedSlugs.has(b.slug));
      if (biased.length > 0) candidates = biased;
    }
    // filtra usados
    const available = candidates.filter((b) => !usedSlugs.has(b.slug));
    if (available.length === 0) break;
    const picked = available[Math.floor(Math.random() * available.length)];
    usedSlugs.add(picked.slug);
    out.push({
      slug: picked.slug,
      name: picked.name,
      kind: picked.kind,
      value: rollWeaponBoosterValue(picked.kind, rarity),
    });
  }
  return out;
}

// Soma boosters de uma lista de itens por kind (para o combate).
export function sumWeaponBoosters(items: Array<{ boosters?: unknown } | null | undefined>): Partial<Record<WeaponBoosterKind, number>> {
  const out: Partial<Record<WeaponBoosterKind, number>> = {};
  for (const item of items) {
    if (!item?.boosters) continue;
    const list = typeof item.boosters === "string" ? safeParse(item.boosters) : item.boosters;
    if (!Array.isArray(list)) continue;
    for (const b of list) {
      const kind = String(b?.kind || "") as WeaponBoosterKind;
      if (!(kind in WEAPON_BOOSTER_KINDS)) continue;
      out[kind] = (out[kind] || 0) + (Number(b?.value) || 0);
    }
  }
  return out;
}

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// Lê os boosters de um item (JSON string ou objeto).
export function parseItemBoosters(boosters: unknown): WeaponBoosterInstance[] {
  if (!boosters) return [];
  const list = typeof boosters === "string" ? safeParse(boosters) : boosters;
  if (!Array.isArray(list)) return [];
  return list
    .filter((b) => b && typeof b === "object" && "slug" in b)
    .map((b) => ({
      slug: String(b.slug),
      name: String(b.name || b.slug),
      kind: String(b.kind || "") as WeaponBoosterKind,
      value: Number(b.value) || 0,
    }));
}