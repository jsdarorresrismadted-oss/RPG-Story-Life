import { CORE_STAT_KEYS, CoreStats, sumCoreStats } from "./stats/coreStats";

export const CORE_STAT_KEYS_ARRAY = CORE_STAT_KEYS;

// Força (CP) do personagem: soma das 6 stats base (classe + equipamentos) × nível.
// Reutiliza a mesma leitura de equipamento usada no perfil público (character.module.ts).
const EQUIP_SLOTS = ["weapon", "classItem", "helm", "armor", "cape", "ring", "necklace"] as const;

export function computeForce(params: {
  level: number;
  classCoreStats: Record<string, number> | null | undefined;
  equipment?: Array<Partial<CoreStats> | null | undefined> | null;
}): number {
  const base = emptyCoreStats();
  if (params.classCoreStats) {
    for (const key of CORE_STAT_KEYS) {
      base[key] += Number(params.classCoreStats[key]) || 0;
    }
  }
  const equip = sumCoreStats(params.equipment ?? []);
  const total = CORE_STAT_KEYS.reduce((acc: number, key: (typeof CORE_STAT_KEYS)[number]) => acc + base[key] + equip[key], 0);
  const level = Math.max(1, params.level || 1);
  return total * level;
}

export function emptyCoreStats(): CoreStats {
  return { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 };
}

export { EQUIP_SLOTS };
