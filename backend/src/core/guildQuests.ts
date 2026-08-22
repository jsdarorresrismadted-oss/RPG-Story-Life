import { prisma } from "./database";
import { markCollectItemsTemporary } from "./questItems";
import { applyCharacterXp, clampGold, isVipActive, VIP_XP_BONUS, VIP_GOLD_BONUS } from "./progression";
import { getGameLimits } from "./gameLimits";
import { grantPassXp } from "../modules/seasons/seasons.module";
import { AppError } from "./middleware/errorHandler";

// ===== Quests de guilda (geradas pelo sistema) =====
// Tipos: kill (matar mobs específicos) | collect (coletar drops de mobs) | pvp (vencer na arena).
// O jogador ganha GC + XP + ouro ao completar e resgatar a recompensa.

const QUEST_DURATION_MS = 24 * 60 * 60 * 1000;
const GUILD_QUEST_BASE = { gc: 50, xp: 1000, gold: 2000 };
const GUILD_QUEST_TARGETS = { kill: 10, collect: 5, pvp: 3 };
// Monstros de treino nunca podem virar quest de guilda
const GUILD_QUEST_EXCLUDED_MONSTERS = ["Dummy de Treino"];

function pick<T>(arr: T[]): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface QuestProgressEntry {
  count: number;
  claimed: boolean;
}

function readProgress(quest: any): Record<string, QuestProgressEntry> {
  const raw = quest?.progress;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, QuestProgressEntry>;
  }
  return {};
}

// Garante um lote de quests ativas para a guilda.
// - Regenera todo o lote a cada 24h (mesmo que sobrem quests incompletas);
// - Regenera imediatamente quando todas as quests do lote foram resgatadas;
// - Só usa monstros presentes em mapas e materiais dropados por eles.
export async function ensureGuildQuests(guildId: string, guildLevel = 1): Promise<void> {
  const now = new Date();
  const active = await prisma.guildQuest.findMany({ where: { guildId, isActive: true } });
  if (active.length > 0) {
    const batchStart = Math.min(...active.map((q) => q.createdAt.getTime()));
    const daily = now.getTime() - batchStart >= QUEST_DURATION_MS;
    const batchDone = active.every((q) => {
      const entries = Object.values(readProgress(q));
      return entries.some((e) => e?.claimed);
    });
    if (!daily && !batchDone) return;
    await prisma.guildQuest.updateMany({ where: { guildId, isActive: true }, data: { isActive: false } });
  }

  // Só monstros que estão em algum mapa; coleta só de materiais (consumable/material)
  const [monsters, monsterSources] = await Promise.all([
    prisma.monster.findMany({
      where: { isActive: true, mapMonsters: { some: {} }, NOT: { name: { in: GUILD_QUEST_EXCLUDED_MONSTERS } } },
      take: 50,
    }),
    prisma.monster.findMany({
      where: {
        isActive: true,
        mapMonsters: { some: {} },
        NOT: { name: { in: GUILD_QUEST_EXCLUDED_MONSTERS } },
        drops: { some: { item: { isActive: true, type: "consumable", subtype: "material" } } },
      },
      include: {
        drops: {
          where: { item: { isActive: true, type: "consumable", subtype: "material" } },
          include: { item: true },
        },
      },
      take: 30,
    }),
  ]);

  const lvl = Math.max(1, guildLevel);
  const xpReward = BigInt(GUILD_QUEST_BASE.xp * lvl);
  const goldReward = BigInt(GUILD_QUEST_BASE.gold * lvl);
  const gcReward = BigInt(GUILD_QUEST_BASE.gc * lvl);
  const expiresAt = new Date(Date.now() + QUEST_DURATION_MS);

  const quests: any[] = [];

  const killMonster = pick(monsters);
  if (killMonster) {
    quests.push({
      title: `Caçada: ${killMonster.name}`,
      description: `Derrote ${GUILD_QUEST_TARGETS.kill}x ${killMonster.name} para a glória da guilda.`,
      objectives: JSON.stringify([{ type: "kill", target: killMonster.name, count: GUILD_QUEST_TARGETS.kill }]),
      type: "kill",
      targetId: killMonster.id,
      targetName: killMonster.name,
      targetCount: GUILD_QUEST_TARGETS.kill,
      xpReward,
      goldReward,
      gcReward,
      expiresAt,
    });
  }

  const source = pick(monsterSources);
  const drop = source && source.drops.length > 0 ? pick(source.drops) : undefined;
  if (source && drop) {
    quests.push({
      title: `Coleta: ${drop.item.name}`,
      description: `Colete ${GUILD_QUEST_TARGETS.collect}x ${drop.item.name} derrotando ${source.name}.`,
      objectives: JSON.stringify([{ type: "collect", target: drop.item.name, count: GUILD_QUEST_TARGETS.collect }]),
      type: "collect",
      targetId: drop.itemId,
      targetName: drop.item.name,
      targetCount: GUILD_QUEST_TARGETS.collect,
      xpReward,
      goldReward,
      gcReward,
      expiresAt,
    });
  }

  quests.push({
    title: "Guerra na Arena",
    description: `Vença ${GUILD_QUEST_TARGETS.pvp}x lutas de PvP na Arena.`,
    objectives: JSON.stringify([{ type: "pvp", target: "Arena", count: GUILD_QUEST_TARGETS.pvp }]),
    type: "pvp",
    targetId: null,
    targetName: "Arena",
    targetCount: GUILD_QUEST_TARGETS.pvp,
    xpReward,
    goldReward,
    gcReward,
    expiresAt,
  });

  for (const q of quests) {
    if (q.type === "collect") await markCollectItemsTemporary(prisma, q.objectives);
    await prisma.guildQuest.create({ data: { guildId, ...q } });
  }
}

// Incrementa o progresso do jogador nas quests de guilda (kill/collect/pvp).
// Nunca lança erro: é chamado dentro do fluxo de combate.
export async function updateGuildQuestProgress(
  userId: string,
  type: "kill" | "collect" | "pvp",
  targetId: string | null,
  amount = 1
): Promise<void> {
  try {
    const membership = await prisma.guildMember.findFirst({ where: { userId } });
    if (!membership) return;
    const quests = await prisma.guildQuest.findMany({
      where: { guildId: membership.guildId, isActive: true, type },
    });
    const now = new Date();
    for (const quest of quests) {
      if (type !== "pvp" && quest.targetId !== targetId) continue;
      if (quest.expiresAt && quest.expiresAt < now) continue;
      const progress = readProgress(quest);
      const me = progress[userId] ?? { count: 0, claimed: false };
      if (me.claimed || me.count >= quest.targetCount) continue;
      me.count = Math.min(quest.targetCount, me.count + amount);
      progress[userId] = me;
      await prisma.guildQuest.update({ where: { id: quest.id }, data: { progress: progress as any } });
    }
  } catch {
    // nunca quebra o combate
  }
}

// Resgata as recompensas de uma quest de guilda concluída (GC + XP + ouro).
export async function claimGuildQuest(
  userId: string,
  guildId: string,
  questId: string
): Promise<{ gcGain: number; xpGain: number; goldGain: number; levelUps: number }> {
  const quest = await prisma.guildQuest.findUnique({ where: { id: questId } });
  if (!quest || quest.guildId !== guildId || !quest.isActive) throw new AppError(404, "Quest não encontrada");

  const progress = readProgress(quest);
  const me = progress[userId] ?? { count: 0, claimed: false };
  if (me.claimed) throw new AppError(400, "Recompensa já recebida");
  if (me.count < quest.targetCount) throw new AppError(400, "Quest ainda não concluída");

  const limits = await getGameLimits();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gold: true, vipUntil: true } });
  let xpGain = Number(quest.xpReward);
  let goldGain = Number(quest.goldReward);
  if (isVipActive(user)) {
    xpGain = Math.floor(xpGain * (1 + VIP_XP_BONUS));
    goldGain = Math.floor(goldGain * (1 + VIP_GOLD_BONUS));
  }
  const actualGold = clampGold(user?.gold ?? 0n, goldGain, BigInt(limits.maxGold));
  const gcGain = Number(quest.gcReward);

  let levelUps = 0;
  await prisma.$transaction(async (tx) => {
    await tx.guildQuest.update({
      where: { id: quest.id },
      data: { progress: { ...progress, [userId]: { count: me.count, claimed: true } } as any },
    });
    await tx.user.update({
      where: { id: userId },
      data: { gold: { increment: actualGold }, gc: { increment: gcGain }, experience: { increment: xpGain } },
    });
    const character = await tx.character.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (character) {
      const res = await applyCharacterXp(tx, character.id, xpGain, limits);
      levelUps = res.levelUps;
    }
    await grantPassXp(tx, userId, Math.floor(xpGain / 5));
  });

  return { gcGain, xpGain, goldGain: actualGold, levelUps };
}