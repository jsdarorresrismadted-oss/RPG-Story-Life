import { PrismaClient } from "@prisma/client";
import { Battle, TICK_MS } from "../../core/classEngine/battle";
import { SkillDef } from "../../core/classEngine/types";
import { computeStats } from "../../core/classEngine/stat-calculator";
import { clampGold } from "../../core/progression";
import { CombatService, serializeSkillForClient } from "../combat/combat.service";

const COOLDOWN_MS = 30 * 1000; // cooldown entre desafios na arena
const K_FACTOR = 32;

function parseJson(value: any, fallback: any = null): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Monta o "monstro" do PvP a partir do personagem real do oponente:
// as stats derivadas (via mesma fórmula do jogador) viram as stats do adversário.
function buildOpponentMonster(context: any): any {
  const stats = computeStats(context.statsInput);
  return {
    id: context.character.id,
    name: context.character.name,
    level: context.character.level,
    hp: stats.hp,
    mana: stats.mana,
    attack: stats.attackPower,
    defense: stats.defense,
    magic: stats.spellPower,
    magicDefense: stats.magicDefense,
    speed: stats.speed,
    criticalChance: stats.critChance,
    criticalDamage: stats.critDamage,
    dodge: stats.dodge,
    attackSpeed: stats.attackSpeedMs,
  };
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

interface ActiveMatch {
  battle: Battle;
  matchId: string;
  challengerCharacterId: string;
  opponentCharacterId: string;
  challengerSkills: SkillDef[];
  opponentSkills: SkillDef[];
  challengerName: string;
  opponentName: string;
  challengerRating: number;
  opponentRating: number;
  startedAt: number;
  tickInterval: NodeJS.Timeout;
}

export class PvpService {
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private onTickListener: ((payload: any) => void) | null = null;

  constructor(
    private prisma: PrismaClient,
    private combatService: CombatService
  ) {}

  setOnTick(listener: (payload: any) => void): void {
    this.onTickListener = listener;
  }

  async getMyStats(userId: string): Promise<any | null> {
    const character = await this.prisma.character.findFirst({
      where: { userId },
      include: { class: true },
      orderBy: { createdAt: "asc" },
    });
    if (!character) return null;
    return {
      id: character.id,
      name: character.name,
      level: character.level,
      className: character.class?.name || "",
      arenaRating: character.arenaRating,
      arenaWins: character.arenaWins,
      arenaLosses: character.arenaLosses,
      pvpKills: character.pvpKills,
    };
  }

  async listOpponents(userId: string): Promise<any[]> {
    const my = await this.prisma.character.findFirst({ where: { userId } });
    if (!my) return [];

    const characters = await this.prisma.character.findMany({
      where: {
        user: { isBanned: false },
        id: { not: my.id },
      },
      include: { class: true, user: { select: { username: true } } },
      orderBy: { arenaRating: "desc" },
      take: 200,
    });

    // Ordena por proximidade de rating com o desafiante (mais próximos primeiro)
    return characters
      .map((c) => ({
        id: c.id,
        name: c.name,
        username: c.user?.username || "",
        level: c.level,
        className: c.class?.name || "",
        arenaRating: c.arenaRating,
        arenaWins: c.arenaWins,
        arenaLosses: c.arenaLosses,
        distance: Math.abs(c.arenaRating - my.arenaRating),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15);
  }

  async getActiveMatch(userId: string): Promise<ActiveMatch | undefined> {
    return Array.from(this.activeMatches.values()).find(
      (m) => (m.challengerCharacterId === userId || m.opponentCharacterId === userId) && m.battle.state === "active"
    );
  }

  private async ensureNotBusy(characterId: string): Promise<void> {
    if (Array.from(this.activeMatches.values()).some((m) => (m.challengerCharacterId === characterId || m.opponentCharacterId === characterId) && m.battle.state === "active")) {
      throw new Error("Esse personagem já está em uma luta de arena.");
    }
    const session = await this.prisma.combatSession.findFirst({
      where: { characterId, state: "active" },
    });
    if (session) throw new Error("Esse personagem está em combate PvE.");
  }

  async challenge(userId: string, targetCharacterId: string): Promise<any> {
    const me = await this.prisma.character.findFirst({ where: { userId } });
    if (!me) throw new Error("Personagem não encontrado.");
    if (me.id === targetCharacterId) throw new Error("Você não pode desafiar a si mesmo.");

    const cooldownMs = me.lastArenaAt ? Date.now() - new Date(me.lastArenaAt).getTime() : COOLDOWN_MS;
    if (cooldownMs < COOLDOWN_MS) {
      const secs = Math.ceil((COOLDOWN_MS - cooldownMs) / 1000);
      throw new Error(`Arena em cooldown — aguarde ${secs}s.`);
    }

    const target = await this.prisma.character.findUnique({
      where: { id: targetCharacterId },
      include: { user: true },
    });
    if (!target || !target.user) throw new Error("Aventureiro não encontrado.");

    await this.ensureNotBusy(me.id);
    await this.ensureNotBusy(target.id);

    const [myCtx, oppCtx] = await Promise.all([
      this.combatService.buildPlayerContext(me.id),
      this.combatService.buildPlayerContext(target.id),
    ]);

    const opponentMonster = buildOpponentMonster(oppCtx);

    const battle = new Battle({
      characterId: me.id,
      characterName: me.name,
      characterLevel: me.level,
      statsInput: myCtx.statsInput,
      rank: myCtx.rank,
      skills: myCtx.skills,
      passives: myCtx.passives,
      effects: myCtx.effects,
      monster: opponentMonster,
      monsterSkills: (oppCtx.skills || []).slice(0, 4),
      classResource: parseJson(myCtx.gameClass?.resource, {}),
      autoPilot: true,
      onEnd: () => {},
      syncPlayerEffects: async () => {},
    });

    const entry: ActiveMatch = {
      battle,
      matchId: battle.id,
      challengerCharacterId: me.id,
      opponentCharacterId: target.id,
      challengerSkills: myCtx.skills,
      opponentSkills: (oppCtx.skills || []).slice(0, 4),
      challengerName: me.name,
      opponentName: target.name,
      challengerRating: me.arenaRating,
      opponentRating: target.arenaRating,
      startedAt: Date.now(),
      tickInterval: setInterval(() => this.tick(battle.id), TICK_MS),
    };
    this.activeMatches.set(battle.id, entry);

    await this.prisma.pvpMatch.create({
      data: {
        id: battle.id,
        challengerCharacterId: me.id,
        opponentCharacterId: target.id,
        state: "active",
      },
    });

    return this.buildStartedPayload(entry);
  }

  async flee(userId: string, matchId: string): Promise<any> {
    const entry = this.activeMatches.get(matchId);
    if (!entry) throw new Error("Luta de arena não encontrada.");
    if (entry.challengerCharacterId !== userId && entry.opponentCharacterId !== userId) {
      throw new Error("Você não participa dessa luta.");
    }
    if (entry.battle.state !== "active") throw new Error("A luta já terminou.");

    // Fuga: quem fugiu perde
    const loserIsChallenger = entry.challengerCharacterId === userId;
    const winnerId = loserIsChallenger ? entry.opponentCharacterId : entry.challengerCharacterId;
    const state = loserIsChallenger ? "challenger_loss" : "challenger_win";
    clearInterval(entry.tickInterval);
    this.activeMatches.delete(matchId);
    const result = await this.endMatch(entry, state, winnerId, true);

    if (this.onTickListener) {
      const snap = entry.battle.snapshot();
      this.onTickListener({
        matchId,
        challengerCharacterId: entry.challengerCharacterId,
        opponentCharacterId: entry.opponentCharacterId,
        challengerName: entry.challengerName,
        opponentName: entry.opponentName,
        challengerHp: snap.characterHp,
        challengerMaxHp: snap.maxHp,
        opponentHp: snap.monsterHp,
        opponentMaxHp: snap.monsterMaxHp,
        messages: ["Um dos combatentes abandonou a arena."],
        state: winnerId === entry.challengerCharacterId ? "won" : "lost",
        ...result,
      });
    }
    return { state: "fled", message: "Você abandonou a arena." };
  }

  private tick(matchId: string): void {
    const entry = this.activeMatches.get(matchId);
    if (!entry) return;

    try {
      entry.battle.tick();
    } catch (err) {
      console.error(`[pvp] tick error (${matchId}):`, err);
      clearInterval(entry.tickInterval);
      this.activeMatches.delete(matchId);
      if (this.onTickListener) {
        this.onTickListener({
          matchId,
          state: "error",
          challengerCharacterId: entry.challengerCharacterId,
          opponentCharacterId: entry.opponentCharacterId,
          messages: ["A luta travou por um erro interno."],
        });
      }
      return;
    }

    const snap = entry.battle.snapshot();
    const payload = {
      matchId,
      challengerCharacterId: entry.challengerCharacterId,
      opponentCharacterId: entry.opponentCharacterId,
      challengerName: entry.challengerName,
      opponentName: entry.opponentName,
      challengerHp: snap.characterHp,
      challengerMaxHp: snap.maxHp,
      challengerMana: snap.characterMana,
      challengerMaxMana: snap.maxMana,
      opponentHp: snap.monsterHp,
      opponentMaxHp: snap.monsterMaxHp,
      opponentMana: entry.battle.monster.mana,
      opponentMaxMana: entry.battle.monster.maxMana,
      challengerEffects: snap.playerEffects,
      opponentEffects: snap.monsterEffects,
      messages: snap.messages,
      state: entry.battle.state === "active" ? "active" : entry.battle.state,
    };

    if (entry.battle.state !== "active") {
      clearInterval(entry.tickInterval);
      this.activeMatches.delete(matchId);

      const won = entry.battle.state === "won";
      const winnerId = won ? entry.challengerCharacterId : entry.opponentCharacterId;
      const state = won ? "challenger_win" : "challenger_loss";
      this.endMatch(entry, state, winnerId, false).then((result) => {
        if (this.onTickListener) {
          this.onTickListener({ ...payload, ...result, state: won ? "won" : "lost" });
        }
      });
      return;
    }

    if (this.onTickListener) {
      this.onTickListener(payload);
    }
  }

  private async endMatch(
    entry: ActiveMatch,
    state: string,
    winnerId: string,
    isFlee: boolean
  ): Promise<Record<string, any>> {
    const winnerIsChallenger = winnerId === entry.challengerCharacterId;
    const winnerRating = winnerIsChallenger ? entry.challengerRating : entry.opponentRating;
    const loserRating = winnerIsChallenger ? entry.opponentRating : entry.challengerRating;

    const expected = expectedScore(winnerRating, loserRating);
    const delta = Math.max(1, Math.round(K_FACTOR * (1 - expected)));

    // Ouro para o vencedor: base + bônus por superar alguém de rating maior
    const goldReward = 100 + Math.max(0, Math.round((loserRating - winnerRating) / 10));

    await this.prisma.$transaction(async (tx) => {
      const winner = await tx.character.findUnique({ where: { id: winnerId } });

      await tx.character.update({
        where: { id: winnerId },
        data: {
          arenaRating: { increment: delta },
          arenaWins: { increment: 1 },
          pvpKills: { increment: 1 },
          lastArenaAt: new Date(),
        },
      });
      await tx.character.update({
        where: { id: winnerIsChallenger ? entry.opponentCharacterId : entry.challengerCharacterId },
        data: {
          arenaRating: { decrement: delta },
          arenaLosses: { increment: 1 },
          lastArenaAt: new Date(),
        },
      });

      const user = await tx.user.findUnique({
        where: { id: winner ? winner.userId : "" },
        select: { gold: true },
      });
      if (winner && user) {
        const actual = clampGold(user.gold, goldReward, BigInt(10_000_000_000));
        await tx.user.update({
          where: { id: winner.userId },
          data: { gold: { increment: actual } },
        });
      }

      await tx.pvpMatch.update({
        where: { id: entry.matchId },
        data: {
          state,
          winnerCharacterId: winnerId,
          ratingDelta: delta,
          endedAt: new Date(),
        },
      });
    });

    return {
      won: winnerIsChallenger,
      ratingDelta: delta,
      goldReward,
      challengerRating: winnerIsChallenger ? winnerRating + delta : winnerRating - delta,
      opponentRating: winnerIsChallenger ? loserRating - delta : loserRating + delta,
      fled: isFlee,
    };
  }

  private buildStartedPayload(entry: ActiveMatch): any {
    const snap = entry.battle.snapshot();
    const stats = entry.battle.player.stats;
    return {
      matchId: entry.matchId,
      challengerCharacterId: entry.challengerCharacterId,
      opponentCharacterId: entry.opponentCharacterId,
      challengerName: entry.challengerName,
      opponentName: entry.opponentName,
      opponentLevel: entry.battle.monster.level,
      challengerRating: entry.challengerRating,
      opponentRating: entry.opponentRating,
      skills: entry.challengerSkills.map((s) => serializeSkillForClient(s, entry.battle.getSkillModifiersFor(s.slug))),
      stats: {
        hp: stats.hp,
        mana: stats.mana,
        attack: stats.attack,
        defense: stats.defense,
        magic: stats.magic,
        magicDefense: stats.magicDefense,
        speed: stats.speed,
        attackPower: stats.attackPower,
        spellPower: stats.spellPower,
        critChance: stats.critChance,
        critDamage: stats.critDamage,
        dodge: stats.dodge,
        attackSpeedMs: stats.attackSpeedMs,
      },
      state: "active",
      challengerHp: snap.characterHp,
      challengerMaxHp: snap.maxHp,
      challengerMana: snap.characterMana,
      challengerMaxMana: snap.maxMana,
      opponentHp: snap.monsterHp,
      opponentMaxHp: snap.monsterMaxHp,
      opponentMana: entry.battle.monster.mana,
      opponentMaxMana: entry.battle.monster.maxMana,
      challengerEffects: snap.playerEffects,
      opponentEffects: snap.monsterEffects,
    };
  }
}
