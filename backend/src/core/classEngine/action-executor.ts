import { Action, ActiveEffectRuntime, BattleEntity, Condition, DerivedStats, EffectDef, Scaling } from "./types";
import { applyEffect, enforceExclusiveGroups, EffectModifiers } from "./effect-manager";

export function isEffectActive(e: ActiveEffectRuntime): boolean {
  return e.remainingMs > 0 || e.effect.duration === 0;
}

export function entityHasKind(entity: BattleEntity, kind: string): boolean {
  return entity.effects.some((e) => e.effect.kind === kind && isEffectActive(e));
}

export function totalShieldHp(entity: BattleEntity): number {
  let total = 0;
  for (const e of entity.effects) {
    if (isEffectActive(e) && e.shieldHp && e.shieldHp > 0) total += e.shieldHp;
  }
  return total;
}

// Aplica dano respeitando escudos. Retorna quanto passou e quanto foi absorvido.
export function absorbWithShield(entity: BattleEntity, amount: number): { applied: number; absorbed: number } {
  if (amount <= 0) return { applied: 0, absorbed: 0 };
  let remaining = amount;
  for (const e of entity.effects) {
    if (remaining <= 0) break;
    if (!isEffectActive(e) || !e.shieldHp || e.shieldHp <= 0) continue;
    const take = Math.min(remaining, e.shieldHp);
    e.shieldHp -= take;
    remaining -= take;
  }
  return { applied: remaining, absorbed: amount - remaining };
}

// Percentual total de reflexo (soma por stack).
export function reflectPercent(entity: BattleEntity): number {
  let total = 0;
  for (const e of entity.effects) {
    if (!isEffectActive(e)) continue;
    const pct = Number(e.effect.reflect?.percent) || 0;
    if (pct > 0) total += pct * e.stacks;
  }
  return Math.min(100, total);
}

// Chance total de golpe letal (soma por stack, cap 100%).
export function hitkillChanceOf(entity: BattleEntity): number {
  let total = 0;
  for (const e of entity.effects) {
    if (!isEffectActive(e)) continue;
    const pct = Number(e.effect.hitkillChance) || 0;
    if (pct > 0) total += pct * e.stacks;
  }
  return Math.min(100, total);
}

// Total de stacks de nuke ativos (cada stack: crit garantido, -% hit chance).
export function nukeStacksOf(entity: BattleEntity): number {
  let total = 0;
  for (const e of entity.effects) {
    if (!isEffectActive(e) || e.effect.kind !== "nuke") continue;
    total += e.stacks;
  }
  return total;
}

// Penalidade total de Hit Chance aplicada pelos stacks de nuke (%).
export function nukeHitChancePenaltyOf(entity: BattleEntity): number {
  let total = 0;
  for (const e of entity.effects) {
    if (!isEffectActive(e) || e.effect.kind !== "nuke") continue;
    const per = Number(e.effect.nukeHitChancePenalty) || 1;
    total += per * e.stacks;
  }
  return total;
}

export interface ActionContext {
  actor: BattleEntity;
  target: BattleEntity;
  // stats atualizadas do ator (com buffs/passivas) e do alvo (com debuffs)
  actorStats: DerivedStats;
  targetStats: DerivedStats;
  messages: string[];
  // busca efeito por slug (para applyEffect) e modificadores ativos da classe
  resolveEffect: (slug: string) => EffectDef | undefined;
  effectModifiers: (effectSlug: string) => EffectModifiers | null;
  // modificadores da skill sendo executada (de passivas da classe)
  getSkillModifiers: () => { damagePercent?: number; healPercent?: number } | null;
  // callbacks para estados extras (summons, vitória)
  onSummon?: (name: string, attack: number, hp: number, duration: number) => void;
  onKill?: () => void;
  // Skill Reset: zera ou reduz o cooldown de skills (skillSlug) ou ultimates (trigger)
  onResetCooldown?: (opts: { skillSlug?: string; trigger?: "skill" | "ultimate"; reduceMs?: number }) => void;
}

export interface ActionResult {
  damage: number;
  healed: number;
  isCritical: boolean;
  isMissed: boolean;
  isDodged: boolean;
  appliedEffects: string[];
  removedEffects: string[];
  consumedStacks: number;
  messages: string[];
  hit: boolean;
}

export function emptyResult(): ActionResult {
  return { damage: 0, healed: 0, isCritical: false, isMissed: false, isDodged: false, appliedEffects: [], removedEffects: [], consumedStacks: 0, messages: [], hit: false };
}

function scaleValue(base: number, scaling: Scaling[] | undefined, stats: DerivedStats): number {
  let total = base || 0;
  if (scaling) {
    for (const s of scaling) {
      const v = stats[s.stat];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v * (s.factor || 0);
      }
    }
  }
  return total;
}

export function rollDodge(target: BattleEntity, targetStats: DerivedStats): boolean {
  return Math.random() * 100 < Math.min(60, targetStats.dodge);
}

export function computeDamageAmount(
  action: Extract<Action, { action: "damage" }>,
  actor: BattleEntity,
  actorStats: DerivedStats,
  target: BattleEntity,
  targetStats: DerivedStats,
  ctx: ActionContext
): { amount: number; isCritical: boolean; isMissed: boolean; isDodged: boolean } {
  const raw = scaleValue(action.amount ?? 0, action.scaling, actorStats);

  // Nuke: cada stack ativo garante crítico (usa Critical Multiplier, ignora Critical Chance)
  // e reduz a Hit Chance do atacante (risco do nuke: stacks demais → erro).
  const nukeStacks = nukeStacksOf(actor);
  let hitChance = Math.min(100, actorStats.hitChance || 100);
  let forceCrit = false;
  if (nukeStacks > 0) {
    const penalty = nukeHitChancePenaltyOf(actor);
    hitChance = Math.max(0, hitChance - penalty);
    forceCrit = true;
  }

  if (Math.random() * 100 >= hitChance) {
    return { amount: 0, isCritical: false, isMissed: true, isDodged: false };
  }

  const critRoll = Math.random() * 100;
  const isCritical = forceCrit || (action.crit !== false && critRoll < actorStats.critChance);
  const isDodged = action.crit !== false && rollDodge(target, targetStats);

  if (isDodged) {
    return { amount: 0, isCritical: false, isMissed: false, isDodged: true };
  }

  const critMult = isCritical ? actorStats.critDamage / 100 : 1;
  let amount = raw * critMult;

  const type = action.damageType || "physical";
  if (type === "physical" || type === "magic") {
    const def = type === "physical" ? targetStats.defense : targetStats.magicDefense;
    if (!action.ignoreDefense) {
      // Penetração reduz a defesa efetiva do alvo
      const penetration = Math.min(80, Math.max(0, actorStats.penetration || 0));
      const effectiveDef = Math.max(0, def * (1 - penetration / 100));
      const reduction = effectiveDef / (effectiveDef + 100);
      amount *= 1 - reduction;
    }
  }

  const skillMods = ctx.getSkillModifiers();
  let boost = 0;
  if (type === "physical") boost += actorStats.physicalDamagePercent;
  if (type === "magic") boost += actorStats.magicalDamagePercent;
  boost += actorStats.damagePercent;
  if (skillMods?.damagePercent) boost += skillMods.damagePercent;
  amount *= 1 + boost / 100;

  // Resistências do alvo (reduzem o dano final por tipo)
  let resistance = targetStats.damageResistance || 0;
  if (type === "physical") resistance += targetStats.physicalResistance || 0;
  if (type === "magic") resistance += targetStats.magicalResistance || 0;
  resistance = Math.min(80, Math.max(0, resistance));
  if (resistance > 0) amount *= 1 - resistance / 100;

  return { amount: Math.max(1, Math.floor(amount)), isCritical, isMissed: false, isDodged: false };
}

// Executa uma lista de ações dentro de um contexto de batalha.
export function executeActions(actions: Action[], ctx: ActionContext, result: ActionResult): void {
  for (const action of actions) {
    switch (action.action) {
      case "damage": {
        const { amount, isCritical, isMissed, isDodged } = computeDamageAmount(action, ctx.actor, ctx.actorStats, ctx.target, ctx.targetStats, ctx);
        if (isMissed) {
          result.isMissed = true;
          result.messages.push(`O ataque errou!`);
          continue;
        }
        if (isDodged) {
          result.isDodged = true;
          result.messages.push(`O ataque foi esquivado!`);
          continue;
        }
        if (amount <= 0) continue;

        // Escudo do alvo absorve parte do dano
        const { applied, absorbed } = absorbWithShield(ctx.target, amount);
        if (absorbed > 0) {
          result.messages.push(`Escudo absorveu ${absorbed} de dano`);
        }

        if (applied > 0) {
          ctx.target.hp = Math.max(0, ctx.target.hp - applied);
          result.damage += applied;
          result.isCritical = result.isCritical || isCritical;
          result.hit = true;
          result.messages.push(isCritical ? `Dano crítico de ${applied}!` : `Causou ${applied} de dano`);
          if (ctx.target.hp <= 0) {
            ctx.onKill?.();
          }
        } else if (absorbed > 0) {
          result.hit = true;
          result.messages.push(`O ataque foi totalmente absorvido pelo escudo`);
        }

        // Refletir: o alvo devolve % do dano aplicado ao atacante
        const reflected = Math.floor(applied * (reflectPercent(ctx.target) / 100));
        if (reflected > 0) {
          ctx.actor.hp = Math.max(0, ctx.actor.hp - reflected);
          result.messages.push(`Refletiu ${reflected} de dano de volta`);
        }

        // Golpe letal: chance do atacante aniquilar o alvo na hora
        const hk = hitkillChanceOf(ctx.actor);
        if (hk > 0 && Math.random() * 100 < hk) {
          ctx.target.hp = 0;
          result.messages.push(`Golpe letal! ${ctx.target.name} foi derrotado instantaneamente`);
          ctx.onKill?.();
        }
        break;
      }
      case "heal": {
        const raw = action.percentOfMax ? (action.percentOfMax / 100) * ctx.actorStats.hp : scaleValue(action.amount ?? 0, action.scaling, ctx.actorStats);
        const skillMods = ctx.getSkillModifiers();
        let amount = raw * (1 + (ctx.actorStats.healingPercent + (skillMods?.healPercent ?? 0)) / 100);
        const cap = Math.floor(ctx.actor.maxHp * (1 + ctx.actorStats.overhealPercent / 100));
        const applied = Math.min(cap, Math.floor(ctx.actor.hp + amount)) - ctx.actor.hp;
        if (applied > 0) {
          ctx.actor.hp += applied;
          result.healed += applied;
          result.messages.push(`Curou ${applied} de vida`);
        }
        break;
      }
      case "mana": {
        const amount = Math.floor(scaleValue(action.amount ?? 0, action.scaling, ctx.actorStats));
        ctx.actor.mana = Math.min(ctx.actor.maxMana, Math.max(0, ctx.actor.mana + amount));
        result.messages.push(`Mana ${amount >= 0 ? "+" : ""}${amount}`);
        break;
      }
      case "applyEffect": {
        const effect = ctx.resolveEffect(action.effect);
        if (!effect) continue;
        const isSelf = action.target === "self";
        const target = isSelf ? ctx.actor : ctx.target;
        const targetStats = isSelf ? ctx.actorStats : ctx.targetStats;
        const mods = ctx.effectModifiers(effect.slug);
        const calcShield = effect.shield
          ? (ef: EffectDef, stacks: number) =>
              (scaleValue(ef.shield?.base ?? 0, ef.shield?.scaling, targetStats) || 0) * stacks
          : undefined;
        const { effects } = applyEffect(target.effects, effect, action.stacks ?? 1, { modifiers: mods, calcShield });
        target.effects = enforceExclusiveGroups(effects, effect);
        result.appliedEffects.push(effect.name);
        result.messages.push(
          isSelf
            ? `Aplicou ${effect.name} em si mesmo`
            : `Aplicou ${effect.name} no inimigo`
        );
        break;
      }
      case "removeEffect": {
        const target = action.target === "self" ? ctx.actor : ctx.target;
        const { removed } = removeEffectLocal(target.effects, action.effect, action.stacks);
        if (removed > 0) {
          result.removedEffects.push(action.effect);
          result.messages.push(`Removeu stacks de ${action.effect}`);
        }
        break;
      }
      case "consumeStacks": {
        const target = action.target === "self" ? ctx.actor : ctx.target;
        const before = target.effects.find((e) => e.effect.slug === action.effect)?.stacks ?? 0;
        const removed = Math.min(before, action.stacks ?? before);
        target.effects = target.effects.filter((e) => {
          if (e.effect.slug !== action.effect) return true;
          e.stacks -= removed;
          return e.stacks > 0;
        });
        result.consumedStacks += removed;
        if (removed > 0) result.messages.push(`Consumiu ${removed} stacks de ${action.effect}`);
        break;
      }
      case "summon": {
        const attack = Math.floor((ctx.actorStats.attackPower * (action.attackPercent ?? 50)) / 100);
        const hp = Math.floor((ctx.actorStats.hp * (action.hpPercent ?? 20)) / 100);
        ctx.onSummon?.(action.name, Math.max(1, attack), Math.max(1, hp), action.duration ?? 30000);
        result.messages.push(`Invocou ${action.name}!`);
        break;
      }
      case "leech": {
        if (result.damage > 0) {
          const heal = Math.floor(result.damage * ((action.percent ?? 20) / 100));
          ctx.actor.hp = Math.min(ctx.actor.maxHp, ctx.actor.hp + heal);
          result.healed += heal;
          result.messages.push(`Roubou ${heal} de vida`);
        }
        break;
      }
      case "resetCooldown": {
        ctx.onResetCooldown?.({
          skillSlug: action.skillSlug,
          trigger: action.trigger,
          reduceMs: action.reduceMs,
        });
        const what = action.skillSlug
          ? `${action.skillSlug}`
          : action.trigger === "ultimate"
            ? "Ultimates"
            : "Skills";
        result.messages.push(
          action.reduceMs && action.reduceMs > 0 ? `Cooldown de ${what} reduzido em ${Math.round(action.reduceMs / 1000)}s` : `Cooldown de ${what} resetado!`
        );
        break;
      }
    }
  }
}

function removeEffectLocal(effects: any[], slug: string, amount?: number): { removed: number } {
  if (amount === undefined) {
    const before = effects.length;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].effect.slug === slug) effects.splice(i, 1);
    }
    return { removed: before - effects.length };
  }
  let removed = 0;
  for (const e of effects) {
    if (e.effect.slug !== slug) continue;
    const r = Math.min(e.stacks, amount);
    e.stacks -= r;
    removed += r;
    amount -= r;
    if (amount <= 0) break;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].stacks <= 0) effects.splice(i, 1);
  }
  return { removed };
}

// Avalia condições (gates de skill, passivas condicionais, eventos)
export function evaluateConditions(conditions: Condition[] | undefined, ctx: { player: BattleEntity; monster: BattleEntity; round: number }): boolean {
  if (!conditions || conditions.length === 0) return true;
  const { player, monster, round } = ctx;
  for (const c of conditions) {
    switch (c.type) {
      case "hasEffect":
        if (!player.effects.some((e) => e.effect.slug === c.effect)) return false;
        break;
      case "stacksAtLeast": {
        const e = player.effects.find((x) => x.effect.slug === c.effect);
        if (!e || e.stacks < (c.stacks ?? 1)) return false;
        break;
      }
      case "stacksAtMost": {
        const e = player.effects.find((x) => x.effect.slug === c.effect);
        if (e && e.stacks > (c.stacks ?? 1)) return false;
        break;
      }
      case "hpPercentBelow":
        if (player.hp / Math.max(1, player.maxHp) * 100 >= (c.percent ?? 50)) return false;
        break;
      case "hpPercentAbove":
        if (player.hp / Math.max(1, player.maxHp) * 100 <= (c.percent ?? 50)) return false;
        break;
      case "manaPercentAtLeast":
        if (player.mana / Math.max(1, player.maxMana) * 100 < (c.percent ?? 20)) return false;
        break;
      case "combatRoundAtLeast":
        if (round < (c.round ?? 5)) return false;
        break;
    }
  }
  return true;
}

export function describeConditions(conditions: Condition[] | undefined): string[] {
  if (!conditions || conditions.length === 0) return [];
  const out: string[] = [];
  for (const c of conditions) {
    switch (c.type) {
      case "hasEffect": out.push(`Requer efeito ${c.effect}`); break;
      case "stacksAtLeast": out.push(`Requer ${c.stacks}× ${c.effect}`); break;
      case "stacksAtMost": out.push(`Máx. ${c.stacks}× ${c.effect}`); break;
      case "hpPercentBelow": out.push(`Vida abaixo de ${c.percent}%`); break;
      case "hpPercentAbove": out.push(`Vida acima de ${c.percent}%`); break;
      case "manaPercentAtLeast": out.push(`Mana acima de ${c.percent}%`); break;
      case "combatRoundAtLeast": out.push(`A partir do round ${c.round}`); break;
    }
  }
  return out;
}
