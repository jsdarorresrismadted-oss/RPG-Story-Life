import { prisma } from "./database";

// Tipos de boost suportados por Anéis/Colares (configuráveis no admin)
export const BOOST_TYPES = ["defense", "damage", "dropChance", "xp", "gold", "classXp"] as const;
export type BoostType = (typeof BOOST_TYPES)[number];

export const BOOST_TYPE_LABELS: Record<BoostType, string> = {
  defense: "Defesa",
  damage: "Dano Geral",
  dropChance: "Chance de Drop",
  xp: "XP",
  gold: "Gold",
  classXp: "XP de Classe",
};

export const BOOSTER_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

export const RARITY_LABELS: Record<string, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  epic: "Épico",
  legendary: "Lendário",
  mythic: "Mítico",
};

// Valor MÁXIMO do boost por raridade (spec): Comum +5% ... Mítico +30%
export const BOOST_MAX_BY_RARITY: Record<string, number> = {
  common: 5,
  uncommon: 10,
  rare: 15,
  epic: 20,
  legendary: 25,
  mythic: 30,
};

export type BoosterBonuses = Record<BoostType, number>;

export const EMPTY_BOOSTER_BONUSES: BoosterBonuses = {
  defense: 0,
  damage: 0,
  dropChance: 0,
  xp: 0,
  gold: 0,
  classXp: 0,
};

// Soma os valores dos boosters equipados (aceita rows de UserBooster com .booster incluso)
export function sumBoosterBonuses(owned: { booster: { boostType: string; boostValue: number } }[]): BoosterBonuses {
  const bonuses = { ...EMPTY_BOOSTER_BONUSES };
  for (const ub of owned) {
    const t = ub.booster.boostType as BoostType;
    if (t in bonuses) bonuses[t] += Number(ub.booster.boostValue) || 0;
  }
  return bonuses;
}

// Boosters equipados do usuário (máx. 1 anel + 1 colar)
export async function getEquippedBoosterBonuses(userId: string): Promise<BoosterBonuses> {
  const owned = await prisma.userBooster.findMany({
    where: { userId, equipped: true, booster: { isActive: true } },
    include: { booster: true },
  });
  return sumBoosterBonuses(owned);
}

// Aneis/Colares do gacha que foram para o inventario e estao equipados nos
// slots ring/necklace do personagem (boosts % gravados no proprio Item)
export async function getEquippedItemBoosterBonuses(characterId: string): Promise<BoosterBonuses> {
  const equipment = await prisma.equipment.findUnique({
    where: { characterId },
    select: { ring: true, necklace: true },
  });
  const bonuses = { ...EMPTY_BOOSTER_BONUSES };
  for (const item of [equipment?.ring ?? null, equipment?.necklace ?? null]) {
    if (!item?.boostType) continue;
    const t = item.boostType as BoostType;
    if (t in bonuses) bonuses[t] += Number(item.boostValue) || 0;
  }
  return bonuses;
}

// Soma boosters legados (UserBooster) + aneis/colares equipados no inventario
export async function getTotalBoosterBonuses(userId: string, characterId: string): Promise<BoosterBonuses> {
  const [legacy, items] = await Promise.all([
    getEquippedBoosterBonuses(userId),
    getEquippedItemBoosterBonuses(characterId),
  ]);
  const total = { ...EMPTY_BOOSTER_BONUSES };
  for (const t of BOOST_TYPES) total[t] = legacy[t] + items[t];
  return total;
}

export async function getGachaConfig() {
  return prisma.gachaConfig.findUnique({ where: { id: "gacha" } });
}

// Normaliza as chances (JSON) garantindo percentuais positivos
export function normalizeChances(chances: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (chances && typeof chances === "object") {
    for (const [rarity, value] of Object.entries(chances as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out[rarity] = n;
    }
  }
  return out;
}

// Rola uma raridade ponderada pelas chances configuradas
export function rollRarity(chances: unknown): string {
  const normalized = normalizeChances(chances);
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  if (total <= 0) return "common";
  let roll = Math.random() * total;
  for (const [rarity, chance] of Object.entries(normalized)) {
    roll -= chance;
    if (roll < 0) return rarity;
  }
  return BOOSTER_RARITIES[0];
}

export const SLOT_TYPES = ["ring", "necklace"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export const SLOT_LABELS: Record<SlotType, string> = {
  ring: "Anel",
  necklace: "Colar",
};

// Normaliza o peso Anel vs Colar garantindo valores positivos
export function normalizeSlotChances(chances: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (chances && typeof chances === "object") {
    for (const [slot, value] of Object.entries(chances as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out[slot] = n;
    }
  }
  return out;
}

// Sorteia o tipo do booster (Anel ou Colar) ponderado pela config
export function rollSlot(chances: unknown): SlotType {
  const normalized = normalizeSlotChances(chances);
  const total = Object.values(normalized).reduce((a, b) => a + b, 0);
  if (total <= 0) return SLOT_TYPES[0];
  let roll = Math.random() * total;
  for (const slot of SLOT_TYPES) {
    const weight = normalized[slot] ?? 0;
    roll -= weight;
    if (roll < 0) return slot;
  }
  return SLOT_TYPES[0];
}

// Sorteia um booster ativo de determinada raridade e tipo (Anel/Colar), null se não houver catálogo
export async function rollBooster(rarity: string, slot?: string) {
  const pool = await prisma.booster.findMany({
    where: { rarity, isActive: true, ...(slot ? { type: slot } : {}) },
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
