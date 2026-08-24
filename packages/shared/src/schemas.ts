// ===== ZOD SCHEMAS PARA VALIDAÇÃO =====

import { z } from "zod";
import {
  ITEM_TYPES, RARITIES, NPC_TYPES, QUEST_TYPES, MAP_TYPES,
  ELEMENTS, DAMAGE_TYPES, SKILL_TRIGGERS, SKILL_KINDS,
  SKILL_ACTIONS, EFFECT_TYPES, ENCHANTMENT_CATEGORIES,
  BOOSTER_TYPES, WEAPON_BOOSTER_KINDS, ARMOR_BOOSTER_KINDS,
  HELM_BOOSTER_KINDS, CAPE_BOOSTER_KINDS, SET_EFFECT_TYPES,
  QUEST_OBJECTIVE_TYPES
} from "./constants";

// ===== BASE SCHEMAS =====

export const ItemTypeSchema = z.enum(ITEM_TYPES);
export const RaritySchema = z.enum(RARITIES);
export const NpcTypeSchema = z.enum(NPC_TYPES);
export const QuestTypeSchema = z.enum(QUEST_TYPES);
export const MapTypeSchema = z.enum(MAP_TYPES);
export const ElementSchema = z.enum(ELEMENTS);
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export const SkillTriggerSchema = z.enum(SKILL_TRIGGERS);
export const SkillKindSchema = z.enum(SKILL_KINDS);
export const SkillActionSchema = z.enum(SKILL_ACTIONS);
export const EffectTypeSchema = z.enum(EFFECT_TYPES);
export const EnchantmentCategorySchema = z.enum(ENCHANTMENT_CATEGORIES);
export const BoosterTypeSchema = z.enum(BOOSTER_TYPES);
export const WeaponBoosterKindSchema = z.enum(WEAPON_BOOSTER_KINDS);
export const ArmorBoosterKindSchema = z.enum(ARMOR_BOOSTER_KINDS);
export const HelmBoosterKindSchema = z.enum(HELM_BOOSTER_KINDS);
export const CapeBoosterKindSchema = z.enum(CAPE_BOOSTER_KINDS);
export const SetEffectTypeSchema = z.enum(SET_EFFECT_TYPES);
export const QuestObjectiveTypeSchema = z.enum(QUEST_OBJECTIVE_TYPES);

// ===== ITEM SCHEMAS =====

export const BaseItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  icon: z.string().url().optional().nullable(),
  type: ItemTypeSchema,
  subtype: z.string().max(50).optional().nullable(),
  rarity: RaritySchema,
  level: z.number().int().min(1).max(100).default(1),
  rank: z.number().int().min(1).max(10).default(1),
  isTradable: z.boolean().default(true),
  isSellable: z.boolean().default(true),
  isStackable: z.boolean().default(false),
  maxStack: z.number().int().min(1).default(1),
  buyPrice: z.bigint().default(0n),
  sellPrice: z.bigint().default(0n),
  effects: z.string().optional().nullable(), // JSON para consumíveis
  attackSpeedMs: z.number().int().min(0).default(0),
  dps: z.number().min(0).default(0),
  // Core stats
  strength: z.number().int().default(0),
  intellect: z.number().int().default(0),
  endurance: z.number().int().default(0),
  dexterity: z.number().int().default(0),
  wisdom: z.number().int().default(0),
  luck: z.number().int().default(0),
  // Encantamento
  enchantmentId: z.string().uuid().optional().nullable(),
  // Gacha booster (anel/colar)
  boosterId: z.string().uuid().optional().nullable(),
  boostType: z.string().optional().nullable(),
  boostValue: z.number().int().default(0),
  // Boosters de arma (JSON array)
  boosters: z.string().default("[]"), // JSON
  // Boosters defensivos
  armorBoosters: z.string().default("[]"),
  helmBoosters: z.string().default("[]"),
  capeBoosters: z.string().default("[]"),
  // Set system
  setId: z.string().max(50).optional().nullable(),
  // VIP/Status
  requiredVip: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isTemporary: z.boolean().default(false),
});

export const CreateItemSchema = BaseItemSchema;
export const UpdateItemSchema = BaseItemSchema.partial();

export const WeaponBoosterSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  value: z.number(),
});

export const ArmorBoosterSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  value: z.number(),
  slot: z.enum(["armor", "helm", "cape"]),
});

export const SetEffectConfigSchema = z.record(z.unknown());

export const SetEffectSchema = z.object({
  setId: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  effectType: z.enum([
    "proc_damage", "proc_crit_special", "lifesteal", "shield_on_hit",
    "shield_on_hit_taken", "shield_on_low_hp", "damage_reduction",
    "heal_on_crit", "mana_on_hit", "cooldown_reset", "buff_on_kill",
    "debuff_on_hit", "damage_over_time", "exec_on_low_hp",
    "reflect_damage", "ultimate_empower", "transformation", "passive_stat"
  ]),
  effectConfig: SetEffectConfigSchema,
  isActive: z.boolean().default(true),
});

// ===== NPC SCHEMAS =====

export const NpcActionSchema = z.object({
  type: z.string().max(40),
  label: z.string().max(60),
  icon: z.string().max(40).optional().nullable(),
  order: z.number().int().min(0).default(0),
  requirements: z.string().optional().nullable(), // JSON
  target: z.string().max(200).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const BaseNpcSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional().nullable(),
  type: NpcTypeSchema,
  mapId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const CreateNpcSchema = BaseNpcSchema.extend({
  actions: z.array(NpcActionSchema).optional(),
});
export const UpdateNpcSchema = BaseNpcSchema.partial().extend({
  actions: z.array(NpcActionSchema).optional(),
});

// ===== QUEST SCHEMAS =====

export const QuestObjectiveSchema = z.object({
  type: z.enum([
    "kill", "collect", "talk", "visit", "craft", "equip", "level_up", "guild_contribute"
  ]),
  target: z.string().max(100), // monster name, item name, npc name, map name
  amount: z.number().int().min(1).default(1),
  mapId: z.string().uuid().optional().nullable(),
});

export const QuestRewardSchema = z.object({
  xp: z.number().int().min(0).default(0),
  gold: z.number().int().min(0).default(0),
  items: z.array(z.object({
    itemName: z.string(),
    quantity: z.number().int().min(1).default(1),
  })).optional(),
  classXp: z.number().int().min(0).default(0),
});

export const BaseQuestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000),
  type: QuestTypeSchema,
  difficulty: z.enum(["easy", "medium", "hard", "expert"]).default("medium"),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  objectives: z.array(QuestObjectiveSchema).min(1),
  rewards: QuestRewardSchema,
  giverNpcId: z.string().uuid().optional().nullable(),
  mapId: z.string().uuid().optional().nullable(),
  isRepeatable: z.boolean().default(false),
  cooldownHours: z.number().int().min(0).default(0),
  maxCompletions: z.number().int().min(1).default(1),
  prerequisiteQuestIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().default(true),
});

export const CreateQuestSchema = BaseQuestSchema;
export const UpdateQuestSchema = BaseQuestSchema.partial();

// ===== MAP SCHEMAS =====

export const BaseMapSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  imageUrl: z.string().url().optional().nullable(),
  region: z.string().max(100),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  requiredQuestId: z.string().uuid().optional().nullable(),
  isPvPZone: z.boolean().default(false),
  type: MapTypeSchema.default("normal"),
  eventId: z.string().uuid().optional().nullable(),
  raidResetHours: z.number().int().min(1).optional().nullable(),
  maxRaidAttempts: z.number().int().min(1).optional().nullable(),
  raidWaves: z.number().int().min(1).default(10),
  raidDifficulty: z.number().min(0.1).max(10).default(2.0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  pinLeft: z.number().min(0).max(100).optional().nullable(),
  pinTop: z.number().min(0).max(100).optional().nullable(),
});

export const CreateMapSchema = BaseMapSchema;
export const UpdateMapSchema = BaseMapSchema.partial();

// ===== MONSTER SCHEMAS =====

export const MonsterSkillActionSchema = z.object({
  action: z.enum(["damage", "heal", "apply_effect", "mana"]),
  amount: z.number().optional(),
  effectId: z.string().uuid().optional(),
  target: z.enum(["self", "target", "all_enemies", "all_allies", "random_enemy"]).default("target"),
  chance: z.number().min(0).max(1).default(1),
});

export const MonsterSkillSchema = z.object({
  name: z.string().min(1).max(50),
  kind: z.enum(["attack", "buff", "debuff", "heal", "utility"]),
  trigger: z.enum(["auto", "active", "on_hit", "on_crit", "on_kill", "on_low_hp", "on_skill_use", "passive"]),
  target: z.enum(["self", "enemy", "ally", "all_enemies", "all_allies", "random_enemy"]).default("enemy"),
  cooldown: z.number().int().min(0).default(0),
  manaCost: z.number().int().min(0).default(0),
  actions: z.array(MonsterSkillActionSchema),
});

export const BaseMonsterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional().nullable(),
  level: z.number().int().min(1).max(100),
  isBoss: z.boolean().default(false),
  isElite: z.boolean().default(false),
  element: ElementSchema.default("physical"),
  faction: z.string().max(50).default("neutral"),
  hp: z.number().int().min(1),
  mana: z.number().int().min(0).default(0),
  attack: z.number().int().min(0),
  defense: z.number().int().min(0),
  magic: z.number().int().min(0),
  magicDefense: z.number().int().min(0),
  speed: z.number().int().min(1).default(10),
  criticalChance: z.number().min(0).max(100).default(2),
  criticalDamage: z.number().min(100).max(500).default(150),
  dodge: z.number().min(0).max(100).default(1),
  accuracy: z.number().min(0).max(100).default(90),
  attackSpeed: z.number().int().min(100).max(5000).default(2000),
  xpReward: z.number().int().min(0).default(0),
  goldReward: z.number().int().min(0).default(0),
  skills: z.array(MonsterSkillSchema).optional(),
  dropTable: z.array(z.object({
    itemName: z.string(),
    chance: z.number().min(0).max(1),
    minQty: z.number().int().min(1).default(1),
    maxQty: z.number().int().min(1).default(1),
    isGuaranteed: z.boolean().default(false),
  })).optional(),
});

export const CreateMonsterSchema = BaseMonsterSchema;
export const UpdateMonsterSchema = BaseMonsterSchema.partial();

// ===== CRAFT RECIPE SCHEMAS =====

export const CraftIngredientSchema = z.object({
  itemId: z.string().uuid().optional(),
  itemName: z.string().optional(),
  quantity: z.number().int().min(1),
}).refine(data => data.itemId || data.itemName, {
  message: "Either itemId or itemName is required"
});

export const BaseCraftRecipeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  resultItemId: z.string().uuid().optional(),
  resultItemName: z.string().optional(),
  resultQuantity: z.number().int().min(1).default(1),
  resultClassId: z.string().uuid().optional().nullable(),
  goldCost: z.number().int().min(0).default(0),
  ingredients: z.array(CraftIngredientSchema).min(1),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  requiredClassId: z.string().uuid().optional().nullable(),
  requiredQuestId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(data => data.resultItemId || data.resultItemName || data.resultClassId, {
  message: "Must have result item or result class"
});

export const CreateCraftRecipeSchema = BaseCraftRecipeSchema;
export const UpdateCraftRecipeSchema = BaseCraftRecipeSchema.partial();

// ===== SHOP SCHEMAS =====

export const ShopItemSchema = z.object({
  npcId: z.string().uuid(),
  itemId: z.string().uuid().optional(),
  enchantmentId: z.string().uuid().optional(),
  currency: z.enum(["gold", "diamond"]).default("gold"),
  price: z.bigint().default(0),
  stock: z.number().int().default(-1),
  requiredLevel: z.number().int().min(1).default(1),
  requiredVip: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const CreateShopItemSchema = ShopItemSchema;
export const UpdateShopItemSchema = ShopItemSchema.partial();

// ===== EVENT SCHEMAS =====

export const BaseEventSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500),
  type: z.enum(["raid", "quest", "festival", "season", "world_boss"]).default("raid"),
  imageUrl: z.string().url().optional().nullable(),
  levelMin: z.number().int().min(1).max(100).default(1),
  levelMax: z.number().int().min(1).max(100).optional().nullable(),
  xpBonus: z.number().int().min(0).max(500).default(0),
  goldBonus: z.number().int().min(0).max(500).default(0),
  dropBonus: z.number().int().min(0).max(500).default(0),
  sortOrder: z.number().int().default(0),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isActive: z.boolean().default(false),
});

export const CreateEventSchema = BaseEventSchema;
export const UpdateEventSchema = BaseEventSchema.partial();

// ===== WORLD BOSS SCHEMAS =====

export const WorldBossAbilitySchema = z.object({
  name: z.string(),
  damage: z.number().int().min(1),
  cooldown: z.number().int().min(1), // seconds
  type: z.enum(["physical", "magical", "aoe", "heal"]),
  description: z.string().optional(),
});

export const WorldBossPhaseSchema = z.object({
  name: z.string(),
  hpThreshold: z.number().min(0).max(100), // percentage
  mechanics: z.array(z.string()),
});

export const WorldBossDropSchema = z.object({
  itemName: z.string(),
  chance: z.number().min(0).max(1),
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).default(1),
  isGuaranteed: z.boolean().default(false),
});

export const BaseWorldBossSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  imageUrl: z.string().url().optional().nullable(),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  hp: z.number().int().min(1000).default(100000),
  maxHp: z.number().int().min(1000).default(100000),
  attack: z.number().int().min(100).default(500),
  defense: z.number().int().min(10).default(100),
  xpReward: z.number().int().min(0).default(10000),
  goldReward: z.number().int().min(0).default(5000),
  phases: z.array(WorldBossPhaseSchema).default([]),
  abilities: z.array(WorldBossAbilitySchema).default([]),
  spawnInterval: z.number().int().min(60).default(3600), // seconds
  duration: z.number().int().min(60).default(1800), // seconds
  maxPlayers: z.number().int().min(1).max(100).default(30),
  dropTable: z.array(WorldBossDropSchema).default([]),
  isActive: z.boolean().default(true),
});

export const CreateWorldBossSchema = BaseWorldBossSchema;
export const UpdateWorldBossSchema = BaseWorldBossSchema.partial();

// ===== GUILD SCHEMAS =====

export const BaseGuildSchema = z.object({
  name: z.string().min(2).max(50),
  tag: z.string().min(2).max(5).toUpperCase(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional().nullable(),
  requiredLevel: z.number().int().min(1).max(100).default(1),
  maxMembers: z.number().int().min(5).max(100).default(20),
  isActive: z.boolean().default(true),
});

export const CreateGuildSchema = BaseGuildSchema;
export const UpdateGuildSchema = BaseGuildSchema.partial();

// ===== CLASS SCHEMAS =====

export const BaseClassSchema = z.object({
  name: z.string().min(2).max(50),
  slug: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500),
  icon: z.string().url().optional().nullable(),
  isStarter: z.boolean().default(false),
  isVip: z.boolean().default(false),
  isActive: z.boolean().default(true),
  // Stat model reference
  statModelId: z.string().uuid().optional().nullable(),
});

export const CreateClassSchema = BaseClassSchema;
export const UpdateClassSchema = BaseClassSchema.partial();

// ===== AUTH SCHEMAS =====

export const RegisterSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z.string().min(2).max(30).optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ===== CHAT SCHEMAS =====

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const AIActionSchema = z.object({
  action: z.enum(["delete", "delete_one", "wipe", "list", "create_lore", "create_content", "analyze_and_plan"]),
  target: z.string().optional(),
  filter: z.string().optional(),
  name: z.string().optional(),
  id: z.string().uuid().optional(),
  description: z.string().optional(),
});

// ===== TYPE EXPORTS =====

export type BaseItem = z.infer<typeof BaseItemSchema>;
export type CreateItem = z.infer<typeof CreateItemSchema>;
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

export type BaseNpc = z.infer<typeof BaseNpcSchema>;
export type CreateNpc = z.infer<typeof CreateNpcSchema>;
export type UpdateNpc = z.infer<typeof UpdateNpcSchema>;
export type NpcAction = z.infer<typeof NpcActionSchema>;

export type BaseQuest = z.infer<typeof BaseQuestSchema>;
export type CreateQuest = z.infer<typeof CreateQuestSchema>;
export type UpdateQuest = z.infer<typeof UpdateQuestSchema>;
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;
export type QuestReward = z.infer<typeof QuestRewardSchema>;

export type BaseMap = z.infer<typeof BaseMapSchema>;
export type CreateMap = z.infer<typeof CreateMapSchema>;
export type UpdateMap = z.infer<typeof UpdateMapSchema>;

export type BaseMonster = z.infer<typeof BaseMonsterSchema>;
export type CreateMonster = z.infer<typeof CreateMonsterSchema>;
export type UpdateMonster = z.infer<typeof UpdateMonsterSchema>;
export type MonsterSkill = z.infer<typeof MonsterSkillSchema>;
export type MonsterSkillAction = z.infer<typeof MonsterSkillActionSchema>;

export type BaseCraftRecipe = z.infer<typeof BaseCraftRecipeSchema>;
export type CreateCraftRecipe = z.infer<typeof CreateCraftRecipeSchema>;
export type UpdateCraftRecipe = z.infer<typeof UpdateCraftRecipeSchema>;
export type CraftIngredient = z.infer<typeof CraftIngredientSchema>;

export type ShopItem = z.infer<typeof ShopItemSchema>;
export type CreateShopItem = z.infer<typeof CreateShopItemSchema>;
export type UpdateShopItem = z.infer<typeof UpdateShopItemSchema>;

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type CreateEvent = z.infer<typeof CreateEventSchema>;
export type UpdateEvent = z.infer<typeof UpdateEventSchema>;

export type BaseWorldBoss = z.infer<typeof BaseWorldBossSchema>;
export type CreateWorldBoss = z.infer<typeof CreateWorldBossSchema>;
export type UpdateWorldBoss = z.infer<typeof UpdateWorldBossSchema>;
export type WorldBossAbility = z.infer<typeof WorldBossAbilitySchema>;
export type WorldBossPhase = z.infer<typeof WorldBossPhaseSchema>;
export type WorldBossDrop = z.infer<typeof WorldBossDropSchema>;

export type BaseGuild = z.infer<typeof BaseGuildSchema>;
export type CreateGuild = z.infer<typeof CreateGuildSchema>;
export type UpdateGuild = z.infer<typeof UpdateGuildSchema>;

export type BaseClass = z.infer<typeof BaseClassSchema>;
export type CreateClass = z.infer<typeof CreateClassSchema>;
export type UpdateClass = z.infer<typeof UpdateClassSchema>;

export type Register = z.infer<typeof RegisterSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type AIAction = z.infer<typeof AIActionSchema>;