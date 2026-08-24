// ===== CONSTANTES CENTRAIS DO JOGO =====

// Tipos de Item
export const ITEM_TYPES = [
  "weapon", "class", "helm", "armor", "cape", "ring", "necklace", "consumable", "material"
] as const;
export type ItemType = typeof ITEM_TYPES[number];

// Subtipos de Arma
export const WEAPON_SUBTYPES = [
  "sword", "dagger", "staff", "mace", "spear", "bow", "axe", "wand", "gun", "fist"
] as const;
export type WeaponSubtype = typeof WEAPON_SUBTYPES[number];

// Raridades
export const RARITIES = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "limited"
] as const;
export type Rarity = typeof RARITIES[number];

// Raridades que podem ter boosters de arma
export const WEAPON_BOOSTER_RARITIES = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "limited"
] as const;

// Boost caps por raridade (armas)
export const WEAPON_BOOSTER_CAP_BY_RARITY: Record<Rarity, number> = {
  common: 10,
  uncommon: 16,
  rare: 24,
  epic: 32,
  legendary: 42,
  mythic: 51,
  limited: 250,
};

// Boost caps defensivos (armadura/elmo/capa)
export const DEFENSIVE_BOOSTER_CAP_BY_RARITY: Record<Rarity, number> = {
  common: 5,
  uncommon: 8,
  rare: 12,
  epic: 16,
  legendary: 22,
  mythic: 30,
  limited: 50,
};

// Tipos de NPC
export const NPC_TYPES = [
  "vendor", "shop", "enchantments", "classes", "quest_giver", "quest", "dialogue", "travel", "guild"
] as const;
export type NpcType = typeof NPC_TYPES[number];

// Tipos de Quest
export const QUEST_TYPES = [
  "main", "side", "event", "daily", "weekly", "guild", "craft", "exploration"
] as const;
export type QuestType = typeof QUEST_TYPES[number];

// Objetivos de Quest
export const QUEST_OBJECTIVE_TYPES = [
  "kill", "collect", "talk", "visit", "craft", "equip", "level_up", "guild_contribute"
] as const;
export type QuestObjectiveType = typeof QUEST_OBJECTIVE_TYPES[number];

// Tipos de Mapa
export const MAP_TYPES = [
  "normal", "raid", "dungeon", "arena", "city", "guild_hall", "event", "secret"
] as const;
export type MapType = typeof MAP_TYPES[number];

// Elementos
export const ELEMENTS = [
  "physical", "fire", "water", "nature", "light", "dark", "thunder", "ice", "earth", "arcane", "poison"
] as const;
export type Element = typeof ELEMENTS[number];

// Tipos de Dano
export const DAMAGE_TYPES = [
  "physical", "magical", "true"
] as const;
export type DamageType = typeof DAMAGE_TYPES[number];

// Trigger de Skills
export const SKILL_TRIGGERS = [
  "auto", "active", "on_hit", "on_crit", "on_kill", "on_low_hp", "on_skill_use", "passive"
] as const;
export type SkillTrigger = typeof SKILL_TRIGGERS[number];

// Tipos de Skill
export const SKILL_KINDS = [
  "attack", "buff", "debuff", "heal", "utility", "mobility", "summon", "transform"
] as const;
export type SkillKind = typeof SKILL_KINDS[number];

// Ações de Skill
export const SKILL_ACTIONS = [
  "damage", "heal", "apply_effect", "mana", "shield", "teleport", "summon", "transform", "buff", "debuff"
] as const;
export type SkillAction = typeof SKILL_ACTIONS[number];

// Tipos de Efeito
export const EFFECT_TYPES = [
  "buff", "debuff", "hot", "dot", "shield", "stun", "silence", "root", "slow", "haste",
  "invisibility", "invulnerability", "reflect", "lifesteal", "manasteal", "thorns"
] as const;
export type EffectType = typeof EFFECT_TYPES[number];

// Categorias de Encantamento
export const ENCHANTMENT_CATEGORIES = [
  "strength", "intellect", "endurance", "dexterity", "wisdom", "luck", "hybrid"
] as const;
export type EnchantmentCategory = typeof ENCHANTMENT_CATEGORIES[number];

// Tipos de Booster (Gacha - Anel/Colar)
export const BOOSTER_TYPES = [
  "damage", "defense", "drop_chance", "xp", "gold", "class_xp"
] as const;
export type BoosterType = typeof BOOSTER_TYPES[number];

// Tipos de Booster de Arma
export const WEAPON_BOOSTER_KINDS = [
  "damage_percent", "physical_damage_percent", "magical_damage_percent",
  "pvp_damage_percent", "pve_damage_percent", "boss_damage_percent",
  "crit_chance", "crit_damage", "penetration", "hit_chance",
  "lifesteal_percent", "mana_steal_percent", "double_strike_chance",
  "attack_speed_percent", "cooldown_reduction", "dot_percent",
  "execution_percent", "full_hp_damage_percent"
] as const;
export type WeaponBoosterKind = typeof WEAPON_BOOSTER_KINDS[number];

// Boosters Defensivos (Armadura)
export const ARMOR_BOOSTER_KINDS = [
  "hp_percent", "hp_flat", "physical_defense_percent", "magical_defense_percent",
  "hp_regen_percent", "hp_regen_flat", "damage_reduction_percent",
  "pve_damage_reduction_percent", "pvp_damage_reduction_percent",
  "dot_resistance_percent", "debuff_resistance_percent",
  "control_resistance_percent", "critical_damage_resistance_percent"
] as const;
export type ArmorBoosterKind = typeof ARMOR_BOOSTER_KINDS[number];

// Boosters de Elmo
export const HELM_BOOSTER_KINDS = [
  "dodge_percent", "dodge_flat", "hp_percent", "hp_flat",
  "physical_defense_percent", "magical_defense_percent",
  "critical_resistance_percent", "dot_resistance_percent",
  "debuff_resistance_percent", "control_resistance_percent",
  "pve_damage_resistance_percent", "pvp_damage_resistance_percent"
] as const;
export type HelmBoosterKind = typeof HELM_BOOSTER_KINDS[number];

// Boosters de Capa
export const CAPE_BOOSTER_KINDS = [
  "mana_percent", "mana_flat", "mana_regen_percent", "mana_regen_flat",
  "cooldown_reduction_percent", "skill_cooldown_reduction_percent",
  "ultimate_cooldown_reduction_percent", "skill_resource_cost_reduction_percent",
  "xp_percent", "class_xp_percent", "gold_percent",
  "drop_chance_percent", "quest_reward_percent", "boss_drop_chance_percent"
] as const;
export type CapeBoosterKind = typeof CAPE_BOOSTER_KINDS[number];

// Tipos de Set Effect
export const SET_EFFECT_TYPES = [
  "proc_damage", "proc_crit_special", "lifesteal", "shield_on_hit",
  "shield_on_hit_taken", "shield_on_low_hp", "damage_reduction",
  "heal_on_crit", "mana_on_hit", "cooldown_reset", "buff_on_kill",
  "debuff_on_hit", "damage_over_time", "exec_on_low_hp",
  "reflect_damage", "ultimate_empower", "transformation", "passive_stat"
] as const;
export type SetEffectType = typeof SET_EFFECT_TYPES[number];

// Raridades ordenadas por poder
export const RARITY_ORDER: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, limited: 7
};

// Níveis máximos
export const MAX_LEVEL = 100;
export const MAX_ENCHANTMENT_LEVEL = 150;
export const MAX_RANK = 10;

// Itens protegidos (nunca deletados)
export const PROTECTED_STARTER_ITEMS = [
  "Adaga de Iniciante", "Cajado de Iniciante", "Espada de Iniciante",
  "Armadura de Iniciante", "Capacete de Iniciante", "Capa de Iniciante",
  "Lança de Iniciante", "Martelo de Iniciante", "Poção de Vida", "Poção de Mana"
] as const;

// Configurações de Gacha
export const GACHA_DEFAULTS = {
  freeTickets: 3,
  ticketCost: 100,
  chances: {
    common: 50, uncommon: 25, rare: 15, epic: 7, legendary: 2.5, mythic: 0.5
  },
  slotChances: {
    ring: 50, necklace: 50
  }
};

// IA Master config
export const AI_MASTER_CONFIG = {
  providers: ["groq", "cerebras"] as const,
  primaryProvider: "groq",
  fallbackProvider: "cerebras",
  cycleIntervalMs: 5000,
  maxRetries: 3,
  maxTokensPerCall: 4000,
  temperature: 0.8
} as const;