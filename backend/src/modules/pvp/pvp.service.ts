import { PrismaClient } from "@prisma/client";
import { Battle, TICK_MS } from "../../core/classEngine/battle";
import { SkillDef } from "../../core/classEngine/types";
import { computeStats } from "../../core/classEngine/stat-calculator";
import { clampGold } from "../../core/progression";
import { updateGuildQuestProgress } from "../../core/guildQuests";
import { CombatService, serializeSkillForClient } from "../combat/combat.service";

const COOLDOWN_MS = 30 * 1000; // cooldown entre desafios na arena
const CHALLENGE_TTL_MS = 30 * 1000; // tempo para o desafiado aceitar/recusar
const SESSION_TTL_MS = 15 * 60 * 1000; // sessão PvE órfã expira após 15 min sem atualizações
const K_FACTOR = 32;
const PVP_COIN_REWARD = 1; // 1 PVP Coin por vitória (1 player morto)

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
    hitChance: stats.hitChance,
    penetration: stats.penetration,
    damageResistance: stats.damageResistance,
    physicalResistance: stats.physicalResistance,
    magicalResistance: stats.magicalResistance,
    dotPercent: stats.dotPercent,
    healingPercent: stats.healingPercent,
    overhealPercent: stats.overhealPercent,
    manaCostReduction: stats.manaCostReduction,
    cooldownReduction: stats.cooldownReduction,
    manaRegenPerTick: stats.manaRegenPerTick,
    healthRegenPerTick: stats.healthRegenPerTick,
  };
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

interface PendingChallenge {
  id: string;
  fromCharacterId: string;
  fromName: string;
  toCharacterId: string;
  toName: string;
  expiresAt: number;
  timeout: NodeJS.Timeout;
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
  challengerRank: number;
  opponentRank: number;
  challengerRating: number;
  opponentRating: number;
  challengerClassResource: Record<string, any>;
  opponentClassResource: Record<string, any>;
  startedAt: number;
  tickInterval: NodeJS.Timeout;
}

export class PvpService {
  private activeMatches: Map<string, ActiveMatch> = new Map();
  private pendingChallenges: Map<string, PendingChallenge> = new Map();
  private onUpdateListener: ((payload: any) => void) | null = null;

  constructor(
    private prisma: PrismaClient,
    private combatService: CombatService
  ) {}

  // Emite qualquer atualização de PvP para AMBOS os personagens da luta.
  setOnUpdate(listener: (payload: any) => void): void {
    this.onUpdateListener = listener;
  }

  private emitToBoth(entry: ActiveMatch, payload: any): void {
    if (!this.onUpdateListener) return;
    this.onUpdateListener({ ...payload, challengerCharacterId: entry.challengerCharacterId, opponentCharacterId: entry.opponentCharacterId });
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

  async getActiveMatch(characterId: string): Promise<ActiveMatch | undefined> {
    return Array.from(this.activeMatches.values()).find(
      (m) => (m.challengerCharacterId === characterId || m.opponentCharacterId === characterId) && m.battle.state === "active"
    );
  }

  getMatchByCharacter(characterId: string): ActiveMatch | undefined {
    return Array.from(this.activeMatches.values()).find(
      (m) => m.challengerCharacterId === characterId || m.opponentCharacterId === characterId
    );
  }

  private async ensureNotBusy(characterId: string): Promise<void> {
    if (this.getMatchByCharacter(characterId)?.battle.state === "active") {
      throw new Error("Esse personagem já está em uma luta de arena.");
    }
    const session = await this.prisma.combatSession.findFirst({
      where: { characterId, state: "active" },
    });
    if (!session) return;
    // Sessão órfã (raid/PvE abandonado, crash do servidor, etc): não bloqueia
    // indefinidamente — expira e é limpa.
    const stale = Date.now() - new Date(session.lastTickAt).getTime() > SESSION_TTL_MS;
    if (stale) {
      await this.prisma.combatSession.update({
        where: { id: session.id },
        data: { state: "lost", endedAt: new Date() },
      });
      return;
    }
    throw new Error("Esse personagem está em combate PvE.");
  }

  // ============ Desafio (pendente até o alvo aceitar) ============
async challenge(userId: string): Promise<any> {
    const me = await this.prisma.character.findFirst({ where: { userId } });
    if (!me) throw new Error("Personagem não encontrado.");

    const cooldownMs = me.lastArenaAt ? Date.now() - new Date(me.lastArenaAt).getTime() : COOLDOWN_MS;
    if (cooldownMs < COOLDOWN_MS) {
      const secs = Math.ceil((COOLDOWN_MS - cooldownMs) / 1000);
      throw new Error(`Arena em cooldown - aguarde ${secs}s.`);
    }

    const pool = await this.prisma.character.findMany({
      where: { user: { isBanned: false }, id: { not: me.id } },
      include: { user: true },
      take: 200,
    });
    if (pool.length === 0) throw new Error("Nenhum aventureiro disponível para duelar no momento.");
    const target = pool[Math.floor(Math.random() * pool.length)];

    await this.ensureNotBusy(me.id);
    await this.ensureNotBusy(target.id);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = setTimeout(() => this.pendingChallenges.delete(id), CHALLENGE_TTL_MS);
    this.pendingChallenges.set(id, {
      id,
      fromCharacterId: me.id,
      fromName: me.name,
      toCharacterId: target.id,
      toName: target.name,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      timeout,
    });

    return {
      challengeId: id,
      fromName: me.name,
      fromCharacterId: me.id,
      targetName: target.name,
      targetUserId: target.user.id,
      expiresInMs: CHALLENGE_TTL_MS,
    };
  }

  async getPendingChallenge(challengeId: string): Promise<PendingChallenge | undefined> {
    return this.pendingChallenges.get(challengeId);
  }

  async getPendingChallengeByTarget(characterId: string): Promise<PendingChallenge | undefined> {
    return Array.from(this.pendingChallenges.values()).find((p) => p.toCharacterId === characterId);
  }

  async getCharacterById(characterId: string): Promise<any | null> {
    return this.prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { id: true } } },
    });
  }

  // Resolve o desafio: aceita (inicia a luta manual) ou recusa (cancela).
  async respondChallenge(challengeId: string, responderCharacterId: string, accept: boolean): Promise<any> {
    const pending = this.pendingChallenges.get(challengeId);
    if (!pending) throw new Error("Desafio expirado ou já respondido.");
    clearTimeout(pending.timeout);
    this.pendingChallenges.delete(challengeId);

    if (pending.toCharacterId !== responderCharacterId) {
      throw new Error("Esse desafio não foi enviado para você.");
    }

    if (!accept) {
      return {
        accepted: false,
        challengeId,
        challengerCharacterId: pending.fromCharacterId,
        challengerName: pending.fromName,
        targetName: pending.toName,
      };
    }

    await this.ensureNotBusy(pending.fromCharacterId);
    await this.ensureNotBusy(pending.toCharacterId);

    const [challengerCtx, opponentCtx] = await Promise.all([
      this.combatService.buildPlayerContext(pending.fromCharacterId),
      this.combatService.buildPlayerContext(pending.toCharacterId),
    ]);
    const [challengerChar, opponentChar] = await Promise.all([
      this.prisma.character.findUnique({ where: { id: pending.fromCharacterId } }),
      this.prisma.character.findUnique({ where: { id: pending.toCharacterId } }),
    ]);

    const opponentMonster = buildOpponentMonster(opponentCtx);

    const battle = new Battle({
      characterId: pending.fromCharacterId,
      characterName: pending.fromName,
      characterLevel: challengerChar?.level ?? 1,
      statsInput: challengerCtx.statsInput,
      rank: challengerCtx.rank,
      skills: challengerCtx.skills,
      passives: challengerCtx.passives,
      effects: challengerCtx.effects,
      monster: opponentMonster,
      monsterSkills: opponentCtx.skills || [],
      classResource: parseJson(challengerCtx.gameClass?.resource, {}),
      defenderClassResource: parseJson(opponentCtx.gameClass?.resource, {}),
      pvp: true,
      pvpDefenderRank: opponentCtx.rank,
      autoPilot: false,
      onEnd: () => {},
      syncPlayerEffects: async () => {},
    });

    const entry: ActiveMatch = {
      battle,
      matchId: battle.id,
      challengerCharacterId: pending.fromCharacterId,
      opponentCharacterId: pending.toCharacterId,
      challengerSkills: challengerCtx.skills,
      opponentSkills: opponentCtx.skills || [],
      challengerName: pending.fromName,
      opponentName: pending.toName,
      challengerRank: challengerCtx.rank,
      opponentRank: opponentCtx.rank,
      challengerRating: challengerChar?.arenaRating ?? 0,
      opponentRating: opponentChar?.arenaRating ?? 0,
      challengerClassResource: parseJson(challengerCtx.gameClass?.resource, {}),
      opponentClassResource: parseJson(opponentCtx.gameClass?.resource, {}),
      startedAt: Date.now(),
      tickInterval: setInterval(() => this.tick(battle.id), TICK_MS),
    };
    this.activeMatches.set(battle.id, entry);

    await this.prisma.pvpMatch.create({
      data: {
        id: battle.id,
        challengerCharacterId: pending.fromCharacterId,
        opponentCharacterId: pending.toCharacterId,
        state: "active",
      },
    });

    const started = this.buildStartedPayload(entry);
    this.emitToBoth(entry, { ...started, type: "started" });
    return { accepted: true, ...started };
  }

  async cancelChallenge(challengeId: string, characterId: string): Promise<void> {
    const pending = this.pendingChallenges.get(challengeId);
    if (!pending) return;
    if (pending.fromCharacterId !== characterId) throw new Error("Você não pode cancelar esse desafio.");
    clearTimeout(pending.timeout);
    this.pendingChallenges.delete(challengeId);
  }

  // ============ Ações durante a luta (controle manual) ============
  private sideOf(entry: ActiveMatch, characterId: string): "player" | "monster" {
    return entry.challengerCharacterId === characterId ? "player" : "monster";
  }

  async useSkill(characterId: string, matchId: string, skillId: string): Promise<any> {
    const entry = this.activeMatches.get(matchId);
    if (!entry) throw new Error("Luta de arena não encontrada.");
    if (entry.challengerCharacterId !== characterId && entry.opponentCharacterId !== characterId) {
      throw new Error("Você não participa dessa luta.");
    }
    if (entry.battle.state !== "active") throw new Error("A luta já terminou.");

    const side = this.sideOf(entry, characterId);
    const skills = side === "player" ? entry.challengerSkills : entry.opponentSkills;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) throw new Error("Skill não encontrada.");

    const result = entry.battle.useSkillFor(side, skill);
    if (!result.ok) throw new Error(result.error || "Não foi possível usar a skill.");
    return {
      matchId,
      side,
      ok: true,
      damage: result.damage,
      healed: result.healed,
      isCritical: result.isCritical,
      isMissed: result.isMissed ?? false,
      isDodged: result.isDodged,
      appliedEffects: result.appliedEffects,
      removedEffects: result.removedEffects,
      consumedStacks: result.consumedStacks,
      messages: result.messages,
      events: entry.battle.takeEvents(),
      channeling: result.channeling,
      channelMs: result.channelMs,
      cooldownMs: result.cooldownMs,
      cooldowns: entry.battle.cooldownInfoFor(side),
    };
  }

  async useItem(characterId: string, matchId: string, heal: number, mana: number): Promise<any> {
    const entry = this.activeMatches.get(matchId);
    if (!entry) throw new Error("Luta de arena não encontrada.");
    if (entry.challengerCharacterId !== characterId && entry.opponentCharacterId !== characterId) {
      throw new Error("Você não participa dessa luta.");
    }
    if (entry.battle.state !== "active") throw new Error("A luta já terminou.");

    const side = this.sideOf(entry, characterId);
    entry.battle.useItemFor(side, heal, mana);
    return { matchId, side, ok: true, healed: heal, manaRestored: mana, events: entry.battle.takeEvents() };
  }

  async flee(characterId: string, matchId: string): Promise<any> {
    const entry = this.activeMatches.get(matchId);
    if (!entry) throw new Error("Luta de arena não encontrada.");
    if (entry.challengerCharacterId !== characterId && entry.opponentCharacterId !== characterId) {
      throw new Error("Você não participa dessa luta.");
    }
    if (entry.battle.state !== "active") throw new Error("A luta já terminou.");

    // Fuga: quem fugiu perde
    const loserIsChallenger = entry.challengerCharacterId === characterId;
    const winnerId = loserIsChallenger ? entry.opponentCharacterId : entry.challengerCharacterId;
    const state = loserIsChallenger ? "challenger_loss" : "challenger_win";
    clearInterval(entry.tickInterval);
    this.activeMatches.delete(matchId);
    const result = await this.endMatch(entry, state, winnerId, true);

    const snap = entry.battle.snapshot();
    this.emitToBoth(entry, {
      type: "ended",
      state: loserIsChallenger ? "lost" : "won",
      won: !loserIsChallenger,
      messages: ["Um dos combatentes abandonou a arena."],
      ...result,
      challengerHp: snap.characterHp,
      challengerMaxHp: snap.maxHp,
      opponentHp: snap.monsterHp,
      opponentMaxHp: snap.monsterMaxHp,
    });
    return { state: "fled", message: "Você abandonou a arena." };
  }

  // ============ Tick / fim de luta ============
  private tick(matchId: string): void {
    const entry = this.activeMatches.get(matchId);
    if (!entry) return;

    try {
      entry.battle.tick();
    } catch (err) {
      console.error(`[pvp] tick error (${matchId}):`, err);
      clearInterval(entry.tickInterval);
      this.activeMatches.delete(matchId);
      this.emitToBoth(entry, {
        type: "ended",
        state: "error",
        messages: ["A luta travou por um erro interno."],
      });
      return;
    }

    const snap = entry.battle.snapshot();
    const payload = {
      type: "tick",
      matchId,
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
      challengerCooldowns: entry.battle.cooldownInfoFor("player"),
      opponentCooldowns: entry.battle.cooldownInfoFor("monster"),
      messages: snap.messages,
      events: snap.events,
      state: entry.battle.state === "active" ? "active" : entry.battle.state,
    };

    if (entry.battle.state !== "active") {
      clearInterval(entry.tickInterval);
      this.activeMatches.delete(matchId);

      const won = entry.battle.state === "won";
      const winnerId = won ? entry.challengerCharacterId : entry.opponentCharacterId;
      const state = won ? "challenger_win" : "challenger_loss";
      this.endMatch(entry, state, winnerId, false).then((result) => {
        this.emitToBoth(entry, { ...payload, type: "ended", ...result, state: won ? "won" : "lost" });
      });
      return;
    }

    this.emitToBoth(entry, payload);
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
          data: { gold: { increment: actual }, pvpCoins: { increment: PVP_COIN_REWARD } },
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

    if (winnerId) {
      const winnerChar = await this.prisma.character.findUnique({ where: { id: winnerId } });
      if (winnerChar) {
        await updateGuildQuestProgress(winnerChar.userId, "pvp", null);
      }
    }

    return {
      won: winnerIsChallenger,
      ratingDelta: delta,
      goldReward,
      pvpCoinReward: PVP_COIN_REWARD,
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
      challengerName: entry.challengerName,
      opponentName: entry.opponentName,
      opponentLevel: entry.battle.monster.level,
      challengerRating: entry.challengerRating,
      opponentRating: entry.opponentRating,
      challengerSkills: entry.challengerSkills.map((s) => serializeSkillForClient(s, entry.battle.getSkillModifiersFor(s.slug))),
      opponentSkills: entry.opponentSkills.map((s) => serializeSkillForClient(s, entry.battle.getSkillModifiersFor(s.slug))),
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
