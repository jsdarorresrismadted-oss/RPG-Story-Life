import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { CooldownManager } from "./cooldown.manager";
import { getGameLimits } from "../../core/gameLimits";
import { applyCharacterXp, clampGold, grantClassXp, addItemsToInventory } from "../../core/progression";
import { Battle, TICK_MS } from "../../core/classEngine/battle";
import { SkillDef, PassiveDef, EffectDef, ActiveEffectRuntime } from "../../core/classEngine/types";
import { StatsInput } from "../../core/classEngine/stat-calculator";
import { sumCoreStats } from "../../core/stats/coreStats";
import { computeEnchantmentStats, computeEnchantmentValues, effectiveWeaponDps, effectiveWeaponSpeed } from "../../core/enchantments/enchantmentStats";
import { hasAnyItemStat, minEquipmentStats } from "../../core/items/itemAutoStats";
import { grantPassXp } from "../seasons/seasons.module";
import { isVipActive, VIP_XP_BONUS, VIP_GOLD_BONUS } from "../../core/progression";
import { getTotalBoosterBonuses } from "../../core/boosters";
import { updateGuildQuestProgress } from "../../core/guildQuests";
import { RaidService } from "../raid/raid.service";

function parseJson(value: any, fallback: any = null): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asActionArray(value: any): any[] {
  const arr = parseJson(value, []);
  return Array.isArray(arr) ? arr : [];
}

function parseSkill(s: any): SkillDef {
  return {
    id: s.id || s.slug || `monster-skill-${Math.random().toString(36).slice(2, 8)}`,
    name: s.name,
    slug: s.slug || s.id,
    description: s.description || "",
    icon: s.icon || null,
    iconSecondary: s.iconSecondary || null,
    kind: s.kind || "attack",
    trigger: s.trigger || "active",
    target: s.target || "enemy",
    cooldown: Number(s.cooldown) || 0,
    manaCost: Number(s.manaCost) || 0,
    castTime: Number(s.castTime) || 0,
    channelMs: Number(s.channelMs) || 0,
    rankRequired: Number(s.rankRequired) || 1,
    scaling: asActionArray(s.scaling),
    actions: asActionArray(s.actions),
    conditions: asActionArray(s.conditions),
    onConditionMet: asActionArray(s.onConditionMet),
    events: asActionArray(s.events),
  };
}

function parsePassive(p: any): PassiveDef {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug || p.id,
    description: p.description || "",
    rankRequired: Number(p.rankRequired) || 1,
    statModifiers: parseJson(p.statModifiers, {}),
    skillModifiers: asActionArray(p.skillModifiers),
    effectModifiers: asActionArray(p.effectModifiers),
    conditions: asActionArray(p.conditions),
    events: asActionArray(p.events),
    type: p.type || "permanente",
    internalCooldownMs: Number(p.internalCooldownMs) || 0,
  };
}

function parseEffect(e: any): EffectDef {
  const shield = parseJson(e.shield, null);
  const reflect = parseJson(e.reflect, null);
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    description: e.description || "",
    icon: e.icon || null,
    kind: e.kind || "buff",
    category: e.category || "utility",
    maxStacks: Number(e.maxStacks) || 1,
    duration: Number(e.duration) || 0,
    refreshBehavior: e.refreshBehavior || "refresh",
    stackGrowth: e.stackGrowth || "linear",
    stackGrowthRate: Number(e.stackGrowthRate) > 1 ? Number(e.stackGrowthRate) : 1.15,
    nukeHitChancePenalty: Number(e.nukeHitChancePenalty) > 0 ? Number(e.nukeHitChancePenalty) : 1,
    stackLoss: parseJson(e.stackLoss, {}),
    priority: Number(e.priority) || 0,
    tickInterval: Number(e.tickInterval) || 0,
    tickDamage: parseJson(e.tickDamage, {}),
    tickHealing: parseJson(e.tickHealing, {}),
    statModifiers: parseJson(e.statModifiers, {}),
    shield: shield && (Number(shield.base) > 0 || (Array.isArray(shield.scaling) && shield.scaling.length > 0)) ? shield : undefined,
    reflect: reflect && Number(reflect.percent) > 0 ? { percent: Number(reflect.percent) } : undefined,
    hitkillChance: Number(e.hitkillChance) > 0 ? Number(e.hitkillChance) : undefined,
    onMaxStacks: asActionArray(e.onMaxStacks),
    onExpire: asActionArray(e.onExpire),
    onTick: asActionArray(e.onTick),
    exclusiveGroup: e.exclusiveGroup || null,
  };
}

export function serializeSkillForClient(s: SkillDef, mods: { damagePercent?: number; healPercent?: number } | null): any {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    icon: s.icon,
    iconSecondary: s.iconSecondary,
    kind: s.kind,
    trigger: s.trigger,
    type: s.trigger,
    target: s.target,
    cooldown: s.cooldown,
    manaCost: s.manaCost,
    castTime: s.castTime,
    channelMs: s.channelMs,
    rankRequired: s.rankRequired,
    sortOrder: 0,
    scaling: s.scaling,
    actions: s.actions,
    conditions: s.conditions,
    requirements: s.conditions && s.conditions.length > 0 ? s.conditions.map((c: any) => c.type) : [],
    healingBase: s.actions.some((a: any) => a.action === "heal") ? 1 : 0,
    damageModifier: mods?.damagePercent || 0,
    healModifier: mods?.healPercent || 0,
  };
}

interface ActiveCombat {
  battle: Battle;
  characterId: string;
  characterName: string;
  characterLevel: number;
  monsterId: string;
  monster: any;
  skills: SkillDef[];
  monsterSkills: SkillDef[];
  state: "active" | "won" | "lost" | "fled" | "error";
  characterHp: number;
  characterMana: number;
  monsterHp: number;
  startTime: number;
  tickInterval: NodeJS.Timeout;
    raid?: { mapId: string; mapName: string; stage: number; wave: number; totalWaves: number; isBoss: boolean; boss?: boolean; monstersTotal: number; cleared?: boolean };
  raidRunId?: string;
}

const SESSION_TTL_MS = 15 * 60 * 1000; // sessão de combate expira após 15 min sem atualizações

export class CombatService {
  private activeCombats: Map<string, ActiveCombat> = new Map();
  private onTickListener: ((payload: any) => void) | null = null;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private raidService?: RaidService
  ) {}

  setOnTick(listener: (payload: any) => void): void {
    this.onTickListener = listener;
  }

  async buildPlayerContext(characterId: string): Promise<{
    character: any;
    gameClass: any;
    rank: number;
    skills: SkillDef[];
    passives: PassiveDef[];
    effects: EffectDef[];
    coreStats: any;
    boosterBonuses: any;
    statsInput: StatsInput;
  }> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      include: {
        class: {
          include: {
            statModel: true,
            skills: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            passives: { where: { isActive: true }, orderBy: { rankRequired: "asc" } },
          },
        },
        equipment: {
          include: {
            weapon: { include: { enchantment: true } },
            classItem: { include: { enchantment: true } },
            helm: { include: { enchantment: true } },
            armor: { include: { enchantment: true } },
            cape: { include: { enchantment: true } },
            ring: { include: { enchantment: true } },
            necklace: { include: { enchantment: true } },
          },
        },
        classProgress: { where: { isActive: true } },
      },
    });

    if (!character) throw new Error("Personagem não encontrado");
    const gameClass = character.class;
    if (!gameClass) throw new Error("Personagem sem classe");

    const rank = character.classProgress?.[0]?.rank ?? 1;

    // Catálogo de efeitos (para skills que aplicam por slug)
    const effectRows = await this.prisma.effect.findMany({ where: { isActive: true } });
    const effects: EffectDef[] = effectRows.map(parseEffect);

    const skills: SkillDef[] = (gameClass.skills || []).map(parseSkill);
    const passives: PassiveDef[] = (gameClass.passives || [])
      .filter((p: any) => (p.rankRequired ?? 1) <= rank)
      .map(parsePassive);

    // Core Stats de equipamento — o encantamento SUBSTITUI os valores do item:
    // sem encantamento, soma os valores do item; encantado, vale o encantamento
    // (todos os atributos 2, atributo forte 4 — fórmulas de progressão).
    // Elmo/armadura/capa sem atributos (item antigo) recebem o MÍNIMO por nível.
    const coreStats = sumCoreStats([
      ...["weapon", "classItem", "helm", "armor", "cape", "ring", "necklace"].map((slot) => {
        const item = (character.equipment as any)?.[slot];
        if (!item) return null;
        const src = item.enchantment
          ? computeEnchantmentStats(item.enchantment)
          : ["helm", "armor", "cape"].includes(String(item.type)) && !hasAnyItemStat(item)
            ? minEquipmentStats(character.level)
            : item;
        return {
          strength: src.strength ?? 0,
          intellect: src.intellect ?? 0,
          endurance: src.endurance ?? 0,
          dexterity: src.dexterity ?? 0,
          wisdom: src.wisdom ?? 0,
          luck: src.luck ?? 0,
        };
      }),
    ]);

    // Boosters equipados do jogador (anel/colar): dano e defesa entram no combate
    const boosterBonuses = await getTotalBoosterBonuses(character.userId, character.id);

    const weapon = (character.equipment as any)?.weapon;
    const statsInput: StatsInput = {
      level: character.level,
      statModel: {
        coreStats: parseJson(gameClass.statModel?.coreStats, {}),
        bonuses: {
          damageBoost: boosterBonuses.damage,
          defenseBoost: boosterBonuses.defense,
        },
      },
      resource: parseJson(gameClass.resource, {}),
      passives,
      coreStats,
      attackSpeedMs: effectiveWeaponSpeed(weapon),
      weaponDps: effectiveWeaponDps(weapon, character.level),
    };

    return { character, gameClass, rank, skills, passives, effects, coreStats, boosterBonuses, statsInput };
  }

  private parseMonsterSkills(monster: any): SkillDef[] {
    return (asActionArray(monster.skills) || []).slice(0, 4).map(parseSkill);
  }

  // Monta o battle a partir do monstro de contexto (normal do banco OU onda de
// raid). Em ondas multi-inimigo, `enemies` carrega as criaturas reais no campo.
  private async createBattle(characterId: string, monster: any, enemies?: any[]): Promise<{
    character: any;
    gameClass: any;
    monster: any;
    rank: number;
    skills: SkillDef[];
    monsterSkills: SkillDef[];
    battle: Battle;
  }> {
    const { character, gameClass, rank, skills, passives, effects, statsInput } = await this.buildPlayerContext(characterId);

    const monsterSkills: SkillDef[] = this.parseMonsterSkills(monster);

    const battle = new Battle({
      characterId: character.id,
      characterName: character.name,
      characterLevel: character.level,
      statsInput,
      rank,
      skills,
      passives,
      effects,
      monster,
      enemies,
      monsterSkills,
      classResource: parseJson(gameClass.resource, {}),
      onEnd: (state) => {
        const entry = this.activeCombats.get(battle.id);
        if (entry) entry.state = state;
      },
      syncPlayerEffects: async (runtimeEffects: ActiveEffectRuntime[]) => {
        await this.syncPlayerEffects(character.id, runtimeEffects);
      },
    });

    return { character, gameClass, monster, rank, skills, monsterSkills, battle };
  }

  private raidContextFromMonster(monster: any): ActiveCombat["raid"] {
      const r = monster?.raid;
      if (!r) return undefined;
      return {
        mapId: String(r.mapId || ""),
        mapName: String(r.mapName || ""),
        stage: Number(r.stage) || 0,
        wave: Number(r.wave) || 1,
        totalWaves: Number(r.totalWaves) || 10,
        isBoss: !!r.isBoss,
        boss: !!r.isBoss,
        monstersTotal: Number(r.monstersTotal) || 1,
      };
    }

  private async loadCombatContext(characterId: string, monsterId: string): Promise<any> {
    // Raid: monstro sintético raid:{mapId}:{stage} — monta a onda do estágio.
    const raidStage = this.raidService?.parseMonsterId(monsterId);
    if (raidStage) {
      const wave = await this.raidService!.buildWaveFor(raidStage.mapId, raidStage.stage);
      const monster = this.raidService!.buildContextMonster(wave);
      const ctx = await this.createBattle(characterId, monster, wave.monsters.length > 1 ? wave.monsters : undefined);
      return { ...ctx, raid: this.raidContextFromMonster(monster), raidRunId: undefined };
    }

    const monster = await this.prisma.monster.findUnique({
      where: { id: monsterId },
    });
    if (!monster) throw new Error("Monstro não encontrado");

    const ctx = await this.createBattle(characterId, monster);
    return { ...ctx, raid: undefined, raidRunId: undefined };
  }

  private buildEntry(battle: Battle, character: any, monster: any, skills: SkillDef[], monsterSkills: SkillDef[]): ActiveCombat {
    return {
      battle,
      characterId: character.id,
      characterName: character.name,
      characterLevel: character.level,
      monsterId: monster.id,
      monster,
      skills,
      monsterSkills,
      state: "active",
      characterHp: battle.player.hp,
      characterMana: battle.player.mana,
      monsterHp: monster.hp,
      startTime: Date.now(),
      tickInterval: setInterval(() => this.tick(battle.id), TICK_MS),
    };
  }

  private buildStartedPayload(battle: Battle, entry: ActiveCombat, skills: SkillDef[], character: any, resumed = false, waveCleared = false): any {
    const snap = battle.snapshot();
    const stats = battle.player.stats;

    return {
      combatId: battle.id,
      characterId: character.id,
      characterName: character.name,
      characterLevel: character.level,
      monsterId: entry.monster.id,
      monsterName: entry.monster.name,
      monsterLevel: entry.monster.level ?? 1,
      monsterMaxHp: entry.monster.hp,
      enemies: snap.enemies || null,
      resumed,
      waveCleared,
      raid: entry.raid || null,
      skills: skills.map((s) => serializeSkillForClient(s, battle.getSkillModifiersFor(s.slug))),
      monsterSkills: entry.monsterSkills.map((s) => serializeSkillForClient(s, null)),
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
        manaRegenPerTick: stats.manaRegenPerTick,
      },
      state: "active",
      characterHp: snap.characterHp,
      characterMana: snap.characterMana,
      maxHp: snap.maxHp,
      maxMana: snap.maxMana,
      monsterHp: snap.monsterHp,
      playerEffects: snap.playerEffects,
      monsterEffects: snap.monsterEffects,
    };
  }

  private async persistSession(entry: ActiveCombat): Promise<void> {
    const battleState = entry.battle.saveState();
    await this.prisma.combatSession.upsert({
      where: { id: entry.battle.id },
      create: {
        id: entry.battle.id,
        characterId: entry.characterId,
        monsterId: entry.monsterId,
        state: "active",
        battleState: battleState as any,
        lastTickAt: new Date(),
      },
      update: {
        battleState: battleState as any,
        lastTickAt: new Date(),
        state: "active",
      },
    });
  }

  private async clearSession(combatId: string): Promise<void> {
    await this.prisma.combatSession.delete({ where: { id: combatId } }).catch(() => {});
  }

  async startCombat(characterId: string, monsterId: string): Promise<any> {
    const existing = Array.from(this.activeCombats.values()).find(
      (c) => c.characterId === characterId && c.state === "active"
    );
    if (existing) {
      throw new Error("Você já está em combate!");
    }

    // Sessão anterior (refresh / reconexão / outra aba): retoma em vez de começar do zero
    const session = await this.prisma.combatSession.findFirst({
      where: { characterId, state: "active" },
    });
    if (session) {
      const stale = Date.now() - new Date(session.lastTickAt).getTime() > SESSION_TTL_MS;
      if (stale) {
        await this.clearSession(session.id);
      } else {
        const resumed = await this.resumeCombat(characterId);
        if (resumed) return resumed;
      }
    }

    // Raid: inicia (ou retoma) a run e monta a onda real do estágio.
    const raidInfo = await this.raidService?.resolveRaidFromMonster(monsterId);
    if (raidInfo) {
      const { run } = await this.raidService!.beginRun(characterId, raidInfo.mapId);
      const wave = await this.raidService!.buildWaveFor(raidInfo.mapId, run.stage);
      const monster = this.raidService!.buildContextMonster(wave);
      const ctx = await this.createBattle(characterId, monster, wave.monsters.length > 1 ? wave.monsters : undefined);
      const entry = this.buildEntry(ctx.battle, ctx.character, ctx.monster, ctx.skills, ctx.monsterSkills);
      entry.raid = this.raidContextFromMonster(monster);
      entry.raidRunId = run.id;
      this.activeCombats.set(ctx.battle.id, entry);
      this.persistSession(entry).catch(() => {});
      return this.buildStartedPayload(ctx.battle, entry, ctx.skills, ctx.character);
    }

    const { character, monster, skills, monsterSkills, battle } = await this.loadCombatContext(characterId, monsterId);
    const entry = this.buildEntry(battle, character, monster, skills, monsterSkills);
    this.activeCombats.set(battle.id, entry);
    this.persistSession(entry).catch(() => {});

    return this.buildStartedPayload(battle, entry, skills, character);
  }

  // Retoma uma batalha salva (após refresh/reconexão). Retorna null se não houver.
  async resumeCombat(characterId: string): Promise<any> {
    const inMemory = this.getCharacterCombat(characterId);
    if (inMemory) return null;

    const session = await this.prisma.combatSession.findFirst({
      where: { characterId, state: "active" },
    });
    if (!session) return null;

    if (Date.now() - new Date(session.lastTickAt).getTime() > SESSION_TTL_MS) {
      await this.clearSession(session.id);
      return null;
    }

    let context: any;
    try {
      context = await this.loadCombatContext(characterId, session.monsterId);
    } catch {
      await this.clearSession(session.id);
      return null;
    }

    const { character, monster, skills, monsterSkills, battle, raid } = context;
    battle.restoreState(session.battleState as any);
    const entry = this.buildEntry(battle, character, monster, skills, monsterSkills);
    entry.raid = raid;
    if (raid && this.raidService) {
      // Garante a run ativa no banco (retoma sem consumir tentativa extra).
      const raidStage = this.raidService.parseMonsterId(session.monsterId);
      if (raidStage) {
        const run = await this.raidService.ensureRun(characterId, raidStage.mapId, raidStage.stage);
        entry.raidRunId = run.id;
      }
    }
    this.activeCombats.set(battle.id, entry);
    this.persistSession(entry).catch(() => {});

    return this.buildStartedPayload(battle, entry, skills, character, true);
  }

  private async syncPlayerEffects(characterId: string, runtimeEffects: ActiveEffectRuntime[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.activeEffect.deleteMany({ where: { characterId } }),
      ...runtimeEffects.map((e) =>
        this.prisma.activeEffect.create({
          data: {
            characterId,
            effectId: e.effect.id,
            stacks: e.stacks,
            remainingMs: e.remainingMs,
            expiresAt: e.effect.duration > 0 ? new Date(Date.now() + e.remainingMs) : null,
            nextTickAt: e.nextTickAt ? new Date(e.nextTickAt) : null,
          },
        })
      ),
    ]);
  }

  private tick(combatId: string): void {
    const entry = this.activeCombats.get(combatId);
    if (!entry) return;

    try {
      entry.battle.tick();
    } catch (err) {
      console.error(`[combat] tick error (${combatId}):`, err);
      clearInterval(entry.tickInterval);
      this.activeCombats.delete(combatId);
      this.clearSession(combatId).catch(() => {});
      if (this.onTickListener) {
        this.onTickListener({
          combatId,
          characterId: entry.characterId,
          state: "error",
          monsterName: entry.monster.name,
          messages: ["O combate travou por um erro interno. Inicie novamente."],
        });
      }
      return;
    }

    if (entry.state === "active" && entry.battle.state !== "active") {
      entry.state = entry.battle.state;
    }

    const snap = entry.battle.snapshot();
    entry.characterHp = snap.characterHp;
    entry.characterMana = snap.characterMana;
    entry.monsterHp = snap.monsterHp;

    const payload: any = {
      combatId,
      characterId: entry.characterId,
      characterHp: snap.characterHp,
      characterMana: snap.characterMana,
      maxHp: snap.maxHp,
      maxMana: snap.maxMana,
      monsterHp: snap.monsterHp,
      monsterName: entry.monster.name,
      monsterMaxHp: snap.monsterMaxHp,
      monsterEffects: snap.monsterEffects,
      playerEffects: snap.playerEffects,
      messages: snap.messages,
      events: snap.events,
      enemies: snap.enemies || undefined,
      state: entry.state,
    };

    const ended = entry.state !== "active";
    if (ended) {
      clearInterval(entry.tickInterval);
      entry.battle.finish().catch(() => {});

      if (entry.state === "won" && entry.raid && entry.raidRunId && this.raidService) {
        this.handleRaidStageWon(entry).then((res) => {
          if (res.type === "wave" && res.entry) {
            this.activeCombats.delete(combatId);
            this.clearSession(combatId).catch(() => {});
            this.activeCombats.set(res.entry.battle.id, res.entry);
            this.persistSession(res.entry).catch(() => {});
          } else {
            this.activeCombats.delete(combatId);
            this.clearSession(combatId).catch(() => {});
          }
          if (this.onTickListener) this.onTickListener(res.payload);
        });
        return;
      }

      this.activeCombats.delete(combatId);
      this.clearSession(combatId).catch(() => {});
      if (entry.state === "won") {
        this.grantRewards(entry.characterId, entry.monster, entry.battle.player.maxHp, entry.battle.player.maxMana).then((rewards) => {
          payload.rewards = rewards;
          if (this.onTickListener) this.onTickListener(payload);
        });
        return;
      }
      if (entry.raid && entry.raidRunId && this.raidService) {
        this.raidService.failRun(entry.raidRunId).catch(() => {});
      }
      if (entry.state === "lost") {
        this.prisma.character
          .update({ where: { id: entry.characterId }, data: { currentHp: 0 } })
          .catch(() => {});
      }
    }

    if (this.onTickListener) {
      this.onTickListener(payload);
    }

    if (!ended) {
      this.persistSession(entry).catch(() => {});
    }
  }

  // Resolve a vitória de um estágio de raid: avança para a próxima onda ou, se o
  // boss caiu, encerra a run com as recompensas finais.
  private async handleRaidStageWon(entry: ActiveCombat): Promise<{
    type: "wave" | "done";
    payload: any;
    entry?: ActiveCombat;
  }> {
    const adv = await this.raidService!.advanceRun(entry.raidRunId!);

    if (adv.done) {
      await this.raidService!.completeRun(entry.raidRunId!);
      this.prisma.character
        .update({ where: { id: entry.characterId }, data: { raidClears: { increment: 1 } } })
        .catch(() => {});
      const rewards = await this.grantRewards(entry.characterId, entry.monster, entry.battle.player.maxHp, entry.battle.player.maxMana);
      const snap = entry.battle.snapshot();
      const payload: any = {
        combatId: entry.battle.id,
        characterId: entry.characterId,
        characterName: entry.characterName,
        state: "won",
        raid: { ...(entry.raid || {}), cleared: true },
        characterHp: snap.characterHp,
        characterMana: snap.characterMana,
        maxHp: snap.maxHp,
        maxMana: snap.maxMana,
        monsterHp: 0,
        monsterName: entry.monster.name,
        monsterMaxHp: snap.monsterMaxHp,
        enemies: snap.enemies || undefined,
        messages: ["RAID CONCLUÍDO! Você derrotou todas as ondas e o boss final."],
        rewards,
      };
      return { type: "done", payload };
    }

    const monster = this.raidService!.buildContextMonster(adv.wave!);
    const next = await this.createBattle(entry.characterId, monster, adv.wave!.monsters.length > 1 ? adv.wave!.monsters : undefined);
    const newEntry = this.buildEntry(next.battle, next.character, monster, next.skills, next.monsterSkills);
    newEntry.raid = this.raidContextFromMonster(monster);
    newEntry.raidRunId = adv.run.id;
    const payload = this.buildStartedPayload(next.battle, newEntry, next.skills, next.character, false, true);
    payload.messages = [
      `Onda ${(entry.raid!.wave)} concluída!`,
      ...(payload.messages || []),
    ];
    return { type: "wave", entry: newEntry, payload };
  }

  async useSkill(characterId: string, combatId: string, skillId: string): Promise<any> {
    const entry = this.activeCombats.get(combatId);
    if (!entry || entry.characterId !== characterId) {
      throw new Error("Combate não encontrado");
    }
    if (entry.state !== "active") {
      throw new Error("O combate já terminou");
    }

    const skill = entry.skills.find((s) => s.id === skillId);
    if (!skill) throw new Error("Skill não encontrada");

    const result = entry.battle.useSkill(skill);
    if (!result.ok) {
      throw new Error(result.error || "Não foi possível usar a skill");
    }

    if (entry.battle.getEffectsDirty()) {
      entry.battle.syncEffects().catch(() => {});
    }

    const snap = entry.battle.snapshot();
    const payload: any = {
      combatId,
      skills: entry.skills.map((s) => serializeSkillForClient(s, entry.battle.getSkillModifiersFor(s.slug))),
      skillId: skill.id,
      skillName: skill.name,
      damage: result.damage,
      healed: result.healed,
      isCritical: result.isCritical,
      isMissed: result.isMissed ?? false,
      isDodged: result.isDodged,
      appliedBuffs: result.appliedEffects,
      appliedEffects: result.appliedEffects,
      removedEffects: result.removedEffects,
      consumedStacks: result.consumedStacks,
      messages: [...result.messages, ...snap.messages],
      events: snap.events,
      channeling: result.channeling,
      channelMs: result.channelMs,
      cooldowns: entry.battle.cooldownInfo(),
      characterHp: snap.characterHp,
      characterMana: snap.characterMana,
      maxHp: snap.maxHp,
      maxMana: snap.maxMana,
      monsterHp: snap.monsterHp,
      monsterName: entry.monster.name,
      monsterMaxHp: snap.monsterMaxHp,
      monsterEffects: snap.monsterEffects,
      playerEffects: snap.playerEffects,
      enemies: snap.enemies || undefined,
      state: entry.state,
    };

    if (entry.battle.state === "won") {
      entry.state = "won";
      clearInterval(entry.tickInterval);
      entry.battle.finish().catch(() => {});
      if (entry.raid && entry.raidRunId && this.raidService) {
        const res = await this.handleRaidStageWon(entry);
        if (res.type === "wave" && res.entry) {
          this.activeCombats.delete(combatId);
          this.clearSession(combatId).catch(() => {});
          this.activeCombats.set(res.entry.battle.id, res.entry);
          this.persistSession(res.entry).catch(() => {});
        } else {
          this.activeCombats.delete(combatId);
          this.clearSession(combatId).catch(() => {});
        }
        return res.payload;
      }
      this.activeCombats.delete(combatId);
      this.clearSession(combatId).catch(() => {});
      payload.rewards = await this.grantRewards(entry.characterId, entry.monster, entry.battle.player.maxHp, entry.battle.player.maxMana);
      payload.state = "won";
    } else {
      this.persistSession(entry).catch(() => {});
    }

    return payload;
  }

  async flee(characterId: string, combatId: string): Promise<any> {
    const entry = this.activeCombats.get(combatId);
    if (!entry || entry.characterId !== characterId) {
      throw new Error("Combate não encontrado");
    }
    if (entry.state !== "active") {
      throw new Error("O combate já terminou");
    }

    const escaped = Math.random() < 0.7;

    const snap = entry.battle.snapshot();
    const payload: any = {
      combatId,
      characterId: entry.characterId,
      state: entry.state,
      characterHp: snap.characterHp,
      characterMana: snap.characterMana,
      maxHp: snap.maxHp,
      maxMana: snap.maxMana,
      monsterHp: snap.monsterHp,
      monsterName: entry.monster.name,
      monsterMaxHp: snap.monsterMaxHp,
      fled: escaped,
      events: snap.events,
      messages: [],
    };

    if (escaped) {
      entry.state = "fled";
      payload.state = "fled";
      clearInterval(entry.tickInterval);
      this.activeCombats.delete(combatId);
      this.clearSession(combatId).catch(() => {});
      entry.battle.finish().catch(() => {});
      if (entry.raid && entry.raidRunId && this.raidService) {
        this.raidService.failRun(entry.raidRunId).catch(() => {});
      }
      this.prisma.character
        .update({
          where: { id: characterId },
          data: { currentHp: snap.characterHp, currentMana: snap.characterMana },
        })
        .catch(() => {});
    } else {
      // A fuga falhou: o monstro ataca
      const oldHp = entry.battle.player.hp;
      entry.battle.monsterAttack();
      payload.damage = Math.max(0, oldHp - entry.battle.player.hp);
      payload.attacker = "monster";
      const s2 = entry.battle.snapshot();
      payload.characterHp = s2.characterHp;
      payload.monsterHp = s2.monsterHp;
      payload.events = s2.events;
      payload.messages = s2.messages;
      if (entry.battle.state === "lost") {
        entry.state = "lost";
        payload.state = "lost";
        clearInterval(entry.tickInterval);
        this.activeCombats.delete(combatId);
        this.clearSession(combatId).catch(() => {});
        entry.battle.finish().catch(() => {});
        this.prisma.character
          .update({ where: { id: characterId }, data: { currentHp: 0 } })
          .catch(() => {});
      }
    }

    return payload;
  }

  async useItem(characterId: string, combatId: string, inventoryId: string): Promise<any> {
    const entry = this.activeCombats.get(combatId);
    if (!entry || entry.characterId !== characterId) {
      throw new Error("Combate não encontrado");
    }
    if (entry.state !== "active") {
      throw new Error("O combate já terminou");
    }

    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { userId: true },
    });
    if (!character) throw new Error("Personagem não encontrado");

    const inv = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, userId: character.userId },
      include: { item: true },
    });
    if (!inv || inv.quantity <= 0) throw new Error("Item não encontrado");

    const item = inv.item;
    if (item.type !== "consumable" && item.type !== "potion") {
      throw new Error("Este item não pode ser usado em combate");
    }

    let heal = 0;
    let manaRestore = 0;
    const effectsRaw = parseJson(item.effects, null);
    if (Array.isArray(effectsRaw)) {
      for (const e of effectsRaw) {
        if (e?.type === "heal") heal += Number(e.value) || 0;
        else if (e?.type === "manaRestore") manaRestore += Number(e.value) || 0;
      }
    } else if (effectsRaw && typeof effectsRaw === "object") {
      heal = Number(effectsRaw.heal) || 0;
      manaRestore = Number(effectsRaw.manaRestore) || 0;
    }

    if (heal <= 0 && manaRestore <= 0) {
      throw new Error("Este item não pode ser usado em combate");
    }

    const hpBefore = entry.battle.player.hp;
    const manaBefore = entry.battle.player.mana;
    entry.battle.useItem(heal, manaRestore);
    const actualHeal = entry.battle.player.hp - hpBefore;
    const actualMana = entry.battle.player.mana - manaBefore;

    if (inv.quantity > 1) {
      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await this.prisma.inventory.delete({ where: { id: inv.id } });
    }

    const snap = entry.battle.snapshot();
    const payload = {
      combatId,
      characterId: entry.characterId,
      inventoryId: inv.id,
      itemName: item.name,
      healed: actualHeal,
      manaRestored: actualMana,
      characterHp: snap.characterHp,
      characterMana: snap.characterMana,
      maxHp: snap.maxHp,
      maxMana: snap.maxMana,
      monsterHp: snap.monsterHp,
      monsterName: entry.monster.name,
      monsterMaxHp: snap.monsterMaxHp,
      playerEffects: snap.playerEffects,
      monsterEffects: snap.monsterEffects,
      events: snap.events,
      state: entry.state,
    };

    this.persistSession(entry).catch(() => {});
    return payload;
  }

  private async grantRewards(characterId: string, monster: any, restoreHp: number, restoreMana: number): Promise<any> {
    const [character, limits] = await Promise.all([
      this.prisma.character.findUnique({
        where: { id: characterId },
        include: { class: true, classProgress: { where: { isActive: true } } },
      }),
      getGameLimits(),
    ]);
    if (!character) return null;

    // Chefes concedem o dobro de XP/ouro/XP de classe
    const mult = monster.isBoss ? 2 : 1;
    let xpGain = Math.floor(Number(monster.xpReward || 0)) * mult;
    let goldGain = Math.floor(Number(monster.goldReward || 0)) * mult;

    // Boosters equipados (anel/colar): XP, Gold e XP de classe
    const boosterBonuses = await getTotalBoosterBonuses(character.userId, character.id);
    if (boosterBonuses.xp > 0) xpGain = Math.floor(xpGain * (1 + boosterBonuses.xp / 100));
    if (boosterBonuses.gold > 0) goldGain = Math.floor(goldGain * (1 + boosterBonuses.gold / 100));

    // VIP ativo: +10% XP e +10% ouro (bônus balanceado)
    const userForVip = await this.prisma.user.findUnique({
      where: { id: character.userId },
      select: { vipUntil: true },
    });
    if (isVipActive(userForVip)) {
      xpGain = Math.floor(xpGain * (1 + VIP_XP_BONUS));
      goldGain = Math.floor(goldGain * (1 + VIP_GOLD_BONUS));
    }

    const levelResult = await applyCharacterXp(this.prisma, characterId, xpGain, limits);
    const levelUps = levelResult.levelUps;

    await this.prisma.character.update({
      where: { id: characterId },
      data: { currentHp: restoreHp, currentMana: restoreMana },
    });

    let classXpGain = 0;
    if (character.classProgress && character.classProgress.length > 0) {
      // CXP base vem do classXpReward do monstro (0 = usa o XP normal, comportamento antigo)
      const baseClassXp =
        Number(monster.classXpReward || 0) > 0
          ? Math.floor(Number(monster.classXpReward) * mult)
          : xpGain;
      const classXp = boosterBonuses.classXp > 0 ? Math.floor(baseClassXp * (1 + boosterBonuses.classXp / 100)) : baseClassXp;
      await grantClassXp(this.prisma, character.classProgress[0].id, classXp);
      classXpGain = classXp;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: character.userId },
    });
    if (user) {
      const actualGoldGain = clampGold(user.gold, goldGain, BigInt(limits.maxGold));
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          experience: { increment: xpGain },
          gold: { increment: actualGoldGain },
        },
      });
    }

    await this.updateQuestKillProgress(character.userId, monster);
    await updateGuildQuestProgress(character.userId, "kill", monster.id);

    // Raid: registra clear se o monstro pertence a um mapa raid
    const raidLink = await this.prisma.mapMonster.findFirst({
      where: { monsterId: monster.id, map: { type: "raid" } },
    });
    if (raidLink) {
      await this.prisma.character.update({
        where: { id: characterId },
        data: { raidClears: { increment: 1 } },
      });
    }

    // XP para o passe de temporada (1/5 do XP do monstro)
    await grantPassXp(this.prisma, character.userId, Math.floor(xpGain / 5));

    // Drops por chance (DropItem): rola dropChance% e sorteia a quantidade
    const drops: { name: string; quantity: number }[] = [];
    const dropRows = await this.prisma.dropItem.findMany({
      where: { monsterId: monster.id, item: { isActive: true } },
      include: { item: true },
    });
    const rolled: { itemName: string; quantity: number; itemId: string }[] = [];
    for (const d of dropRows) {
      if (d.minLevel && character.level < d.minLevel) continue;
      if (d.maxLevel && character.level > d.maxLevel) continue;
      const effectiveChance = d.isGuaranteed ? 100 : d.dropChance * (1 + boosterBonuses.dropChance / 100);
      if (!d.isGuaranteed && Math.random() * 100 >= effectiveChance) continue;
      const min = Math.max(1, d.minQuantity || 1);
      const max = Math.max(min, d.maxQuantity || min);
      const qty = min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
      rolled.push({ itemName: d.item.name, quantity: qty, itemId: d.item.id });
      drops.push({ name: d.item.name, quantity: qty });
    }
    if (rolled.length > 0) {
      await addItemsToInventory(this.prisma, character.userId, rolled);
      for (const r of rolled) {
        await updateGuildQuestProgress(character.userId, "collect", r.itemId, r.quantity);
        await this.updateQuestCollectProgress(character.userId, r.itemName, r.quantity);
      }
    }

    return { xpGain, goldGain, levelUps, classXpGain, drops };
  }

  private async updateQuestKillProgress(userId: string, monster: any): Promise<void> {
    const progresses = await this.prisma.questProgress.findMany({
      where: { userId, status: "active" },
      include: { quest: true },
    });

    for (const progress of progresses) {
      let objectives: any[] = [];
      try {
        objectives = JSON.parse(progress.quest.objectives || "[]");
      } catch {
        continue;
      }
      if (!Array.isArray(objectives) || objectives.length === 0) continue;

      let current: Record<string, any> = {};
      try {
        current = JSON.parse(progress.progress || "{}");
      } catch {
        current = {};
      }

      const keyOf = (obj: any) =>
        String(obj?.id ?? `${obj?.type}-${obj?.monsterName ?? obj?.monsterId}`);

      let changed = false;
      for (const obj of objectives) {
        if (obj?.type !== "kill") continue;
        const target = obj?.monsterName ?? obj?.monsterId;
        if (!target) continue;
        if (target !== monster.name && target !== String(monster.id)) continue;
        const key = keyOf(obj);
        current[key] = (Number(current[key]) || 0) + 1;
        changed = true;
      }
      if (!changed) continue;

      let allDone = true;
      for (const obj of objectives) {
        if (obj?.type !== "kill") continue;
        const count = Number(current[keyOf(obj)]) || 0;
        if (count < Number(obj?.amount ?? 1)) {
          allDone = false;
          break;
        }
      }

      await this.prisma.questProgress.update({
        where: { id: progress.id },
        data: {
          progress: JSON.stringify(current),
          ...(allDone ? { status: "completed" } : {}),
        },
      });
    }
  }

  private async updateQuestCollectProgress(userId: string, itemName: string, quantity: number): Promise<void> {
    const progresses = await this.prisma.questProgress.findMany({
      where: { userId, status: "active" },
      include: { quest: true },
    });

    for (const progress of progresses) {
      let objectives: any[] = [];
      try {
        objectives = JSON.parse(progress.quest.objectives || "[]");
      } catch {
        continue;
      }
      if (!Array.isArray(objectives) || objectives.length === 0) continue;
      const hasCollect = objectives.some((o) => o?.type === "collect");
      if (!hasCollect) continue;

      let current: Record<string, any> = {};
      try {
        current = JSON.parse(progress.progress || "{}");
      } catch {
        current = {};
      }

      const keyOf = (obj: any) =>
        String(obj?.id ?? `${obj?.type}-${obj?.itemName ?? obj?.target ?? obj?.itemId}`);

      let changed = false;
      for (const obj of objectives) {
        if (obj?.type !== "collect") continue;
        const target = obj?.itemName ?? obj?.target ?? obj?.itemId;
        if (!target) continue;
        if (target !== itemName && target !== String(obj?.itemId)) continue;
        const key = keyOf(obj);
        current[key] = (Number(current[key]) || 0) + quantity;
        changed = true;
      }
      if (!changed) continue;

      let allDone = true;
      for (const obj of objectives) {
        if (obj?.type !== "collect") continue;
        const count = Number(current[keyOf(obj)]) || 0;
        if (count < Number(obj?.amount ?? obj?.count ?? 1)) {
          allDone = false;
          break;
        }
      }

      await this.prisma.questProgress.update({
        where: { id: progress.id },
        data: {
          progress: JSON.stringify(current),
          ...(allDone ? { status: "completed" } : {}),
        },
      });
    }
  }

  getCombat(combatId: string): ActiveCombat | undefined {
    return this.activeCombats.get(combatId);
  }

  getCharacterCombat(characterId: string): ActiveCombat | undefined {
    return Array.from(this.activeCombats.values()).find(
      (c) => c.characterId === characterId && c.state === "active"
    );
  }
}
