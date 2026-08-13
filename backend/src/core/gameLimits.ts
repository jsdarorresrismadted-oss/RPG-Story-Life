import { prisma } from "./database";

export interface GameLimits {
  maxLevel: number;
  maxGold: number;
  maxSfCoins: number;
  xpPerLevel: number;
}

export const DEFAULT_GAME_LIMITS: GameLimits = {
  maxLevel: 150,
  maxGold: 50_000_000,
  maxSfCoins: 1_000_000,
  xpPerLevel: 1250,
};

let cached: GameLimits | null = null;

export async function getGameLimits(): Promise<GameLimits> {
  if (cached) return cached;
  const row = await prisma.systemConfig.findUnique({ where: { key: "limits" } });
  cached = { ...DEFAULT_GAME_LIMITS, ...(row?.value as object | undefined) };
  return cached;
}

export function invalidateGameLimits(): void {
  cached = null;
}
