// Tipos compartilhados do motor de classes/combate.
// Tudo que vem do banco é tratado como `any` na borda; estes tipos descrevem o contrato interno.

export type Action =
  | { action: "damage"; amount?: number; scaling?: Scaling[]; damageType?: "physical" | "magic" | "true"; ignoreDefense?: boolean; crit?: boolean; area?: boolean }
  | { action: "heal"; amount?: number; scaling?: Scaling[]; percentOfMax?: number }
  | { action: "mana"; amount?: number; scaling?: Scaling[]; restore?: boolean }
  | { action: "applyEffect"; effect: string; stacks?: number; target?: "self" | "enemy"; area?: boolean }
  | { action: "removeEffect"; effect: string; stacks?: number; target?: "self" | "enemy" }
  | { action: "consumeStacks"; effect: string; stacks?: number; target?: "self" | "enemy" }
  | { action: "summon"; name: string; duration?: number; attackPercent?: number; hpPercent?: number }
  | { action: "leech"; percent?: number }
  | { action: "resetCooldown"; skillSlug?: string; trigger?: "skill" | "ultimate"; reduceMs?: number };

export interface Scaling {
  stat: string;
  factor: number;
}

export interface Condition {
  type: "hasEffect" | "stacksAtLeast" | "stacksAtMost" | "hpPercentBelow" | "hpPercentAbove" | "manaPercentAtLeast" | "combatRoundAtLeast";
  effect?: string;
  stacks?: number;
  percent?: number;
  round?: number;
}

export interface SkillEvent {
  event: string;
  conditions?: Condition[];
  actions: Action[];
}

export interface SkillDef {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  iconSecondary?: string | null;
  kind: string;
  trigger: string;
  target: string;
  cooldown: number;
  manaCost: number;
  castTime: number;
  channelMs: number;
  rankRequired: number;
  scaling: Scaling[];
  actions: Action[];
  conditions: Condition[];
  onConditionMet: Action[];
  events: SkillEvent[];
}

export interface PassiveDef {
  id: string;
  name: string;
  slug: string;
  description: string;
  rankRequired: number;
  statModifiers: { flat?: Record<string, number>; percent?: Record<string, number> };
  skillModifiers: Array<{ skillSlug: string; damagePercent?: number; cooldownPercent?: number; manaPercent?: number; healPercent?: number }>;
  effectModifiers: Array<{ effectSlug: string; durationPercent?: number; tickPercent?: number; damagePercent?: number; healPercent?: number; stacksBonus?: number }>;
  conditions: Condition[];
  events: SkillEvent[];
  type: string; // permanente | condicional | reativa | combo
  internalCooldownMs: number; // ms mínimos entre gatilhos reativos (anti-loop); 0 = sem limite
}

export interface EffectDef {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  kind: string; // buff, debuff, hot, dot, shield, reflect, hitkill, silence, stun, nuke
  category: string;
  maxStacks: number;
  duration: number; // ms; 0 = permanente
  refreshBehavior: string; // refresh | extend | overwrite | stack
  stackGrowth: string; // linear | crescente | multiplicativo — como stacks amplificam ticks
  stackGrowthRate: number; // fator usado quando stackGrowth = multiplicativo
  nukeHitChancePenalty: number; // % de Hit Chance perdida por stack (kind nuke)
  stackLoss: { intervalMs?: number; amount?: number };
  priority: number;
  tickInterval: number;
  tickDamage: { base?: number; scaling?: Scaling[]; damageType?: string };
  tickHealing: { base?: number; scaling?: Scaling[] };
  statModifiers: { flat?: Record<string, number>; percent?: Record<string, number> };
  shield?: { base?: number; scaling?: Scaling[] };
  reflect?: { percent?: number };
  hitkillChance?: number; // % chance de golpe letal por stack ao acertar
  onMaxStacks: Action[];
  onExpire: Action[];
  onTick: Action[];
  exclusiveGroup?: string | null;
}

export interface ActiveEffectRuntime {
  effect: EffectDef;
  stacks: number;
  remainingMs: number; // 0 = permanente
  nextTickAt: number | null;
  shieldHp?: number; // pool de escudo restante (kinds shield)
}

export interface SummonRuntime {
  name: string;
  attack: number;
  hp: number;
  maxHp: number;
  expiresAt: number;
}

export interface DerivedStats {
  level: number;
  hp: number;
  mana: number;
  attack: number;
  defense: number;
  magic: number;
  magicDefense: number;
  speed: number;
  attackPower: number;
  spellPower: number;
  hitChance: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  attackSpeedMs: number;
  manaRegenPerTick: number;
  healthRegenPerTick: number;
  threatPerAttack: number;
  aggroPerHit: number;
  damagePercent: number;
  physicalDamagePercent: number;
  magicalDamagePercent: number;
  damageResistance: number;
  physicalResistance: number;
  magicalResistance: number;
  penetration: number;
  healingPercent: number;
  dotPercent: number;
  overhealPercent: number;
  manaCostReduction: number;
  cooldownReduction: number;
  pvpDamagePercent: number;
  pveDamagePercent: number;
  bossDamagePercent: number;
  lifestealPercent: number;
  manaStealPercent: number;
  doubleStrikeChance: number;
  attackSpeedPercent: number;
  executionPercent: number;
  fullHpDamagePercent: number;
  damageTakenReduction: number;
  thornsPercent: number;
  [key: string]: number;
}

export interface BattleEntity {
  id: string;
  name: string;
  level: number;
  stats: DerivedStats;
  hp: number;
  mana: number;
  maxHp: number;
  maxMana: number;
  effects: ActiveEffectRuntime[];
  lastAttackAt: number;
  isPlayer: boolean;
  isBoss?: boolean;
}

export interface EnemySnapshot {
  id: string;
  name: string;
  level: number;
  isBoss?: boolean;
  isElite?: boolean;
  imageUrl?: string | null;
  hp: number;
  maxHp: number;
  effects: Array<{ slug: string; name: string; kind: string; stacks: number; remainingMs: number }>;
}

export interface BattleLogLine {
  text: string;
  type?: string;
}

export type CombatEventKind = "normal" | "crit" | "dot" | "heal" | "hot" | "miss" | "dodge";

export interface CombatEvent {
  target: "player" | "monster";
  kind: CombatEventKind;
  value: number;
  /** id do inimigo específico (multi-inimigo/raid). Ausente = monstro único/agregado. */
  entityId?: string;
}

export interface BattleSnapshot {
  characterHp: number;
  characterMana: number;
  maxHp: number;
  maxMana: number;
  monsterHp: number;
  monsterMaxHp: number;
  playerEffects: Array<{ slug: string; name: string; kind: string; stacks: number; remainingMs: number }>;
  monsterEffects: Array<{ slug: string; name: string; kind: string; stacks: number; remainingMs: number }>;
  enemies?: EnemySnapshot[];
  messages: string[];
  events: CombatEvent[];
}
