import { v4 as uuidv4 } from "uuid";
import {
  Action,
  ActiveEffectRuntime,
  BattleEntity,
  BattleLogLine,
  BattleSnapshot,
  CombatEvent,
  CombatEventKind,
  Condition,
  DerivedStats,
  EffectDef,
  PassiveDef,
  SkillDef,
  SkillEvent,
  SummonRuntime,
} from "./types";
import { computeStats, computeMonsterStats, applyStatModifiers, StatsInput } from "./stat-calculator";
import { processEffectStep, serializeEffects, EffectModifiers } from "./effect-manager";
import { executeActions, ActionResult, evaluateConditions, describeConditions, emptyResult, absorbWithShield, reflectPercent, hitkillChanceOf, entityHasKind, nukeStacksOf, nukeHitChancePenaltyOf } from "./action-executor";

export const TICK_MS = 1000;

// Garante que nenhum stat inválido (NaN/Infinity) congele o combate:
// comparações com NaN nunca disparam ataques e o combate "trava".
function finiteStats(stats: DerivedStats): DerivedStats {
  const out: DerivedStats = { ...stats };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "number" && !Number.isFinite(v)) out[k] = 0;
  }
  return out;
}

// Multiplicador de stacks para ticks de DoT/HoT conforme o crescimento configurado:
// linear (×stacks) | crescente (triangular: 1,3,6,10...) | multiplicativo (rate^stacks-1).
export function stackGrowthMultiplier(effect: EffectDef, stacks: number): number {
  const growth = effect.stackGrowth || "linear";
  if (growth === "crescente") return (stacks * (stacks + 1)) / 2;
  if (growth === "multiplicativo") {
    const rate = effect.stackGrowthRate && effect.stackGrowthRate > 1 ? effect.stackGrowthRate : 1.15;
    return Math.pow(rate, stacks - 1);
  }
  return stacks;
}

export interface BattleOptions {
  characterId: string;
  characterName: string;
  characterLevel: number;
  statsInput: StatsInput;
  rank: number;
  skills: SkillDef[];
  passives: PassiveDef[];
  effects: EffectDef[];
  monster: any;
  /** Onda de raid: vários monstros ao mesmo tempo. Quando presente, `monster` define apenas o contexto/id da onda. */
  enemies?: any[];
  monsterSkills?: SkillDef[];
  classResource: Record<string, any>;
  autoPilot?: boolean; // arena PvP (legado): o personagem lança skills sozinho a cada tick
  pvp?: boolean; // PvP manual: os dois lados são jogadores reais controlados (skills/itens)
  pvpDefenderRank?: number; // rank do defensor no PvP manual (skills do lado "monstro")
  defenderClassResource?: Record<string, any>; // recurso de classe do defensor (manaOnHit)
  onEnd: (state: "won" | "lost") => void;  syncPlayerEffects: (effects: ActiveEffectRuntime[]) => Promise<void>;
}

export interface SkillUseResult {
  ok: boolean;
  error?: string;
  damage: number;
  healed: number;
  isCritical: boolean;
  isMissed?: boolean;
  isDodged: boolean;
  appliedEffects: string[];
  removedEffects: string[];
  consumedStacks: number;
  messages: string[];
  channeling: boolean;
  channelMs: number;
  requirements: string[];
  cooldownMs: number;
}

interface EventHandler {
  event: string;
  conditions?: Condition[];
  actions: Action[];
  skillId?: string;
  passiveId?: string;
  internalCooldownMs?: number;
}

export class Battle {
  id: string;
  characterId: string;
  monsterId: string;
  state: "active" | "won" | "lost" | "error" = "active";
  startedAt: number;
  lastTick: number;
  round = 0;

  player: BattleEntity;
  monster: BattleEntity;
  rank: number;
  enemies: BattleEntity[] = [];
  enemyMeta: any[] = [];
  multi = false;

  private skills: SkillDef[];
  private passives: PassiveDef[];
  private effects: EffectDef[];
  private skillModifiers: Map<string, { damagePercent?: number; healPercent?: number; cooldownPercent?: number; manaPercent?: number }> = new Map();
  private effectModifiers: Map<string, EffectModifiers> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private channeling: { skill: SkillDef; until: number } | null = null;
  private monsterChanneling: { skill: SkillDef; until: number } | null = null;
  private summons: SummonRuntime[] = [];
  private passiveHandlers: EventHandler[] = [];
  private skillHandlers: EventHandler[] = [];
  private messages: BattleLogLine[] = [];
  private events: CombatEvent[] = [];
  private effectsDirty = false;
  private monsterSkills: SkillDef[];
  private monsterSkillCooldowns: Map<string, number> = new Map();
  private passiveLastTriggered: Map<string, number> = new Map();

  private opts: BattleOptions;

  constructor(opts: BattleOptions) {
    this.opts = opts;
    this.id = uuidv4();
    this.characterId = opts.characterId;
    this.monsterId = opts.monster?.id;
    this.startedAt = Date.now();
    this.lastTick = Date.now();
    this.rank = opts.rank;
    this.skills = opts.skills;
    this.passives = opts.passives;
    this.effects = opts.effects;
    this.monsterSkills = opts.monsterSkills || [];

    const baseStats = computeStats(opts.statsInput);
    this.player = {
      id: opts.characterId,
      name: opts.characterName,
      level: opts.characterLevel,
      stats: baseStats,
      hp: opts.statsInput.hp ?? baseStats.hp,
      mana: opts.statsInput.mana ?? baseStats.mana,
      maxHp: baseStats.hp,
      maxMana: baseStats.mana,
      effects: [],
      lastAttackAt: Date.now(),
      isPlayer: true,
    };

    const monsterBase = computeMonsterStats(opts.monster);
    this.monster = {
      id: opts.monster?.id,
      name: opts.monster?.name || "Monstro",
      level: opts.monster?.level ?? 1,
      stats: monsterBase,
      hp: monsterBase.hp,
      mana: monsterBase.mana,
      maxHp: monsterBase.hp,
      maxMana: monsterBase.mana,
      effects: [],
      lastAttackAt: Date.now(),
      isPlayer: !!opts.pvp,
      isBoss: !!opts.monster?.isBoss,
    };

    const rawEnemies = opts.enemies && opts.enemies.length > 0 ? opts.enemies : null;
    if (rawEnemies) {
      this.multi = true;
      this.enemyMeta = rawEnemies;
      this.enemies = rawEnemies.map((m: any, i: number) => {
        const base = computeMonsterStats(m);
        return {
          id: m.id || `${opts.monster?.id}:${i}`,
          name: m.name || "Monstro",
          level: m.level ?? 1,
          stats: base,
          hp: base.hp,
          mana: base.mana,
          maxHp: base.hp,
          maxMana: base.mana,
          effects: [],
          lastAttackAt: Date.now(),
          isPlayer: false,
          isBoss: !!m.isBoss,
        };
      });
      this.monster = this.enemies[0];
    }

    this.rebuildModifiers();
    this.registerHandlers();
    this.fire("onCombatStart", { actor: this.player, target: this.monster });
  }

  // ============ Modificadores de passivas ============
  private unlockedPassives(): PassiveDef[] {
    const out: PassiveDef[] = [];
    for (const p of this.passives) {
      if (p.rankRequired > this.rank) continue;
      if (p.conditions && p.conditions.length > 0) {
        if (!evaluateConditions(p.conditions, { player: this.player, monster: this.monster, round: this.round })) continue;
      }
      out.push(p);
    }
    return out;
  }

  private rebuildModifiers(): void {
    const passives = this.unlockedPassives();
    this.skillModifiers.clear();
    this.effectModifiers.clear();
    for (const p of passives) {
      for (const m of p.skillModifiers || []) {
        const current = this.skillModifiers.get(m.skillSlug) || {};
        this.skillModifiers.set(m.skillSlug, {
          damagePercent: (current.damagePercent || 0) + (m.damagePercent || 0),
          healPercent: (current.healPercent || 0) + (m.healPercent || 0),
          cooldownPercent: (current.cooldownPercent || 0) + (m.cooldownPercent || 0),
          manaPercent: (current.manaPercent || 0) + (m.manaPercent || 0),
        });
      }
      for (const m of p.effectModifiers || []) {
        const current = this.effectModifiers.get(m.effectSlug) || {};
        this.effectModifiers.set(m.effectSlug, {
          durationPercent: (current.durationPercent || 0) + (m.durationPercent || 0),
          tickPercent: (current.tickPercent || 0) + (m.tickPercent || 0),
          damagePercent: (current.damagePercent || 0) + (m.damagePercent || 0),
          healPercent: (current.healPercent || 0) + (m.healPercent || 0),
          stacksBonus: (current.stacksBonus || 0) + (m.stacksBonus || 0),
        });
      }
    }
  }

  private registerHandlers(): void {
    this.passiveHandlers = [];
    for (const p of this.unlockedPassives()) {
      for (const e of p.events || []) {
        this.passiveHandlers.push({
          event: e.event,
          conditions: e.conditions,
          actions: e.actions,
          passiveId: p.id,
          internalCooldownMs: p.internalCooldownMs || 0,
        });
      }
    }
  }

  private allHandlers(): EventHandler[] {
    return [...this.passiveHandlers, ...this.skillHandlers];
  }

  // ============ Stats efetivas (com buffs/debuffs) ============
  private effectivePlayerStats(): DerivedStats {
    const flat: Record<string, number> = {};
    const percent: Record<string, number> = {};
    for (const e of this.player.effects) {
      const f = e.effect.statModifiers?.flat;
      const p = e.effect.statModifiers?.percent;
      if (f) for (const [k, v] of Object.entries(f)) flat[k] = (flat[k] || 0) + Number(v) || 0;
      if (p) for (const [k, v] of Object.entries(p)) percent[k] = (percent[k] || 0) + Number(v) || 0;
    }
    return finiteStats(applyStatModifiers(this.player.stats, { flat, percent }));
  }

  private effectiveMonsterStats(): DerivedStats {
    const flat: Record<string, number> = {};
    const percent: Record<string, number> = {};
    for (const e of this.monster.effects) {
      const f = e.effect.statModifiers?.flat;
      const p = e.effect.statModifiers?.percent;
      if (f) for (const [k, v] of Object.entries(f)) flat[k] = (flat[k] || 0) + Number(v) || 0;
      if (p) for (const [k, v] of Object.entries(p)) percent[k] = (percent[k] || 0) + Number(v) || 0;
    }
    return finiteStats(applyStatModifiers(this.monster.stats, { flat, percent }));
  }

  private effectiveEnemyStats(enemy: BattleEntity): DerivedStats {
    const flat: Record<string, number> = {};
    const percent: Record<string, number> = {};
    for (const e of enemy.effects) {
      const f = e.effect.statModifiers?.flat;
      const p = e.effect.statModifiers?.percent;
      if (f) for (const [k, v] of Object.entries(f)) flat[k] = (flat[k] || 0) + Number(v) || 0;
      if (p) for (const [k, v] of Object.entries(p)) percent[k] = (percent[k] || 0) + Number(v) || 0;
    }
    return finiteStats(applyStatModifiers(enemy.stats, { flat, percent }));
  }

  private aliveEnemies(): BattleEntity[] {
    return this.enemies.filter((e) => e.hp > 0);
  }

  private focusEnemy(): BattleEntity {
    return this.aliveEnemies()[0] || this.enemies[0] || this.monster;
  }

  private syncFocus(): void {
    if (!this.multi) return;
    this.monster = this.focusEnemy();
  }

  private metaOf(enemy: BattleEntity): any {
    const i = this.enemies.indexOf(enemy);
    return i >= 0 ? this.enemyMeta[i] || {} : {};
  }

  // ============ Eventos ============
  fire(event: string, ctx: { actor: BattleEntity; target: BattleEntity; skillId?: string }): void {
    const now = Date.now();
    for (const handler of this.allHandlers()) {
      if (handler.event !== event) continue;
      if (handler.skillId && handler.skillId !== ctx.skillId) continue;
      if (handler.conditions && handler.conditions.length > 0) {
        if (!evaluateConditions(handler.conditions, { player: this.player, monster: this.monster, round: this.round })) continue;
      }
      // Cooldown interno da passiva (anti-loop): bloqueia gatilhos repetidos
      if (handler.passiveId && handler.internalCooldownMs && handler.internalCooldownMs > 0) {
        const last = this.passiveLastTriggered.get(handler.passiveId) || 0;
        if (now - last < handler.internalCooldownMs) continue;
        this.passiveLastTriggered.set(handler.passiveId, now);
      }
      const result = emptyResult();
      const battleCtx = this.buildActionContext(ctx.actor, ctx.target, result, ctx.skillId || "");
      executeActions(handler.actions, battleCtx, result);
      this.collectResult(result, `[Passiva]`);
    }
  }

  private buildActionContext(actor: BattleEntity, target: BattleEntity, result: ActionResult, skillSlug: string): any {
    const playerStats = this.effectivePlayerStats();
    const monsterStats = this.multi && target !== this.monster ? this.effectiveEnemyStats(target) : this.effectiveMonsterStats();
    const actorStats = actor.isPlayer ? playerStats : monsterStats;
    const targetStats = target.isPlayer ? playerStats : monsterStats;
    return {
      actor,
      target,
      actorStats,
      targetStats,
      messages: result.messages,
      resolveEffect: (slug: string) => this.effects.find((e) => e.slug === slug),
      effectModifiers: (slug: string) => this.effectModifiers.get(slug) || this.effectModifiers.get("*") || null,
      getSkillModifiers: () => this.skillModifiers.get(skillSlug) || this.skillModifiers.get("*") || null,
      onSummon: (name: string, attack: number, hp: number, duration: number) => {
        this.summons.push({ name, attack, hp, maxHp: hp, expiresAt: Date.now() + duration });
      },
      onResetCooldown: (opts: { skillSlug?: string; trigger?: "skill" | "ultimate"; reduceMs?: number }) => {
        const now = Date.now();
        const targets: string[] = [];
        for (const s of this.skills) {
          if (opts.skillSlug) {
            if (s.slug === opts.skillSlug) targets.push(s.id);
            continue;
          }
          if (opts.trigger === "ultimate") {
            if (s.trigger === "ultimate") targets.push(s.id);
          } else if (opts.trigger === "skill") {
            if (s.trigger === "active" || s.trigger === "channel") targets.push(s.id);
          }
        }
        for (const id of targets) {
          const readyAt = this.cooldowns.get(id);
          if (!readyAt) continue;
          if (opts.reduceMs && opts.reduceMs > 0) {
            this.cooldowns.set(id, Math.max(now, readyAt - opts.reduceMs));
          } else {
            this.cooldowns.delete(id);
          }
        }
      },
      onKill: () => {
        if (this.state !== "active" || target.hp > 0) return;
        target.hp = 0;
        if (actor.isPlayer) {
          if (this.multi) {
            this.syncFocus();
            if (this.aliveEnemies().length === 0) this.state = "won";
          } else {
            this.state = "won";
          }
        } else {
          this.state = "lost";
        }
      },
    };
  }

  private collectResult(result: ActionResult, prefix = ""): void {
    for (const msg of result.messages) {
      this.pushMessage(msg, prefix);
    }
  }

  private pushMessage(text: string, type = ""): void {
    this.messages.push({ text, type });
    if (this.messages.length > 60) this.messages.splice(0, this.messages.length - 60);
  }

  takeMessages(): BattleLogLine[] {
    const out = this.messages;
    this.messages = [];
    return out;
  }

  private pushEvent(target: "player" | "monster", kind: CombatEventKind, value: number, entityId?: string): void {
    this.events.push({ target, kind, value, entityId });
    if (this.events.length > 30) this.events.splice(0, this.events.length - 30);
  }

  takeEvents(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // Converte o resultado de uma skill/ataque em eventos visuais centralizados.
  private emitResultEvents(result: { damage: number; healed: number; isCritical: boolean; isMissed?: boolean; isDodged: boolean }, side: "player" | "monster", entityId?: string): void {
    const target = side === "player" ? "monster" : "player";
    if (result.isMissed) {
      this.pushEvent(target, "miss", 0, entityId);
      return;
    }
    if (result.isDodged) {
      this.pushEvent(target, "dodge", 0, entityId);
      return;
    }
    if (result.damage > 0) this.pushEvent(target, result.isCritical ? "crit" : "normal", result.damage, entityId);
    if (result.healed > 0) this.pushEvent(side, "heal", result.healed);
  }

  // ============ Ações de skill ============
  getSkillModifiersFor(slug: string): { damagePercent?: number; healPercent?: number } | null {
    return this.skillModifiers.get(slug) || this.skillModifiers.get("*") || null;
  }

  getCooldown(skillId: string): number {
    return this.getCooldownFor("player", skillId);
  }

  getCooldownFor(side: "player" | "monster", skillId: string): number {
    const map = side === "player" ? this.cooldowns : this.monsterSkillCooldowns;
    const readyAt = map.get(skillId);
    if (!readyAt) return 0;
    return Math.max(0, readyAt - Date.now());
  }

  private cooldownMapFor(side: "player" | "monster"): Map<string, number> {
    return side === "player" ? this.cooldowns : this.monsterSkillCooldowns;
  }

  private sideEntities(side: "player" | "monster"): { actor: BattleEntity; target: BattleEntity; actorStats: DerivedStats; targetStats: DerivedStats } {
    const actor = side === "player" ? this.player : this.monster;
    const target = side === "player" ? this.monster : this.player;
    const actorStats = actor.isPlayer ? this.effectivePlayerStats() : this.effectiveMonsterStats();
    const targetStats = target.isPlayer ? this.effectivePlayerStats() : this.effectiveMonsterStats();
    return { actor, target, actorStats, targetStats };
  }

  private actualCooldownFor(side: "player" | "monster", skill: SkillDef): number {
    const { actorStats } = this.sideEntities(side);
    const mods = this.skillModifiers.get(skill.slug) || this.skillModifiers.get("*");
    const cdr = (mods?.cooldownPercent || 0) + actorStats.cooldownReduction;
    return Math.max(500, Math.floor(skill.cooldown * (1 - Math.min(80, cdr) / 100)));
  }

  private actualManaCostFor(side: "player" | "monster", skill: SkillDef): number {
    const { actorStats } = this.sideEntities(side);
    const mods = this.skillModifiers.get(skill.slug) || this.skillModifiers.get("*");
    const reduction = Math.min(80, (mods?.manaPercent || 0) + actorStats.manaCostReduction);
    return Math.max(0, Math.floor(skill.manaCost * (1 - reduction / 100)));
  }

  canUseSkill(skill: SkillDef): { ok: boolean; reason?: string; requirements: string[] } {
    return this.canUseSkillFor("player", skill);
  }

  canUseSkillFor(side: "player" | "monster", skill: SkillDef): { ok: boolean; reason?: string; requirements: string[] } {
    const { actor, target } = this.sideEntities(side);
    if (this.state !== "active") return { ok: false, reason: "Combate encerrado", requirements: [] };
    if (entityHasKind(actor, "stun")) return { ok: false, reason: "Atordoado(a) — não pode agir", requirements: [] };
    if (entityHasKind(actor, "silence")) return { ok: false, reason: "Silenciado(a) — skills bloqueadas", requirements: [] };
    const sideRank = side === "player" ? this.rank : (this.opts.pvpDefenderRank ?? this.rank);
    if (skill.rankRequired > sideRank) return { ok: false, reason: `Requer rank ${skill.rankRequired}`, requirements: [] };
    if (this.getCooldownFor(side, skill.id) > 0) return { ok: false, reason: "Skill em cooldown", requirements: [] };
    if (skill.manaCost > 0 && actor.mana < this.actualManaCostFor(side, skill)) return { ok: false, reason: "Mana insuficiente", requirements: [] };
    const requirements = describeConditions(skill.conditions);
    if (requirements.length > 0 && !evaluateConditions(skill.conditions, { player: this.player, monster: this.monster, round: this.round })) {
      return { ok: false, reason: `Condição não atendida: ${requirements.join(", ")}`, requirements };
    }
    const ch = side === "player" ? this.channeling : this.monsterChanneling;
    if (ch) return { ok: false, reason: "Canalizando", requirements: [] };
    return { ok: true, requirements };
  }

  useSkill(skill: SkillDef): SkillUseResult {
    return this.useSkillFor("player", skill);
  }

  useSkillFor(side: "player" | "monster", skill: SkillDef): SkillUseResult {
    const check = this.canUseSkillFor(side, skill);
    if (!check.ok) {
      if (check.reason === "Mana insuficiente") {
        this.fire("onOutOfMana", { actor: side === "player" ? this.player : this.monster, target: side === "player" ? this.monster : this.player });
      }
      return {
        ok: false,
        error: check.reason,
        damage: 0,
        healed: 0,
        isCritical: false,
        isMissed: false,
        isDodged: false,
        appliedEffects: [],
        removedEffects: [],
        consumedStacks: 0,
        messages: [],
        channeling: false,
        channelMs: 0,
        requirements: check.requirements,
        cooldownMs: 0,
      };
    }

    const { actor } = this.sideEntities(side);
    const manaCost = this.actualManaCostFor(side, skill);
    if (manaCost > 0) actor.mana -= manaCost;
    const cd = this.actualCooldownFor(side, skill);
    this.cooldownMapFor(side).set(skill.id, Date.now() + cd);

    const channelMs = skill.channelMs || skill.castTime || 0;
    if (channelMs > 0) {
      const ch = { skill, until: Date.now() + channelMs };
      if (side === "player") this.channeling = ch;
      else this.monsterChanneling = ch;
      this.pushMessage(`Canalizando ${skill.name}...`);
      return {
        ok: true,
        error: undefined,
        damage: 0,
        healed: 0,
        isCritical: false,
        isMissed: false,
        isDodged: false,
        appliedEffects: [],
        removedEffects: [],
        consumedStacks: 0,
        messages: [`Canalizando ${skill.name}...`],
        channeling: true,
        channelMs,
        requirements: [],
        cooldownMs: cd,
      };
    }

    return this.executeSkillFor(side, skill);
  }

  private executeSkillFor(side: "player" | "monster", skill: SkillDef): SkillUseResult {
    if (side === "player" && this.multi) return this.executeSkillMultiFor(skill);
    const { actor, target } = this.sideEntities(side);
    const result = emptyResult();
    const actions: Action[] = skill.conditions && skill.conditions.length > 0 ? skill.onConditionMet : skill.actions;
    const ctx = this.buildActionContext(actor, target, result, skill.slug);
    executeActions(actions && actions.length > 0 ? actions : skill.actions, ctx, result);
    this.collectResult(result, "");
    this.emitResultEvents(result, side);

    // Eventos reativos da própria skill
    for (const e of skill.events || []) {
      this.skillHandlers.push({ event: e.event, conditions: e.conditions, actions: e.actions, skillId: skill.id });
    }
    this.fire("onSkillUsed", { actor, target, skillId: skill.id });
    if (result.hit) this.fire("onHit", { actor, target, skillId: skill.id });
    if (result.isCritical) this.fire("onCrit", { actor, target, skillId: skill.id });
    if (result.damage > 0) {
      const resource = side === "player" ? this.opts.classResource : this.opts.defenderClassResource;
      const manaOnHit = Number(resource?.manaOnHit) || 0;
      if (manaOnHit > 0) actor.mana = Math.min(actor.maxMana, actor.mana + manaOnHit);
    }

    this.effectsDirty = true;
    return {
      ok: true,
      error: undefined,
      damage: result.damage,
      healed: result.healed,
      isCritical: result.isCritical,
      isMissed: result.isMissed,
      isDodged: result.isDodged,
      appliedEffects: result.appliedEffects,
      removedEffects: result.removedEffects,
      consumedStacks: result.consumedStacks,
      messages: result.messages,
      channeling: false,
      channelMs: 0,
      requirements: [],
      cooldownMs: this.getCooldownFor(side, skill.id),
    };
  }

  // Execução de skill do jogador em modo multi-inimigo (raid):
  // - ações com flag `area` atingem todos os inimigos vivos;
  // - ações normais atingem o foco (primeiro inimigo vivo).
  private executeSkillMultiFor(skill: SkillDef): SkillUseResult {
    const actor = this.player;
    const result = emptyResult();
    const actions: Action[] = skill.conditions && skill.conditions.length > 0 ? skill.onConditionMet : skill.actions;
    const list: Action[] = actions && actions.length > 0 ? actions : skill.actions;
    const areaActions = list.filter((a) => (a as any).area);
    const singleActions = list.filter((a) => !(a as any).area);

    if (areaActions.length > 0) {
      const targets = this.aliveEnemies().length > 0 ? this.aliveEnemies() : [this.focusEnemy()];
      for (const t of targets) {
        const sub = emptyResult();
        const ctx = this.buildActionContext(actor, t, sub, skill.slug);
        executeActions(areaActions, ctx, sub);
        this.collectResult(sub, "");
        this.emitResultEvents(sub, "player", t.id);
        result.damage += sub.damage;
        result.healed += sub.healed;
        result.isCritical = result.isCritical || sub.isCritical;
        result.isMissed = result.isMissed && sub.isMissed;
        result.appliedEffects.push(...sub.appliedEffects);
        if (sub.hit) this.fire("onHit", { actor, target: t, skillId: skill.id });
        if (sub.isCritical) this.fire("onCrit", { actor, target: t, skillId: skill.id });
        this.syncFocus();
        if (this.state !== "active") break;
      }
    }

    if (singleActions.length > 0 && this.state === "active") {
      const t = this.focusEnemy();
      const ctx = this.buildActionContext(actor, t, result, skill.slug);
      executeActions(singleActions, ctx, result);
      this.collectResult(result, "");
      this.emitResultEvents(result, "player", t.id);
      if (result.hit) this.fire("onHit", { actor, target: t, skillId: skill.id });
      if (result.isCritical) this.fire("onCrit", { actor, target: t, skillId: skill.id });
      this.syncFocus();
    }

    this.fire("onSkillUsed", { actor, target: this.focusEnemy(), skillId: skill.id });
    if (result.damage > 0) {
      const manaOnHit = Number(this.opts.classResource?.manaOnHit) || 0;
      if (manaOnHit > 0) actor.mana = Math.min(actor.maxMana, actor.mana + manaOnHit);
    }
    this.effectsDirty = true;
    return {
      ok: true,
      error: undefined,
      damage: result.damage,
      healed: result.healed,
      isCritical: result.isCritical || areaActions.length > 0 && result.damage > 0,
      isMissed: result.isMissed,
      isDodged: result.isDodged,
      appliedEffects: result.appliedEffects,
      removedEffects: result.removedEffects,
      consumedStacks: result.consumedStacks,
      messages: result.messages,
      channeling: false,
      channelMs: 0,
      requirements: [],
      cooldownMs: this.getCooldownFor("player", skill.id),
    };
  }

  // ============ Auto-ataque ============
  private autoAttack(): void {
    const autoSkill = this.skills.find((s) => s.trigger === "auto");
    if (!autoSkill) return;
    this.performAutoAttack(autoSkill, "");
    // Booster de arma: Golpe Duplo — chance de atacar uma 2ª vez (1 extra por tick)
    const pStats = this.effectivePlayerStats();
    const ds = Math.min(60, pStats.doubleStrikeChance || 0);
    if (ds > 0 && this.state === "active" && Math.random() * 100 < ds) {
      this.performAutoAttack(autoSkill, "Golpe duplo! ");
    }
  }

  private performAutoAttack(autoSkill: SkillDef, prefix: string): void {
    const result = emptyResult();
    const ctx = this.buildActionContext(this.player, this.monster, result, autoSkill.slug);
    executeActions(autoSkill.actions, ctx, result);
    this.emitResultEvents(result, "player");
    if (result.messages.length > 0) {
      this.pushMessage(`[${autoSkill.name}] ${prefix}${result.messages.join(" • ")}`);
    }
    this.fire("onAutoAttack", { actor: this.player, target: this.monster, skillId: autoSkill.id });
    if (result.hit) this.fire("onHit", { actor: this.player, target: this.monster, skillId: autoSkill.id });
    if (result.isCritical) this.fire("onCrit", { actor: this.player, target: this.monster, skillId: autoSkill.id });
    const manaOnHit = Number(this.opts.classResource?.manaOnHit) || 0;
    if (manaOnHit > 0 && result.hit) {
      this.player.mana = Math.min(this.player.maxMana, this.player.mana + manaOnHit);
    }
    this.effectsDirty = true;
  }

  // Auto-ataque do lado do "monstro" (PvP: ataque básico do defensor)
  private monsterAutoAttack(): void {
    const autoSkill = this.monsterSkills.find((s) => s.trigger === "auto");
    if (!autoSkill) return;
    const result = emptyResult();
    const ctx = this.buildActionContext(this.monster, this.player, result, autoSkill.slug);
    executeActions(autoSkill.actions, ctx, result);
    this.emitResultEvents(result, "monster");
    if (result.messages.length > 0) {
      this.pushMessage(`[${autoSkill.name}] ${result.messages.join(" • ")}`);
    }
    this.fire("onAutoAttack", { actor: this.monster, target: this.player, skillId: autoSkill.id });
    if (result.hit) this.fire("onHit", { actor: this.monster, target: this.player, skillId: autoSkill.id });
    if (result.isCritical) this.fire("onCrit", { actor: this.monster, target: this.player, skillId: autoSkill.id });
    const manaOnHit = Number(this.opts.defenderClassResource?.manaOnHit) || 0;
    if (manaOnHit > 0 && result.hit) {
      this.monster.mana = Math.min(this.monster.maxMana, this.monster.mana + manaOnHit);
    }
    this.effectsDirty = true;
  }

  // ============ Ataque do monstro ============
  private monsterSkillReady(skill: SkillDef): boolean {
    const readyAt = this.monsterSkillCooldowns.get(skill.id);
    if (!readyAt) return true;
    return Date.now() >= readyAt;
  }

  private monsterUseSkill(): boolean {
    if (this.monsterSkills.length === 0) return false;
    const ready = this.monsterSkills.filter((s) => this.monsterSkillReady(s));
    if (ready.length === 0) return false;
    const skill = ready[Math.floor(Math.random() * ready.length)];
    const cd = Math.max(1000, Math.floor(skill.cooldown || 2500));
    this.monsterSkillCooldowns.set(skill.id, Date.now() + cd);

    this.pushMessage(`${this.monster.name} usou ${skill.name}!`);
    const result = emptyResult();
    const ctx = this.buildActionContext(this.monster, this.player, result, skill.slug);
    executeActions(skill.actions, ctx, result);
    this.collectResult(result, `[${skill.name}]`);
    this.emitResultEvents(result, "monster");
    if (result.hit) this.fire("onHit", { actor: this.monster, target: this.player, skillId: skill.id });
    if (result.isCritical) this.fire("onCrit", { actor: this.monster, target: this.player, skillId: skill.id });
    if (this.player.hp <= 0 && this.state === "active") {
      this.player.hp = 0;
      this.state = "lost";
    }
    this.effectsDirty = true;
    return true;
  }

  monsterAttack(): void {
    if (entityHasKind(this.monster, "stun")) return;
    const pStats = this.effectivePlayerStats();
    const mStats = this.effectiveMonsterStats();
    // Penetração do monstro reduz a defesa efetiva do jogador
    const pen = Math.min(80, Math.max(0, mStats.penetration || 0));
    const effDef = Math.max(0, pStats.defense * (1 - pen / 100));
    const reduction = Math.min(0.8, effDef / (effDef + 100));
    let damage = Math.max(1, Math.floor(mStats.attack * (1 - reduction)));
    // Resistências do jogador
    const resist = Math.min(80, Math.max(0, (pStats.damageResistance || 0) + (pStats.physicalResistance || 0)));
    if (resist > 0) damage = Math.max(1, Math.floor(damage * (1 - resist / 100)));

    let crit = Math.random() * 100 < mStats.critChance;

    // Nuke do monstro: stacks garantem crítico, mas reduzem a Hit Chance (risco)
    const nukeStacks = nukeStacksOf(this.monster);
    if (nukeStacks > 0) {
      const missChance = Math.min(100, nukeHitChancePenaltyOf(this.monster));
      if (Math.random() * 100 < missChance) {
        this.pushEvent("player", "miss", 0);
        this.pushMessage(`${this.monster.name} errou o ataque (risco do Nuke)!`);
        this.fire("onDodge", { actor: this.player, target: this.monster });
        return;
      }
      crit = true;
      this.pushMessage(`${this.monster.name} disparou um Nuke...`);
    }
    if (crit) damage = Math.floor(damage * (mStats.critDamage / 100));

    if (Math.random() * 100 < Math.min(60, pStats.dodge)) {
      this.pushEvent("player", "dodge", 0);
      this.pushMessage(`Você esquivou do ataque do ${this.monster.name}!`);
      this.fire("onDodge", { actor: this.player, target: this.monster });
      return;
    }

    // Escudo do jogador
    const { applied, absorbed } = absorbWithShield(this.player, damage);
    if (absorbed > 0) this.pushMessage(`Seu escudo absorveu ${absorbed} de dano`);

    if (applied > 0) {
      this.player.hp = Math.max(0, this.player.hp - applied);
      this.pushEvent("player", crit ? "crit" : "normal", applied);
      this.pushMessage(`${this.monster.name} causou ${applied} de dano em você${crit ? " (crítico)" : ""}`);
    } else if (absorbed > 0) {
      this.pushMessage(`O ataque foi totalmente absorvido pelo escudo`);
    }

    // Refletir do jogador
    const reflected = Math.floor(applied * (reflectPercent(this.player) / 100));
    if (reflected > 0) {
      this.monster.hp = Math.max(0, this.monster.hp - reflected);
      this.pushEvent("monster", "normal", reflected);
      this.pushMessage(`Você refletiu ${reflected} de dano para ${this.monster.name}`);
      if (this.monster.hp <= 0) {
        this.monster.hp = 0;
        this.state = "won";
      }
    }

    // Golpe letal do monstro
    const hk = hitkillChanceOf(this.monster);
    if (hk > 0 && Math.random() * 100 < hk) {
      this.player.hp = 0;
      this.pushMessage(`Golpe letal! ${this.monster.name} aniquilou você de uma vez`);
    }

    this.fire("onDamageTaken", { actor: this.player, target: this.monster });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.state = "lost";
    }
  }

  // ============ Ataques de inimigos individuais (multi-inimigo/raid) ============
  private enemySkillKey(skillId: string, enemyId: string): string {
    return `${enemyId}|${skillId}`;
  }

  private enemyUseSkill(enemy: BattleEntity): boolean {
    if (this.monsterSkills.length === 0) return false;
    const now = Date.now();
    const ready = this.monsterSkills.filter((s) => {
      const readyAt = this.monsterSkillCooldowns.get(this.enemySkillKey(s.id, enemy.id));
      return !readyAt || now >= readyAt;
    });
    if (ready.length === 0) return false;
    const skill = ready[Math.floor(Math.random() * ready.length)];
    const cd = Math.max(1000, Math.floor(skill.cooldown || 2500));
    this.monsterSkillCooldowns.set(this.enemySkillKey(skill.id, enemy.id), now + cd);

    this.pushMessage(`${enemy.name} usou ${skill.name}!`);
    const result = emptyResult();
    const ctx = this.buildActionContext(enemy, this.player, result, skill.slug);
    executeActions(skill.actions, ctx, result);
    this.collectResult(result, `[${skill.name}]`);
    this.emitResultEvents(result, "monster", enemy.id);
    if (result.hit) this.fire("onHit", { actor: enemy, target: this.player, skillId: skill.id });
    if (result.isCritical) this.fire("onCrit", { actor: enemy, target: this.player, skillId: skill.id });
    if (this.player.hp <= 0 && this.state === "active") {
      this.player.hp = 0;
      this.state = "lost";
    }
    this.effectsDirty = true;
    return true;
  }

  private enemyAttack(enemy: BattleEntity): void {
    if (entityHasKind(enemy, "stun")) return;
    const pStats = this.effectivePlayerStats();
    const eStats = this.effectiveEnemyStats(enemy);
    const pen = Math.min(80, Math.max(0, eStats.penetration || 0));
    const effDef = Math.max(0, pStats.defense * (1 - pen / 100));
    const reduction = Math.min(0.8, effDef / (effDef + 100));
    let damage = Math.max(1, Math.floor(eStats.attack * (1 - reduction)));
    const resist = Math.min(80, Math.max(0, (pStats.damageResistance || 0) + (pStats.physicalResistance || 0)));
    if (resist > 0) damage = Math.max(1, Math.floor(damage * (1 - resist / 100)));

    let crit = Math.random() * 100 < eStats.critChance;

    const nukeStacks = nukeStacksOf(enemy);
    if (nukeStacks > 0) {
      const missChance = Math.min(100, nukeHitChancePenaltyOf(enemy));
      if (Math.random() * 100 < missChance) {
        this.pushEvent("player", "miss", 0);
        this.pushMessage(`${enemy.name} errou o ataque (risco do Nuke)!`);
        this.fire("onDodge", { actor: this.player, target: enemy });
        return;
      }
      crit = true;
      this.pushMessage(`${enemy.name} disparou um Nuke...`);
    }
    if (crit) damage = Math.floor(damage * (eStats.critDamage / 100));

    if (Math.random() * 100 < Math.min(60, pStats.dodge)) {
      this.pushEvent("player", "dodge", 0);
      this.pushMessage(`Você esquivou do ataque do ${enemy.name}!`);
      this.fire("onDodge", { actor: this.player, target: enemy });
      return;
    }

    const { applied, absorbed } = absorbWithShield(this.player, damage);
    if (absorbed > 0) this.pushMessage(`Seu escudo absorveu ${absorbed} de dano`);

    if (applied > 0) {
      this.player.hp = Math.max(0, this.player.hp - applied);
      this.pushEvent("player", crit ? "crit" : "normal", applied);
      this.pushMessage(`${enemy.name} causou ${applied} de dano em você${crit ? " (crítico)" : ""}`);
    } else if (absorbed > 0) {
      this.pushMessage(`O ataque foi totalmente absorvido pelo escudo`);
    }

    const reflected = Math.floor(applied * (reflectPercent(this.player) / 100));
    if (reflected > 0) {
      enemy.hp = Math.max(0, enemy.hp - reflected);
      this.pushEvent("monster", "normal", reflected, enemy.id);
      this.pushMessage(`Você refletiu ${reflected} de dano para ${enemy.name}`);
      if (enemy.hp <= 0) {
        enemy.hp = 0;
        this.syncFocus();
      }
    }

    const hk = hitkillChanceOf(enemy);
    if (hk > 0 && Math.random() * 100 < hk) {
      this.player.hp = 0;
      this.pushMessage(`Golpe letal! ${enemy.name} aniquilou você de uma vez`);
    }

    this.fire("onDamageTaken", { actor: this.player, target: enemy });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.state = "lost";
    }
  }

  // ============ Tick principal ============
  tick(): void {
    if (this.state !== "active") return;
    try {
      this.tickInner();
    } catch (err) {
      console.error("[battle] tick falhou — encerrando combate para evitar travamento:", err);
      this.state = "error";
      this.pushMessage("O combate travou por um erro interno. Inicie novamente.");
    }
  }

  private tickInner(): void {
    const now = Date.now();
    this.lastTick = now;
    this.round++;
    this.syncFocus();

    // Stats com buffs para o round atual
    const pStats = this.effectivePlayerStats();
    const mStats = this.effectiveMonsterStats();

    // Canalização
    if (this.channeling) {
      if (now >= this.channeling.until) {
        const skill = this.channeling.skill;
        this.channeling = null;
        const result = this.executeSkillFor("player", skill);
        for (const m of result.messages) this.pushMessage(m);
        this.effectsDirty = true;
      }
    }
    if (this.monsterChanneling) {
      if (now >= this.monsterChanneling.until) {
        const skill = this.monsterChanneling.skill;
        this.monsterChanneling = null;
        const result = this.executeSkillFor("monster", skill);
        for (const m of result.messages) this.pushMessage(m);
        this.effectsDirty = true;
      }
    }

    // Regenerações
    if (pStats.manaRegenPerTick > 0) {
      this.player.mana = Math.min(this.player.maxMana, this.player.mana + pStats.manaRegenPerTick);
    }
    if (pStats.healthRegenPerTick > 0) {
      const hpBefore = this.player.hp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + pStats.healthRegenPerTick);
      const gained = this.player.hp - hpBefore;
      if (gained > 0) this.pushEvent("player", "hot", gained);
    }
    if (this.opts.pvp && mStats.manaRegenPerTick > 0) {
      this.monster.mana = Math.min(this.monster.maxMana, this.monster.mana + mStats.manaRegenPerTick);
    }

    // Auto-ataque do jogador
    if (this.state === "active" && !entityHasKind(this.player, "stun") && now - this.player.lastAttackAt >= pStats.attackSpeedMs) {
      this.player.lastAttackAt = now;
      this.autoAttack();
    }

    // AutoPilot (arena PvP): lança uma skill ativa pronta por tick
    if (this.opts.autoPilot && this.state === "active" && !entityHasKind(this.player, "stun") && !entityHasKind(this.player, "silence") && !this.channeling) {
      const ready = this.skills
        .filter((s) => s.trigger === "active" || s.trigger === "skill")
        .sort((a, b) => this.getCooldown(b.id) - this.getCooldown(a.id))
        .find((s) => this.canUseSkill(s).ok);
      if (ready) this.useSkill(ready);
    }

    // Summons
    if (this.state === "active") {
      this.summons = this.summons.filter((s) => s.expiresAt > now);
      for (const s of this.summons) {
        const focus = this.focusEnemy();
        const reduction = Math.min(0.8, mStats.defense / (mStats.defense + 100));
        const dmg = Math.max(1, Math.floor(s.attack * (1 - reduction)));
        focus.hp = Math.max(0, focus.hp - dmg);
        this.pushEvent("monster", "normal", dmg, this.multi ? focus.id : undefined);
        this.pushMessage(`${s.name} causou ${dmg} de dano`);
        if (focus.hp <= 0) {
          focus.hp = 0;
          this.syncFocus();
          if (this.multi && this.aliveEnemies().length === 0) {
            this.state = "won";
            break;
          }
        }
      }
    }

    // Ataque do monstro (PvE) / auto-ataque do defensor (PvP manual)
    if (this.opts.pvp) {
      if (this.state === "active" && !entityHasKind(this.monster, "stun") && now - this.monster.lastAttackAt >= mStats.attackSpeedMs) {
        this.monster.lastAttackAt = now;
        this.monsterAutoAttack();
      }
    } else if (this.multi) {
      for (const e of this.aliveEnemies()) {
        if (this.state !== "active") break;
        if (entityHasKind(e, "stun")) continue;
        const eStats = this.effectiveEnemyStats(e);
        if (now - e.lastAttackAt >= eStats.attackSpeedMs) {
          e.lastAttackAt = now;
          if (!this.enemyUseSkill(e)) this.enemyAttack(e);
        }
      }
    } else if (this.state === "active" && !entityHasKind(this.monster, "stun") && now - this.monster.lastAttackAt >= mStats.attackSpeedMs) {
      this.monster.lastAttackAt = now;
      if (!this.monsterUseSkill()) {
        this.monsterAttack();
      }
    }

    // Efeitos: ticks + expiração + perda de stacks
    if (this.state === "active" || this.player.hp > 0) {
      this.processEffects(now);
    }

    // Eventos de round (passivas onTick/onHpBelow)
    this.rebuildModifiers();
    this.registerHandlers();
    this.fire("onTurnEnd", { actor: this.player, target: this.monster });
    this.fire("onHpBelow", { actor: this.player, target: this.monster });

    if (this.player.hp <= 0 && this.state === "active") {
      this.player.hp = 0;
      this.state = "lost";
    }
    if (this.multi) {
      this.syncFocus();
      if (this.state === "active" && this.aliveEnemies().length === 0) {
        this.state = "won";
      }
    } else if (this.monster.hp <= 0 && this.state === "active") {
      this.monster.hp = 0;
      this.state = "won";
    }

    this.effectsDirty = true;
  }

  private processEffects(now: number): void {
    // Efeitos do jogador
    const playerStep = processEffectStep(this.player.effects, TICK_MS, now);
    this.player.effects = playerStep.effects;
    for (const ev of playerStep.events.ticked) {
      const pStats = this.effectivePlayerStats();
      const mStats = this.effectiveMonsterStats();
      if (ev.effect.kind === "hot" && ev.effect.tickHealing) {
        const mods = this.effectModifiers.get(ev.effect.slug) || this.effectModifiers.get("*");
        const raw = (ev.effect.tickHealing.base || 0) + (ev.effect.tickHealing.scaling || []).reduce((acc, s) => acc + (pStats[s.stat] || 0) * s.factor, 0);
        const boosted = raw * (1 + (pStats.healingPercent + (mods?.healPercent || 0)) / 100) * (1 + (mods?.tickPercent || 0) / 100);
        const amount = Math.floor(boosted) * stackGrowthMultiplier(ev.effect, ev.stacks);
        const cap = Math.floor(this.player.maxHp * (1 + pStats.overhealPercent / 100));
        const applied = Math.min(cap, Math.floor(this.player.hp + amount)) - this.player.hp;
        if (applied > 0) {
          this.player.hp += applied;
          this.pushEvent("player", "hot", applied);
          this.pushMessage(`${ev.effect.name} curou ${applied} de vida${ev.stacks > 1 ? ` (${ev.stacks} stacks)` : ""}`);
        }
      }
      if (ev.effect.kind === "dot" && ev.effect.tickDamage) {
        // DoTs no jogador escalam com as stats de quem aplicou (o adversário no PvP).
        const mods = this.effectModifiers.get(ev.effect.slug) || this.effectModifiers.get("*");
        const raw = (ev.effect.tickDamage.base || 0) + (ev.effect.tickDamage.scaling || []).reduce((acc, s) => acc + (mStats[s.stat] || 0) * s.factor, 0);
        const boosted = raw * (1 + (mStats.dotPercent + (mods?.damagePercent || 0)) / 100) * (1 + (mods?.tickPercent || 0) / 100);
        const dmg = Math.max(1, Math.floor(boosted)) * stackGrowthMultiplier(ev.effect, ev.stacks);
        const { applied, absorbed } = absorbWithShield(this.player, dmg);
        if (absorbed > 0) this.pushMessage(`Seu escudo absorveu ${absorbed} do dano de ${ev.effect.name}`);
        this.player.hp = Math.max(0, this.player.hp - applied);
        this.pushEvent("player", "dot", applied);
        this.pushMessage(`${ev.effect.name} causou ${applied} de dano em você${ev.stacks > 1 ? ` (${ev.stacks} stacks)` : ""}`);
        if (this.player.hp <= 0 && this.state === "active") {
          this.player.hp = 0;
          this.state = "lost";
        }
      }
      // onTick actions
      if (ev.effect.onTick && ev.effect.onTick.length > 0) {
        const result = emptyResult();
        const ctx = this.buildActionContext(this.player, this.monster, result, "");
        executeActions(ev.effect.onTick, ctx, result);
        this.collectResult(result, `[${ev.effect.name}]`);
      }
    }
    for (const ev of playerStep.events.expired) {
      this.fire("onEffectExpired", { actor: this.player, target: this.monster });
      if (ev.effect.onExpire && ev.effect.onExpire.length > 0) {
        const result = emptyResult();
        const ctx = this.buildActionContext(this.player, this.monster, result, "");
        executeActions(ev.effect.onExpire, ctx, result);
        this.collectResult(result, `[${ev.effect.name}]`);
      }
    }

    // Efeitos dos inimigos (monstro único ou onda multi)
    const pStats = this.effectivePlayerStats();
    const enemiesToProcess = this.multi ? this.aliveEnemies().map((e) => e) : [this.monster];
    for (const e of enemiesToProcess) {
      const enemyStep = processEffectStep(e.effects, TICK_MS, now);
      e.effects = enemyStep.effects;
      for (const ev of enemyStep.events.ticked) {
        if (ev.effect.kind === "dot" && ev.effect.tickDamage) {
          const mods = this.effectModifiers.get(ev.effect.slug) || this.effectModifiers.get("*");
          const raw = (ev.effect.tickDamage.base || 0) + (ev.effect.tickDamage.scaling || []).reduce((acc, s) => acc + (pStats[s.stat] || 0) * s.factor, 0);
          const boosted = raw * (1 + (pStats.dotPercent + (mods?.damagePercent || 0)) / 100) * (1 + (mods?.tickPercent || 0) / 100);
          const dmg = Math.max(1, Math.floor(boosted)) * stackGrowthMultiplier(ev.effect, ev.stacks);
          e.hp = Math.max(0, e.hp - dmg);
          this.pushEvent("monster", "dot", dmg, this.multi ? e.id : undefined);
          this.pushMessage(`${ev.effect.name} causou ${dmg} de dano${ev.stacks > 1 ? ` (${ev.stacks} stacks)` : ""}`);
          if (e.hp <= 0 && this.state === "active") {
            e.hp = 0;
            if (this.multi) {
              this.syncFocus();
              if (this.aliveEnemies().length === 0) this.state = "won";
            } else {
              this.state = "won";
            }
          }
        }
        if (ev.effect.onTick && ev.effect.onTick.length > 0) {
          const result = emptyResult();
          const ctx = this.buildActionContext(this.player, e, result, "");
          executeActions(ev.effect.onTick, ctx, result);
          this.collectResult(result, `[${ev.effect.name}]`);
        }
      }
      for (const ev of enemyStep.events.expired) {
        if (ev.effect.onExpire && ev.effect.onExpire.length > 0) {
          const result = emptyResult();
          const ctx = this.buildActionContext(this.player, e, result, "");
          executeActions(ev.effect.onExpire, ctx, result);
          this.collectResult(result, `[${ev.effect.name}]`);
        }
      }
    }
  }

  // ============ Itens / Fuga ============
  useItem(heal: number, manaRestore: number): void {
    this.useItemFor("player", heal, manaRestore);
  }

  useItemFor(side: "player" | "monster", heal: number, manaRestore: number): void {
    if (this.state !== "active") return;
    const actor = side === "player" ? this.player : this.monster;
    const hpBefore = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(0, heal));
    actor.mana = Math.min(actor.maxMana, actor.mana + Math.max(0, manaRestore));
    const appliedHeal = actor.hp - hpBefore;
    if (appliedHeal > 0) this.pushEvent(side, "heal", appliedHeal);
  }

  // ============ Persistência ============
  async syncEffects(): Promise<void> {
    await this.opts.syncPlayerEffects(this.player.effects);
  }

  async finish(): Promise<void> {
    await this.syncEffects();
  }

  getEffectsDirty(): boolean {
    return this.effectsDirty;
  }

  // ============ Snapshot ============
  snapshot(): BattleSnapshot {
    return {
      characterHp: Math.max(0, this.player.hp),
      characterMana: Math.max(0, this.player.mana),
      maxHp: this.effectivePlayerStats().hp,
      maxMana: this.effectivePlayerStats().mana,
      monsterHp: Math.max(0, this.monster.hp),
      monsterMaxHp: this.monster.maxHp,
      playerEffects: serializeEffects(this.player.effects),
      monsterEffects: serializeEffects(this.monster.effects),
      enemies: this.multi
        ? this.enemies.map((e) => ({
            id: e.id,
            name: e.name,
            level: e.level,
            isBoss: !!this.metaOf(e).isBoss,
            isElite: !!this.metaOf(e).isElite,
            imageUrl: this.metaOf(e).imageUrl ?? null,
            hp: Math.max(0, e.hp),
            maxHp: e.maxHp,
            effects: serializeEffects(e.effects),
          }))
        : undefined,
      messages: this.takeMessages().map((m) => m.text),
      events: this.takeEvents(),
    };
  }

  // ============ Persistência (retomar combate após refresh) ============
  saveState(): Record<string, any> {
    const serializeRuntime = (effects: ActiveEffectRuntime[]) =>
      effects.map((e) => ({
        slug: e.effect.slug,
        stacks: e.stacks,
        remainingMs: e.remainingMs,
        nextTickAt: e.nextTickAt,
        shieldHp: e.shieldHp,
      }));

    return {
      id: this.id,
      monsterId: this.monsterId,
      state: this.state,
      startedAt: this.startedAt,
      lastTick: this.lastTick,
      round: this.round,
      rank: this.rank,
      player: {
        hp: this.player.hp,
        mana: this.player.mana,
        lastAttackAt: this.player.lastAttackAt,
        effects: serializeRuntime(this.player.effects),
      },
      monster: {
        hp: this.monster.hp,
        mana: this.monster.mana,
        lastAttackAt: this.monster.lastAttackAt,
        effects: serializeRuntime(this.monster.effects),
      },
      enemies: this.multi
        ? this.enemies.map((e) => ({
            id: e.id,
            hp: e.hp,
            mana: e.mana,
            lastAttackAt: e.lastAttackAt,
            effects: serializeRuntime(e.effects),
          }))
        : undefined,
      cooldowns: Array.from(this.cooldowns.entries()),
      monsterSkillCooldowns: Array.from(this.monsterSkillCooldowns.entries()),
      channeling: this.channeling ? { skillId: this.channeling.skill.id, until: this.channeling.until } : null,
      summons: this.summons,
    };
  }

  restoreState(save: any): void {
    if (!save) return;
    this.id = save.id || this.id;
    this.state = save.state || "active";
    this.startedAt = save.startedAt ?? this.startedAt;
    this.lastTick = save.lastTick ?? Date.now();
    this.round = save.round || 0;
    this.rank = save.rank ?? this.rank;

    const resolveRuntime = (raw: any[]): ActiveEffectRuntime[] => {
      if (!Array.isArray(raw)) return [];
      const out: ActiveEffectRuntime[] = [];
      for (const e of raw) {
        const effect = this.effects.find((ef) => ef.slug === e?.slug);
        if (!effect) continue;
        out.push({
          effect,
          stacks: Number(e.stacks) || 1,
          remainingMs: Number(e.remainingMs) || 0,
          nextTickAt: e.nextTickAt ? Number(e.nextTickAt) : null,
          shieldHp: e.shieldHp ? Number(e.shieldHp) : undefined,
        });
      }
      return out;
    };

    if (save.player) {
      this.player.hp = Number(save.player.hp ?? this.player.hp);
      this.player.mana = Number(save.player.mana ?? this.player.mana);
      this.player.lastAttackAt = Number(save.player.lastAttackAt) || Date.now();
      this.player.effects = resolveRuntime(save.player.effects);
    }
    if (save.monster) {
      this.monster.hp = Number(save.monster.hp ?? this.monster.hp);
      this.monster.mana = Number(save.monster.mana ?? this.monster.mana);
      this.monster.lastAttackAt = Number(save.monster.lastAttackAt) || Date.now();
      this.monster.effects = resolveRuntime(save.monster.effects);
    }
    if (this.multi && Array.isArray(save.enemies)) {
      for (const raw of save.enemies) {
        const e = this.enemies.find((en) => en.id === raw?.id);
        if (!e) continue;
        e.hp = Number(raw.hp ?? e.hp);
        e.mana = Number(raw.mana ?? e.mana);
        e.lastAttackAt = Number(raw.lastAttackAt) || Date.now();
        e.effects = resolveRuntime(raw.effects);
      }
    }
    this.syncFocus();

    this.cooldowns = new Map(
      Array.isArray(save.cooldowns)
        ? (save.cooldowns as [string, number][]).map(([id, at]) => [id, Number(at)])
        : []
    );
    this.monsterSkillCooldowns = new Map(
      Array.isArray(save.monsterSkillCooldowns)
        ? (save.monsterSkillCooldowns as [string, number][]).map(([id, at]) => [id, Number(at)])
        : []
    );
    if (save.channeling) {
      const skill = this.skills.find((s) => s.id === save.channeling.skillId);
      this.channeling = skill ? { skill, until: Number(save.channeling.until) } : null;
    }
    if (Array.isArray(save.summons)) this.summons = save.summons;
  }

  cooldownInfo(): Array<{ skillId: string; remaining: number }> {
    return this.cooldownInfoFor("player");
  }

  cooldownInfoFor(side: "player" | "monster"): Array<{ skillId: string; remaining: number }> {
    const now = Date.now();
    const out: Array<{ skillId: string; remaining: number }> = [];
    for (const [id, readyAt] of this.cooldownMapFor(side)) {
      out.push({ skillId: id, remaining: Math.max(0, readyAt - now) });
    }
    return out;
  }
}
