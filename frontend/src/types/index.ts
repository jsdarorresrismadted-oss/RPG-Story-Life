export interface Player {
  id: string;
  username: string;
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
  sfCoins: number;
  classId: string | null;
  className: string;
  title: string;
  experience: number;
  stats: CombatStatsPanel;
  equipment: EquipmentMap;
  activeQuests: string[];
  guildId: string | null;
  guildName: string;
  location: string;
}

// ====== 3 Stat Panels ======
export interface CoreStats {
  weaponDamageMin: number;
  weaponDamageMax: number;
  classEnchant: string | null;
  weaponEnchant: string | null;
  helmetEnchant: string | null;
  capeEnchant: string | null;
  baseHp: number;
  baseMana: number;
  baseAttack: number;
  baseDefense: number;
  baseMagic: number;
  baseMagicDefense: number;
  baseSpeed: number;
}

export interface ModifierStats {
  damageBoost: number;
  damageResistance: number;
  physicalBoost: number;
  magicalBoost: number;
  physicalResist: number;
  magicalResist: number;
  healingBoost: number;
  healingReceived: number;
  dotBoost: number;
  dotResistance: number;
  armorPenetration: number;
  magicPenetration: number;
  trueDamage: number;
  lifeSteal: number;
  manaSteal: number;
  cooldownReduction: number;
  haste: number;
  manaCostReduction: number;
}

export interface CombatStatsPanel {
  attackPower: number;
  spellPower: number;
  criticalChance: number;
  criticalMultiplier: number;
  hitChance: number;
  dodgeChance: number;
  attackSpeed: number;
  cooldownReductionTotal: number;
  manaRegen: number;
  healthRegen: number;
  maxHp: number;
  maxMana: number;
  threat: number;
  aggro: number;
  pvpDamage: number;
  pveDamage: number;
  bossDamage: number;
  eliteDamage: number;
  elementalDamage: number;
  resistance: number;
  luck: number;
  dropRate: number;
  goldBonus: number;
  xpBonus: number;
  speed: number;
}

// ====== Game Class ======
export interface ClassStats {
  hp: number;
  mana: number;
  attack: number;
  defense: number;
  magic: number;
  magicDefense: number;
  speed: number;
  attackPower: number;
  spellPower: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  attackSpeedMs: number;
  manaRegenPerTick: number;
  healthRegenPerTick: number;
}

export interface StatModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  coreStats: Record<string, number>;
  conversions: Array<{ stat: string; target: string; factor: number }>;
  isActive: boolean;
}

export interface GameClass {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  role: string;
  combatType: string;
  rankMax: number;
  requiredLevel?: number;
  requiredVip?: boolean;
  resource: Record<string, any>;
  isStarter: boolean;
  isActive: boolean;
  sortOrder: number;
  statModel: StatModel | null;
  stats?: ClassStats;
  skills: Skill[];
  passives: ClassPassive[];
}

export interface CharacterClass {
  id: string;
  characterId: string;
  classId: string;
  rank: number;
  experience: number;
  isActive: boolean;
  gameClass: GameClass;
}

export interface ClassPassive {
  id: string;
  classId: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  rankRequired: number;
  sortOrder: number;
  statModifiers: Record<string, any>;
  skillModifiers: Array<Record<string, any>>;
  effectModifiers: Array<Record<string, any>>;
  conditions: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  isActive: boolean;
}

export interface SkillAction {
  action: string;
  amount?: number;
  scaling?: Array<{ stat: string; factor: number }>;
  damageType?: string;
  percentOfMax?: number;
  effect?: string;
  stacks?: number;
  target?: string;
  name?: string;
  percent?: number;
}

export interface Skill {
  id: string;
  classId: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  iconSecondary?: string | null;
  kind: string;
  trigger: 'auto' | 'active' | 'ultimate';
  target: string;
  cooldown: number;
  manaCost: number;
  castTime: number;
  channelMs: number;
  rankRequired: number;
  sortOrder: number;
  isActive: boolean;
  scaling: Array<{ stat: string; factor: number }>;
  actions: SkillAction[];
  conditions: Array<Record<string, any>>;
  onConditionMet: SkillAction[];
  events: Array<Record<string, any>>;
  damageModifier?: number;
  healModifier?: number;
}

export interface Enemy {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  magicAttack: number;
  magicDefense: number;
  speed: number;
  expReward: number;
  goldReward: number;
  lootTable: LootEntry[];
  image?: string;
  buffs: Buff[];
  debuffs: Debuff[];
}

export interface LootEntry {
  itemId: string;
  chance: number;
  minQuantity: number;
  maxQuantity: number;
}

export interface Buff {
  id: string;
  name: string;
  icon: string;
  duration: number;
  maxDuration: number;
  stat: string;
  value: number;
  type: 'buff';
  source: string;
}

export interface Debuff {
  id: string;
  name: string;
  icon: string;
  duration: number;
  maxDuration: number;
  stat: string;
  value: number;
  type: 'debuff';
  source: string;
}

export interface CombatState {
  inCombat: boolean;
  enemy: Enemy | null;
  turn: 'player' | 'enemy';
  round: number;
  combatLog: CombatLogEntry[];
  playerBuffs: Buff[];
  playerDebuffs: Debuff[];
  enemyBuffs: Buff[];
  enemyDebuffs: Debuff[];
}

export interface CombatLogEntry {
  id: string;
  timestamp: number;
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'dodge' | 'crit' | 'system' | 'loot';
  source: string;
  target: string;
  value?: number;
  message: string;
  isCrit?: boolean;
  isDodge?: boolean;
}

export interface PvpOpponent {
  id: string;
  name: string;
  username: string;
  level: number;
  className: string;
  arenaRating: number;
  arenaWins: number;
  arenaLosses: number;
}

export interface PvpMe {
  id: string;
  name: string;
  level: number;
  className: string;
  arenaRating: number;
  arenaWins: number;
  arenaLosses: number;
  pvpKills: number;
}

export interface PvpMatchState {
  type?: "started" | "tick" | "ended" | "skill";
  matchId: string;
  challengerCharacterId: string;
  opponentCharacterId: string;
  challengerName: string;
  opponentName: string;
  challengerHp: number;
  challengerMaxHp: number;
  challengerMana: number;
  challengerMaxMana: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentMana: number;
  opponentMaxMana: number;
  opponentLevel?: number;
  challengerRating?: number;
  opponentRating?: number;
  challengerSkills?: any[];
  opponentSkills?: any[];
  challengerCooldowns?: Array<{ skillId: string; remaining: number }>;
  opponentCooldowns?: Array<{ skillId: string; remaining: number }>;
  messages?: string[];
  state: "active" | "won" | "lost" | "error" | "fled";
  won?: boolean;
  ratingDelta?: number;
  goldReward?: number;
  fled?: boolean;
}

export interface InventoryItem {
  id: string;
  characterId?: string;
  itemId: string;
  quantity: number;
  isEquipped: boolean;
  item: Item;
  recipe?: CraftRecipeInfo | null;
}

export interface CraftIngredient {
  itemName: string;
  quantity: number;
}

export interface CraftRecipeInfo {
  id: string;
  name: string;
  description: string;
  resultQuantity: number;
  requiredLevel: number;
  requiredVip: boolean;
  goldCost: number;
  requiredQuestIds: string[];
  requiredQuests: { id: string; title: string }[];
  ingredients: CraftIngredient[];
}

export interface Enchantment {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string | null;
  category: string;
  rarity: string;
  level: number;
  minRank: number;
  price: number;
  compatibleSlots: string;
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  dps?: number;
  attackSpeedMs?: number;
  requiredVip?: boolean;
  computedStats?: {
    strength: number;
    intellect: number;
    endurance: number;
    dexterity: number;
    wisdom: number;
    luck: number;
    dps: number;
    attackSpeedMs: number;
  };
}

export interface UserEnchantment {
  id: string;
  enchantmentId: string;
  quantity: number;
  enchantment: Enchantment;
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  level: number;
  rank: number;
  description: string;
  stats?: string | null;
  effects?: string | null;
  strength: number;
  intellect: number;
  endurance: number;
  dexterity: number;
  wisdom: number;
  luck: number;
  enchantmentId?: string | null;
  enchantment?: Enchantment | null;
  sellPrice: number;
  buyPrice: number;
  stackable: boolean;
  isTradable: boolean;
  isSellable: boolean;
  icon?: string | null;
  attackSpeedMs?: number;
  dps?: number;
  boosterId?: string | null;
  boostType?: string | null;
  boostValue?: number;
  boosters?: WeaponBoosterInstance[] | null;
  isTemporary?: boolean;
}

export interface WeaponBoosterInstance {
  slug: string;
  name: string;
  kind: string;
  value: number;
}

export type ItemType =
  | 'weapon'
  | 'class'
  | 'helm'
  | 'armor'
  | 'cape'
  | 'ring'
  | 'necklace'
  | 'consumable';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface ItemRequirements {
  level?: number;
  class?: string;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
}

export type EquipmentSlot =
  | 'weapon'
  | 'class'
  | 'helm'
  | 'armor'
  | 'cape'
  | 'ring'
  | 'necklace';

export type EquipmentMap = Record<EquipmentSlot, InventoryItem | null>;

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  difficulty: QuestDifficulty;
  levelRequired?: number;
  requiredLevel?: number;
  xpReward: number;
  goldReward: number;
  objectives?: QuestObjective[];
  rewards?: QuestRewards;
  isRepeatable?: boolean;
  timeLimit?: number;
  location?: string;
  npcName?: string;
  dialogue?: QuestDialogue[];
}

export type QuestType = 'main' | 'side' | 'daily' | 'weekly' | 'guild' | 'event';
export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'elite' | 'legendary';

export interface QuestObjective {
  id: string;
  type: 'kill' | 'collect' | 'talk' | 'explore' | 'craft' | 'deliver';
  target: string;
  quantity: number;
  current: number;
  description: string;
  location?: string;
}

export interface QuestRewards {
  xp: number;
  gold: number;
  items?: string[];
  reputation?: number;
  title?: string;
}

export interface QuestDialogue {
  npc: string;
  text: string;
  options?: QuestDialogueOption[];
}

export interface QuestDialogueOption {
  text: string;
  nextIndex: number;
  requirement?: string;
}

export interface ActiveQuest {
  questId: string;
  quest: Quest;
  startedAt: number;
  objectives: QuestObjective[];
  completed: boolean;
  expiredAt?: number;
}

export interface Guild {
  id: string;
  name: string;
  tag: string;
  level: number;
  experience?: number;
  xp?: number;
  xpToNext?: number;
  description: string;
  icon?: string | null;
  logo?: string;
  leaderId?: string;
  leaderName?: string;
  memberCount?: number;
  maxMembers?: number;
  members?: GuildMember[];
  bank?: GuildBank;
  shop?: GuildShopItem[];
  settings?: GuildSettings;
  createdAt?: number;
}

export interface GuildShopItem {
  id: string;
  guildId: string;
  itemId: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  item?: {
    id: string;
    name: string;
    icon: string | null;
    rarity: string;
    type: string;
    description: string;
    level: number;
  } | null;
}

export interface LeaderboardEntry {
  position: number;
  username: string;
  displayName: string;
  characterName: string;
  className: string | null;
  classSlug: string | null;
  classIcon: string | null;
  level: number;
  experience: number;
  pvpKills: number;
  force: number;
  gold: number;
  sfCoins: number;
  isVip: boolean;
}

export interface GuildMember {
  id: string;
  username: string;
  rank: GuildRank;
  level: number;
  className: string;
  contribution: number;
  joinedAt: number;
  lastOnline: number;
  isOnline: boolean;
  role?: string;
  guildRank?: number;
}

export type GuildRank = 'leader' | 'officer' | 'member';

export interface GuildBank {
  gold: number;
  items: InventoryItem[];
  logs: GuildBankLog[];
}

export interface GuildBankLog {
  id: string;
  memberName: string;
  action: 'deposit' | 'withdraw';
  item?: string;
  gold?: number;
  timestamp: number;
}

export interface GuildSettings {
  isPublic: boolean;
  levelRequired: number;
  language: string;
  region: string;
}

export interface GuildQuest {
  id: string;
  title: string;
  description: string;
  type: 'kill' | 'collect' | 'pvp';
  targetName: string | null;
  targetCount: number;
  xpReward: string;
  goldReward: string;
  gcReward: string;
  expiresAt: string | null;
  count: number;
  claimed: boolean;
  completed: boolean;
}

export interface MarketListing {
  id: string;
  sellerId?: string;
  sellerName?: string;
  seller?: { id?: string; username?: string; displayName?: string };
  item: Item;
  quantity?: number;
  price?: number;
  pricePerUnit?: number;
  currency?: 'gold' | 'sf_coins';
  listedAt?: number;
  expiresAt?: number;
  status?: 'active' | 'sold' | 'cancelled';
}

export interface ChatMessage {
  userId: string;
  username: string;
  role?: string;
  isVip?: boolean;
  guildTag?: string | null;
  guildName?: string | null;
  guildRole?: string | null;
  level?: number;
  characterName?: string | null;
  channel: ChatChannel;
  message: string;
  timestamp: number;
  isSystem?: boolean;
  isEmote?: boolean;
  isWhisper?: boolean;
  targetId?: string;
  targetName?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: string;
  avatar?: string | null;
  level?: number;
  gold?: number;
  sfCoins?: number;
  pvpCoins?: number;
  gc?: number;
  vipUntil?: string | null;
  vipOwned?: boolean;
  experience?: number;
  isOnline?: boolean;
  createdAt?: string;
  characters?: Character[];
}

export interface Character {
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
  level: number;
  classId?: string | null;
  className?: string;
  class?: { name: string; slug: string; icon?: string | null } | null;
  experience?: number;
  xpToNext?: number;
  experienceToNext?: number;
  atMaxLevel?: boolean;
  currentHp?: number;
  maxHp?: number;
  currentMana?: number;
  maxMana?: number;
  currentStamina?: number;
  maxStamina?: number;
  gold?: number;
  sfCoins?: number;
  classProgress?: CharacterClass[];
}

export interface CharacterIndex {
  classes: GameClass[];
}

export interface GameLimits {
  maxLevel: number;
  maxGold: number;
  maxSfCoins: number;
  xpPerLevel: number;
}

export interface Map {
  id: string;
  name: string;
  slug: string;
  description: string;
  region: string;
  requiredLevel: number;
  type?: string;
  raidResetHours?: number | null;
  maxRaidAttempts?: number | null;
  raidWaves?: number | null;
  raidDifficulty?: number | null;
  pinLeft?: number | null;
  pinTop?: number | null;
  npcs?: { id: string; npc: { id: string; name: string; type?: string } }[];
  monsters?: {
    id: string;
    monster: { id: string; name: string; level: number; hp: number; element: string; isBoss?: boolean; isElite?: boolean; skills?: string | null };
  }[];
  connections?: { id: string; toMap: { slug: string; name: string }; requiredLevel: number }[];
}

export interface CombatEffect {
  slug: string;
  name: string;
  kind: string;
  stacks: number;
  remainingMs: number;
}

export interface RaidProgress {
  mapId: string;
  mapName: string;
  wave: number;
  totalWaves: number;
  boss: boolean;
  cleared?: boolean;
}

export interface CombatSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  iconSecondary?: string | null;
  kind: string;
  trigger: 'auto' | 'active' | 'ultimate';
  cooldown: number;
  manaCost: number;
  castTime: number;
  channelMs: number;
  rankRequired: number;
  scaling: Array<{ stat: string; factor: number }>;
  actions: SkillAction[];
  conditions: Array<Record<string, any>>;
  onConditionMet: SkillAction[];
  damageModifier?: number;
  healModifier?: number;
}

export interface CombatFloatEvent {
  target: "player" | "monster";
  kind: "normal" | "crit" | "dot" | "heal" | "hot" | "miss" | "dodge";
  value: number;
  /** id do inimigo específico (onda multi-inimigo). Ausente = monstro único. */
  entityId?: string;
}

export interface CombatEnemySnapshot {
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

export interface CombatUpdate {
  combatId: string;
  skillId?: string;
  skillName?: string;
  state: 'active' | 'won' | 'lost' | 'fled' | 'error';
  characterHp: number;
  characterMana?: number;
  maxHp?: number;
  maxMana?: number;
  monsterHp: number;
  monsterName?: string;
  monsterMaxHp?: number;
  characterName?: string;
  characterLevel?: number;
  monsterLevel?: number;
  skills?: CombatSkill[];
  stats?: Partial<ClassStats>;
  events?: CombatFloatEvent[];
  damage?: number;
  playerDamage?: number;
  playerSkillName?: string;
  healed?: number;
  manaRestored?: number;
  appliedBuffs?: string[];
  appliedEffects?: string[];
  consumedStacks?: number;
  isCritical?: boolean;
  isMissed?: boolean;
  isDodged?: boolean;
  attacker?: string;
  action?: string;
  fled?: boolean;
  itemName?: string;
  resumed?: boolean;
  drops?: { name: string; quantity: number }[];
  messages?: string[];
  playerEffects?: CombatEffect[];
  monsterEffects?: CombatEffect[];
  enemies?: CombatEnemySnapshot[] | null;
  raid?: RaidProgress | null;
  rewards?: { xpGain?: number; goldGain?: number; levelUps?: number; classXpGain?: number; drops?: { name: string; quantity: number }[] } | null;
}

export type ChatChannel = 'global' | 'local' | 'party' | 'guild' | 'trade' | 'system' | 'whisper';

export interface MapLocation {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  type: 'town' | 'dungeon' | 'boss' | 'shop' | 'quest' | 'portal';
  levelRequired: number;
  isUnlocked: boolean;
  connectedTo: string[];
  image?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; username: string; email: string } | null;
  accessToken: string | null;
  error: string | null;
}

export interface WebSocketEvent {
  event: string;
  data: unknown;
}
