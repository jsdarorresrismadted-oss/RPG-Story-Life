// Seed content: starter classes + promote Darkin to admin.
// Usage (with SSH tunnel on 54321):
//   $env:DATABASE_URL = "postgresql://postgres:CpyIKdUgBfuzBkFXkdxTOxnjwwPGORle@127.0.0.1:54321/railway"
//   node prisma/seed-content.js
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Map de overrides de ícone (item NAME -> caminho), gerado pelo script
// scripts/regenerate-item-icons.ts. Mantém os ícones regenerados por IA mesmo
// quando o seed roda de novo no deploy (senão o seed reverteria para os antigos).
let generatedIcons = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, "generated-icons.json"), "utf8");
  generatedIcons = JSON.parse(raw);
} catch {
  generatedIcons = {};
}

function iconForItem(item) {
  return generatedIcons[item.name] || item.icon || null;
}

const starterClasses = [
  {
    name: "Cavaleiro",
    slug: "cavaleiro",
    description: "O escudo inabalável do grupo. Suporta danos massivos e protege os aliados na linha de frente.",
    lore: "Forjado nas frentes de batalha, o Cavaleiro jura proteger os fracos com sua armadura pesada e sua coragem inabalável.",
    icon: "Shield",
    element: "light",
    rarity: "common",
    difficulty: "easy",
    role: "tank",
    statModel: "tank",
    unlockMethod: "auto",
    requiredLevel: 1,
    price: 1500,
    baseHp: 180,
    baseMana: 40,
    baseAttack: 10,
    baseDefense: 18,
    baseMagic: 6,
    baseMagicDefense: 14,
    baseSpeed: 8,
    manaRecovery: 3.0,
    attackScaling: 1.0,
    magicScaling: 0.4,
    critScaling: 0.03,
    critDamageBase: 130.0,
    dodgeScaling: 0.01,
    cooldownScaling: 0.0,
    manaEfficiency: 1.2,
  },
  {
    name: "Mago",
    slug: "mago",
    description: "Arcano devastador. Canaliza magias poderosas para destruir inimigos à distância — mas é frágil.",
    lore: "Estudioso dos mistérios arcanos, o Mago transforma conhecimento em pura destruição mágica.",
    icon: "Wand2",
    element: "fire",
    rarity: "common",
    difficulty: "medium",
    role: "mage",
    statModel: "caster",
    unlockMethod: "auto",
    requiredLevel: 1,
    price: 1500,
    baseHp: 90,
    baseMana: 140,
    baseAttack: 6,
    baseDefense: 6,
    baseMagic: 20,
    baseMagicDefense: 12,
    baseSpeed: 9,
    manaRecovery: 8.0,
    attackScaling: 0.3,
    magicScaling: 1.4,
    critScaling: 0.06,
    critDamageBase: 160.0,
    dodgeScaling: 0.01,
    cooldownScaling: 0.08,
    manaEfficiency: 0.9,
  },
  {
    name: "Assassino",
    slug: "assassino",
    description: "Sombra mortal. Golpes rápidos e críticos devastadores que eliminam alvos antes que reajam.",
    lore: "Treinado nas sombras, o Assassino não é visto nem ouvido — apenas sentido na hora final.",
    icon: "Swords",
    element: "dark",
    rarity: "common",
    difficulty: "hard",
    role: "assassin",
    statModel: "dps",
    unlockMethod: "auto",
    requiredLevel: 1,
    price: 1500,
    baseHp: 110,
    baseMana: 60,
    baseAttack: 16,
    baseDefense: 8,
    baseMagic: 5,
    baseMagicDefense: 8,
    baseSpeed: 16,
    manaRecovery: 5.0,
    attackScaling: 1.3,
    magicScaling: 0.2,
    critScaling: 0.12,
    critDamageBase: 190.0,
    dodgeScaling: 0.06,
    cooldownScaling: 0.04,
    manaEfficiency: 1.0,
  },
  {
    name: "Suporte",
    slug: "suporte",
    description: "Coração do grupo. Cura aliados, concede buffs poderosos e mantém a equipe viva nas piores lutas.",
    lore: "Há quem lute com espada; o Suporte luta para que ninguém precise cair. Sua magia sustenta esperança.",
    icon: "HeartPulse",
    element: "light",
    rarity: "common",
    difficulty: "medium",
    role: "support",
    statModel: "support",
    unlockMethod: "auto",
    requiredLevel: 1,
    price: 1500,
    baseHp: 120,
    baseMana: 120,
    baseAttack: 7,
    baseDefense: 10,
    baseMagic: 14,
    baseMagicDefense: 14,
    baseSpeed: 10,
    manaRecovery: 7.0,
    attackScaling: 0.4,
    magicScaling: 1.1,
    critScaling: 0.04,
    critDamageBase: 140.0,
    dodgeScaling: 0.02,
    cooldownScaling: 0.06,
    manaEfficiency: 0.95,
  },
];

// ===== World content: items, monsters, maps, npcs, shops, quests, skills, buffs, passives, codes =====

const items = [
  // ===== Weapons (STR/INT) =====
  { name: "Espada de Iniciante", description: "Uma espada simples forjada para novos aventureiros.", type: "weapon", subtype: "sword", rarity: "common", level: 1, rank: 1, buyPrice: 50, sellPrice: 10, strength: 4, dexterity: 1, attackSpeedMs: 2000, dps: 8, icon: "/icons/64x64/Armas/fc1441.png" },
  { name: "Adaga de Iniciante", description: "Leve e afiada, ideal para golpes precisos.", type: "weapon", subtype: "dagger", rarity: "common", level: 1, rank: 1, buyPrice: 50, sellPrice: 10, strength: 2, dexterity: 3, attackSpeedMs: 1500, dps: 7, icon: "/icons/64x64/Armas/fc1442.png" },
  { name: "Cajado do Aprendiz", description: "Canaliza os primeiros feitiços de um mago.", type: "weapon", subtype: "staff", rarity: "common", level: 1, rank: 1, buyPrice: 50, sellPrice: 10, intellect: 5, attackSpeedMs: 2400, dps: 8, icon: "/icons/64x64/Armas/fc1443.png" },
  { name: "Cajado da Luz", description: "Um cajado abençoado que fortalece as curas.", type: "weapon", subtype: "staff", rarity: "common", level: 1, rank: 1, buyPrice: 50, sellPrice: 10, intellect: 4, wisdom: 1, attackSpeedMs: 2400, dps: 7, icon: "/icons/64x64/Armas/fc1444.png" },
  { name: "Espada de Ferro", description: "Uma espada de ferro confiável para aventureiros iniciantes.", type: "weapon", subtype: "sword", rarity: "uncommon", level: 3, rank: 2, buyPrice: 150, sellPrice: 30, strength: 8, dexterity: 2, attackSpeedMs: 2000, dps: 15, icon: "/icons/64x64/Armas/fc1445.png" },
  { name: "Adaga Serrilhada", description: "Lâmina serrilhada que causa ferimentos graves.", type: "weapon", subtype: "dagger", rarity: "uncommon", level: 3, rank: 2, buyPrice: 140, sellPrice: 28, strength: 4, dexterity: 6, attackSpeedMs: 1500, dps: 13, icon: "/icons/64x64/Armas/fc1446.png" },
  { name: "Cajado Arcano", description: "Canaliza poder arcano com precisão.", type: "weapon", subtype: "staff", rarity: "uncommon", level: 3, rank: 2, buyPrice: 160, sellPrice: 32, intellect: 10, wisdom: 2, attackSpeedMs: 2400, dps: 15, icon: "/icons/64x64/Armas/fc1447.png" },
  { name: "Machado de Batalha", description: "Uma lâmina pesada que parte escudos.", type: "weapon", subtype: "axe", rarity: "rare", level: 6, rank: 3, buyPrice: 400, sellPrice: 80, strength: 18, endurance: 3, attackSpeedMs: 2600, dps: 30, icon: "/icons/64x64/Armas/fc1448.png" },
  { name: "Grimório Antigo", description: "Um tomo arcano repleto de feitiços esquecidos.", type: "weapon", rarity: "rare", level: 6, rank: 3, buyPrice: 420, sellPrice: 84, intellect: 16, wisdom: 5, attackSpeedMs: 2600, dps: 28, icon: "/icons/64x64/Armas/fc1449.png" },
  // ===== Helms (END/WIS) =====
  { name: "Capuz de Pano", description: "Proteção simples para a cabeça.", type: "helm", rarity: "common", level: 1, rank: 1, buyPrice: 30, sellPrice: 6, endurance: 2, wisdom: 1, icon: "/icons/64x64/Elmo/fc1832.png" },
  { name: "Elmo de Ferro", description: "Elmo resistente dos soldados da vila.", type: "helm", rarity: "uncommon", level: 3, rank: 2, buyPrice: 110, sellPrice: 22, endurance: 6, wisdom: 2, icon: "/icons/64x64/Elmo/fc1838.png" },
  { name: "Coroa Arcano", description: "Coroa encantada que amplifica o conhecimento.", type: "helm", rarity: "rare", level: 6, rank: 3, buyPrice: 360, sellPrice: 72, wisdom: 10, intellect: 5, icon: "/icons/64x64/Elmo/fc1839.png" },
  // ===== Armors (END/DEX) =====
  { name: "Túnica Simples", description: "Roupas leves e confortáveis.", type: "armor", rarity: "common", level: 1, rank: 1, buyPrice: 40, sellPrice: 8, endurance: 3, icon: "/icons/64x64/Robes/fc1969.png" },
  { name: "Armadura de Couro", description: "Proteção leve e resistente.", type: "armor", rarity: "uncommon", level: 2, rank: 2, buyPrice: 120, sellPrice: 24, endurance: 8, dexterity: 2, icon: "/icons/64x64/Armaduras/fc1827.png" },
  { name: "Cota de Malha", description: "Anéis de aço entrelaçados para máxima defesa.", type: "armor", rarity: "rare", level: 6, rank: 3, buyPrice: 380, sellPrice: 76, endurance: 14, strength: 4, icon: "/icons/64x64/Armaduras/fc1828.png" },
  // ===== Capes (WIS/LUK) =====
  { name: "Capa Esfarrapada", description: "Uma capa velha que esconde bem seu dono.", type: "cape", rarity: "common", level: 1, rank: 1, buyPrice: 35, sellPrice: 7, wisdom: 2, luck: 1, icon: "/icons/64x64/Capas/fc1823.png" },
  { name: "Manto de Veludo", description: "Um manto elegante dos nobres da vila.", type: "cape", rarity: "uncommon", level: 3, rank: 2, buyPrice: 130, sellPrice: 26, wisdom: 6, luck: 3, icon: "/icons/64x64/Capas/fc1824.png" },
  { name: "Capa do Vento", description: "Flutua como o vento e melhora os reflexos.", type: "cape", rarity: "rare", level: 6, rank: 3, buyPrice: 340, sellPrice: 68, dexterity: 8, luck: 4, icon: "/icons/64x64/Capas/fc1825.png" },
  // ===== Rings (LUK/STR ou INT) =====
  { name: "Anel de Bronze", description: "Um anel simples, dizem que traz sorte.", type: "ring", rarity: "common", level: 1, rank: 1, buyPrice: 45, sellPrice: 9, icon: "/icons/64x64/Aneis/fc1843.png" },
  { name: "Anel de Prata", description: "Anel prateado de um artesão habilidoso.", type: "ring", rarity: "uncommon", level: 3, rank: 2, buyPrice: 145, sellPrice: 29, icon: "/icons/64x64/Aneis/fc1844.png" },
  { name: "Anel do Fogo", description: "Pulsa com energia ardente.", type: "ring", rarity: "rare", level: 6, rank: 3, buyPrice: 390, sellPrice: 78, icon: "/icons/64x64/Aneis/fc1845.png" },
  // ===== Necklaces (WIS/LUK) =====
  { name: "Colar de Contas", description: "Contas de madeira entalhadas à mão.", type: "necklace", rarity: "common", level: 1, rank: 1, buyPrice: 40, sellPrice: 8, icon: "/icons/64x64/Colares/fc1849.png" },
  { name: "Amuleto da Sorte", description: "Um amuleto que afasta o azar.", type: "necklace", rarity: "uncommon", level: 3, rank: 2, buyPrice: 140, sellPrice: 28, icon: "/icons/64x64/Colares/fc1850.png" },
  { name: "Colar Arcano", description: "Um colar banhado em energia mística.", type: "necklace", rarity: "rare", level: 6, rank: 3, buyPrice: 370, sellPrice: 74, icon: "/icons/64x64/Colares/fc1851.png" },
  // ===== Consumables =====
  { name: "Poção de Vida", description: "Restaura 50 de vida.", type: "consumable", subtype: "potion", rarity: "common", level: 1, isStackable: true, maxStack: 99, buyPrice: 20, sellPrice: 4, effects: '{"heal": 50}', icon: "/icons/64x64/Potion/Vida.png" },
  { name: "Poção de Mana", description: "Restaura 40 de mana.", type: "consumable", subtype: "potion", rarity: "common", level: 1, isStackable: true, maxStack: 99, buyPrice: 25, sellPrice: 5, effects: '{"manaRestore": 40}', icon: "/icons/64x64/Potion/Mana.png" },
  // ===== Materiais de craft (consumíveis) =====
  { name: "Fragmento do Abismo", description: "Um pedaço de pedra sombria que pulsa com energia do submundo. Usado em receitas de craft.", type: "consumable", subtype: "material", rarity: "epic", level: 5, isStackable: true, maxStack: 99, buyPrice: 100, sellPrice: 25, icon: null },
  { name: "Cristal Sombrio", description: "Cristal negro que absorve luz. Matéria-prima rara de forja abissal.", type: "consumable", subtype: "material", rarity: "rare", level: 5, isStackable: true, maxStack: 99, buyPrice: 80, sellPrice: 20, icon: null },
  { name: "Núcleo Demoníaco", description: "O coração pulsante de um demônio derrotado. Muito valioso.", type: "consumable", subtype: "material", rarity: "legendary", level: 5, isStackable: true, maxStack: 99, buyPrice: 200, sellPrice: 50, icon: null },
  // ===== Itens craftáveis =====
  { name: "Espada do Abismo", description: "Forjada no submundo, essa espada drena a vitalidade dos inimigos. Só pode ser criada pelos mais fortes.", type: "weapon", subtype: "sword", rarity: "epic", level: 10, rank: 4, buyPrice: 0, sellPrice: 1000, strength: 35, dexterity: 15, attackSpeedMs: 2000, dps: 120, icon: null },
  { name: "Manto do Abismo", description: "Um manto costurado com tecido sombrio. Protege quem atravessou a escuridão.", type: "armor", rarity: "epic", level: 10, rank: 4, buyPrice: 0, sellPrice: 800, endurance: 30, wisdom: 12, icon: null },
];

// ===== Encantamentos (independentes dos itens, comprados na loja) =====
// Só equipamentos de combate aceitam enchant: Arma, Armadura, Elmo e Capa.
// O MESMO encantamento pode ser aplicado em arma/armadura/elmo/capa (full build).
// Anéis e Colares NUNCA recebem encantamento.
// Progressão LINEAR por nível: no Nv.1 o principal vale +4 e os demais +2;
// a partir daí cada atributo cresce +2 por nível (Nv.2 = +4/+6, Nv.3 = +6/+8...).
// Matriz completa: 6 categorias x 100 níveis = 600 encantamentos.
const ENCHANT_CATEGORIES = [
  { category: "strength", label: "Força", icon: "Swords" },
  { category: "intellect", label: "Intelecto", icon: "Brain" },
  { category: "endurance", label: "Vigor", icon: "HeartPulse" },
  { category: "dexterity", label: "Destreza", icon: "Wind" },
  { category: "wisdom", label: "Sabedoria", icon: "BookOpen" },
  { category: "luck", label: "Sorte", icon: "Clover" },
];
const ENCHANT_MAX_LEVEL = 100;
const ENCHANT_BASE_SECONDARY = 2;
const ENCHANT_BASE_MAIN = 4;
const ENCHANT_COMPATIBLE_SLOTS = '["weapon","armor","cape","helm"]';

function enchantRarityForLevel(level) {
  if (level <= 20) return "common";
  if (level <= 40) return "uncommon";
  if (level <= 60) return "rare";
  if (level <= 80) return "epic";
  if (level <= 95) return "legendary";
  return "mythic";
}

function enchantValuesForLevel(category, level) {
  const main = ENCHANT_BASE_MAIN + 2 * (level - 1);
  const secondary = ENCHANT_BASE_SECONDARY + 2 * (level - 1);
  return {
    strength: secondary,
    intellect: secondary,
    endurance: secondary,
    dexterity: secondary,
    wisdom: secondary,
    luck: secondary,
    [category]: main,
  };
}

const enchantments = [];
for (const { category, label, icon } of ENCHANT_CATEGORIES) {
  for (let level = 1; level <= ENCHANT_MAX_LEVEL; level++) {
    const values = enchantValuesForLevel(category, level);
    enchantments.push({
      name: label,
      slug: `${category}-${level}`,
      description: `Encantamento de ${label} — dá +${values[category]} em ${label} e +${values.strength} em quase todos os outros atributos.`,
      category,
      rarity: enchantRarityForLevel(level),
      level,
      minRank: 1,
      price: 500 * level,
      compatibleSlots: ENCHANT_COMPATIBLE_SLOTS,
      icon,
      strength: values.strength,
      intellect: values.intellect,
      endurance: values.endurance,
      dexterity: values.dexterity,
      wisdom: values.wisdom,
      luck: values.luck,
    });
  }
}

// ===== Boosters (Anel/Colar de Gacha) — só boosts %, sem core stats =====
const BOOSTER_INFO = [
  { boostType: "defense", label: "Defesa" },
  { boostType: "damage", label: "Dano Geral" },
  { boostType: "dropChance", label: "Chance de Drop" },
  { boostType: "xp", label: "XP" },
  { boostType: "gold", label: "Gold" },
  { boostType: "classXp", label: "XP de Classe" },
];
const BOOSTER_MAX = { common: 5, uncommon: 10, rare: 15, epic: 20, legendary: 25, mythic: 30 };
const BOOSTER_RARITY_LABEL = { common: "Comum", uncommon: "Incomum", rare: "Raro", epic: "Épico", legendary: "Lendário", mythic: "Mítico" };
const boosters = [];
for (const rarity of ["common", "uncommon", "rare", "epic", "legendary", "mythic"]) {
  BOOSTER_INFO.forEach((info, i) => {
    const isRing = i % 2 === 0;
    const kind = isRing ? "Anel" : "Colar";
    const value = BOOSTER_MAX[rarity];
    boosters.push({
      name: `${kind} ${info.label} ${BOOSTER_RARITY_LABEL[rarity]}`,
      slug: `${isRing ? "anel" : "colar"}-${info.boostType}-${rarity}`,
      description: `Aumenta ${info.label.toLowerCase()} em +${value}%.`,
      type: isRing ? "ring" : "necklace",
      rarity,
      boostType: info.boostType,
      boostValue: value,
    });
  });
}

const monsters = [
  { name: "Dummy de Treino", description: "Um boneco de madeira usado para treinar golpes na vila. Não revida.", level: 1, hp: 300, mana: 0, attack: 0, defense: 5, magic: 0, magicDefense: 5, speed: 1, xpReward: 0, goldReward: 0, attackSpeed: 99999 },
  { name: "Rato da Floresta", description: "Um roedor feroz que invade acampamentos.", level: 1, hp: 30, mana: 0, attack: 6, defense: 2, magic: 0, magicDefense: 2, speed: 10, xpReward: 20, goldReward: 8, attackSpeed: 2000, drops: [{ item: "Poção de Vida", chance: 30, min: 1, max: 2 }, { item: "Anel de Bronze", chance: 45, min: 1, max: 2 }] },
  { name: "Slime Verde", description: "Gosma gelatinosa comum nas florestas.", level: 1, hp: 25, mana: 0, attack: 5, defense: 3, magic: 0, magicDefense: 2, speed: 5, xpReward: 15, goldReward: 5, attackSpeed: 2500, drops: [{ item: "Poção de Mana", chance: 25, min: 1, max: 1 }, { item: "Capa Esfarrapada", chance: 40, min: 1, max: 2 }] },
  { name: "Lobo Cinzento", description: "Um predador veloz que caça em matilha.", level: 2, hp: 45, mana: 0, attack: 9, defense: 4, magic: 0, magicDefense: 3, speed: 14, xpReward: 35, goldReward: 15, attackSpeed: 1800, skills: JSON.stringify([{ name: "Mordida Feroz", slug: "mordida-feroz", description: "Uma mordida poderosa que causa dano extra.", kind: "attack", trigger: "active", target: "enemy", cooldown: 5000, manaCost: 0, rankRequired: 1, actions: [{ action: "damage", amount: 12, scaling: [{ stat: "attack", factor: 1.2 }], damageType: "physical" }] }]), drops: [{ item: "Poção de Vida", chance: 40, min: 1, max: 2 }, { item: "Espada de Ferro", chance: 8, min: 1, max: 1 }, { item: "Colar de Contas", chance: 35, min: 1, max: 1 }] },
  { name: "Goblin Saqueador", description: "Pequeno, covarde e perigoso com sua adaga.", level: 3, hp: 60, mana: 10, attack: 12, defense: 5, magic: 2, magicDefense: 3, speed: 12, xpReward: 60, goldReward: 25, attackSpeed: 1600, skills: JSON.stringify([{ name: "Adaga Envenenada", slug: "adaga-envenenada", description: "Ataca com uma adaga coberta de veneno corrosivo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 6000, manaCost: 5, rankRequired: 1, actions: [{ action: "damage", amount: 10, scaling: [{ stat: "attack", factor: 1 }], damageType: "physical" }, { action: "applyEffect", effect: "veneno-corrosivo", target: "enemy", stacks: 1 }] }]), drops: [{ item: "Poção de Vida", chance: 30, min: 1, max: 1 }, { item: "Adaga Serrilhada", chance: 10, min: 1, max: 1 }, { item: "Anel de Prata", chance: 20, min: 1, max: 1 }] },
  { name: "Goblin Bruxo", description: "O chefe goblin que comanda a floresta com magia negra. Derrotá-lo concede recompensas em dobro.", level: 4, hp: 130, mana: 30, attack: 16, defense: 7, magic: 9, magicDefense: 6, speed: 10, xpReward: 200, goldReward: 80, attackSpeed: 1500, isBoss: true, skills: JSON.stringify([
    { name: "Bola de Fogo", slug: "bola-de-fogo-goblin", description: "Lança uma esfera de fogo que queima o alvo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 6000, manaCost: 10, rankRequired: 1, actions: [{ action: "damage", amount: 14, scaling: [{ stat: "magic", factor: 1.1 }], damageType: "magic" }, { action: "applyEffect", effect: "chama-arcana", target: "enemy", stacks: 1 }] },
    { name: "Fúria Goblin", slug: "furia-goblin", description: "O goblin entra em fúria, aumentando seu ataque.", kind: "buff", trigger: "active", target: "self", cooldown: 12000, manaCost: 10, rankRequired: 1, actions: [{ action: "applyEffect", effect: "furia-do-guerreiro", target: "self", stacks: 1 }] },
  ]), drops: [{ item: "Cajado Arcano", chance: 25, min: 1, max: 1 }, { item: "Poção de Vida", chance: 50, min: 2, max: 3 }, { item: "Manto de Veludo", chance: 40, min: 1, max: 2 }] },
  { name: "Golem de Pedra", description: "Uma criatura colossal de rocha que guarda a entrada da Caverna do Dragão. Sua pele é quase impenetrável.", level: 8, hp: 400, mana: 20, attack: 28, defense: 18, magic: 4, magicDefense: 12, speed: 6, xpReward: 800, goldReward: 300, attackSpeed: 2000, isElite: true, skills: JSON.stringify([
    { name: "Esmagamento", slug: "esmagamento", description: "O golem ergue os punhos e esmaga o chão, causando grande dano físico.", kind: "attack", trigger: "active", target: "enemy", cooldown: 7000, manaCost: 0, rankRequired: 1, actions: [{ action: "damage", amount: 30, scaling: [{ stat: "attack", factor: 1.3 }], damageType: "physical" }] },
    { name: "Pele de Rocha", slug: "pele-de-rocha", description: "O golem endurece a pele, aumentando sua defesa.", kind: "buff", trigger: "active", target: "self", cooldown: 15000, manaCost: 0, rankRequired: 1, actions: [{ action: "applyEffect", effect: "armadura-arcana", target: "self", stacks: 2 }] },
  ]), drops: [{ item: "Cota de Malha", chance: 20, min: 1, max: 1 }, { item: "Poção de Vida", chance: 60, min: 2, max: 4 }, { item: "Anel de Prata", chance: 100, min: 2, max: 4, guaranteed: true }, { item: "Manto de Veludo", chance: 100, min: 1, max: 2, guaranteed: true }] },
  { name: "Dragão Sombrio", description: "O temido Dragão Sombrio, senhor da Caverna do Dragão. Derrotá-lo é a maior honra de um aventureiro.", level: 12, hp: 1500, mana: 100, attack: 45, defense: 25, magic: 30, magicDefense: 22, speed: 12, xpReward: 5000, goldReward: 2000, attackSpeed: 1400, isBoss: true, skills: JSON.stringify([
    { name: "Sopro de Fogo", slug: "sopro-de-fogo", description: "O dragão cospe fogo, causando dano mágico massivo e queimando o alvo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 8000, manaCost: 20, rankRequired: 1, actions: [{ action: "damage", amount: 40, scaling: [{ stat: "magic", factor: 1.2 }], damageType: "magic" }, { action: "applyEffect", effect: "chama-arcana", target: "enemy", stacks: 2 }] },
    { name: "Garra Sombria", slug: "garra-sombria", description: "Um corte com garras afiadas que faz o alvo sangrar.", kind: "attack", trigger: "active", target: "enemy", cooldown: 5000, manaCost: 10, rankRequired: 1, actions: [{ action: "damage", amount: 30, scaling: [{ stat: "attack", factor: 1.2 }], damageType: "physical" }, { action: "applyEffect", effect: "sangramento", target: "enemy", stacks: 2 }] },
    { name: "Escamas de Ferro", slug: "escamas-de-ferro", description: "O dragão endurece as escamas, aumentando muito sua defesa.", kind: "buff", trigger: "active", target: "self", cooldown: 18000, manaCost: 15, rankRequired: 1, actions: [{ action: "applyEffect", effect: "armadura-arcana", target: "self", stacks: 3 }] },
    { name: "Fúria do Dragão", slug: "furia-do-dragao", description: "O dragão se enfurece, aumentando seu ataque.", kind: "buff", trigger: "active", target: "self", cooldown: 25000, manaCost: 20, rankRequired: 1, actions: [{ action: "applyEffect", effect: "furia-do-guerreiro", target: "self", stacks: 3 }] },
  ]), drops: [{ item: "Machado de Batalha", chance: 30, min: 1, max: 1 }, { item: "Cajado Arcano", chance: 30, min: 1, max: 1 }, { item: "Poção de Vida", chance: 100, min: 3, max: 5 }, { item: "Anel de Prata", chance: 100, min: 5, max: 8, guaranteed: true }, { item: "Manto de Veludo", chance: 100, min: 4, max: 6, guaranteed: true }, { item: "Colar de Contas", chance: 100, min: 3, max: 5, guaranteed: true }] },
];

const maps = [
  {
    name: "Arcádia — Vila Inicial",
    slug: "arcadia",
    description: "Uma vila tranquila onde sua jornada começa. Fale com o Mestre Branko para missões e visite a loja da Aurelia.",
    region: "Reino de Arcádia",
    requiredLevel: 1,
    sortOrder: 1,
  },
  {
    name: "Floresta Sombria",
    slug: "floresta-sombria",
    description: "Uma floresta densa infestada de ratos, slimes, lobos e goblins. Ótimo lugar para treinar.",
    region: "Reino de Arcádia",
    requiredLevel: 1,
    sortOrder: 2,
  },
  {
    name: "Caverna do Dragão",
    slug: "caverna-do-dragao",
    description: "Uma masmorra letal guardada por um Golem de Pedra e dominada pelo Dragão Sombrio. Raid com tentativas limitadas que resetam periodicamente — derrote o boss para ganhar recompensas épicas!",
    region: "Reino de Arcádia",
    requiredLevel: 8,
    type: "raid",
    raidResetHours: 24,
    maxRaidAttempts: 3,
    sortOrder: 3,
  },
];

const npcs = [
  { name: "Aurelia", description: "Vendedora de poções e equipamentos da vila.", type: "vendor", dialogue: "Bem-vindo à minha loja, aventureiro!" },
  { name: "Mestre Branko", description: "Um velho veterano que dá missões aos novatos.", type: "quest_giver", dialogue: "Precisa de trabalho? Tenho algumas tarefas para você." },
  { name: "Mística", description: "A misteriosa dona do baú da sorte da cidade. Com seus tickets, rola Anéis e Colares com poderosos boosts.", type: "gacha", dialogue: "Quer tentar a sorte, aventureiro? Três tickets grátis para começar!" },
  { name: "Eldrin", description: "Encantador veterano de Arcádia. Vende encantamentos para transformar seu equipamento.", type: "enchantments", dialogue: "Procura poder? Meus encantamentos vão reescrever o destino das suas armas!" },
  { name: "Capitão Valdir", description: "Comandante da guarda de Arcádia. Vende classes e treina novos combatentes.", type: "classes", dialogue: "Quer dominar uma nova arte de combate? Escolha sua classe!" },
];

const shopOffers = [
  { npc: "Aurelia", item: "Poção de Vida", price: 20 },
  { npc: "Aurelia", item: "Poção de Mana", price: 25 },
  { npc: "Aurelia", item: "Espada de Ferro", price: 150, class: "cavaleiro" },
  { npc: "Aurelia", item: "Adaga Serrilhada", price: 140, class: "assassino" },
  { npc: "Aurelia", item: "Cajado Arcano", price: 160, class: "mago" },
  { npc: "Aurelia", item: "Armadura de Couro", price: 120, requiredLevel: 3 },
  ...enchantments.map((e) => ({ npc: "Aurelia", enchantment: e.slug, price: e.price })),
  ...enchantments.map((e) => ({ npc: "Eldrin", enchantment: e.slug, price: e.price })),
  { npc: "Capitão Valdir", class: "cavaleiro", price: 1500 },
  { npc: "Capitão Valdir", class: "mago", price: 1500 },
  { npc: "Capitão Valdir", class: "assassino", price: 1500 },
  { npc: "Capitão Valdir", class: "suporte", price: 1500 },
  { npc: "Capitão Valdir", class: "senhor-das-sombras", price: 10000, requiredVip: true },
  { npc: "Aurelia", item: "Anel de Bronze", price: 10 },
  { npc: "Aurelia", item: "Anel de Prata", price: 35 },
  { npc: "Aurelia", item: "Capa Esfarrapada", price: 15 },
  { npc: "Aurelia", item: "Manto de Veludo", price: 45 },
  { npc: "Aurelia", item: "Colar de Contas", price: 25 },
];

const craftRecipes = [
  {
    name: "Espada de Ferro Reforçada",
    description: "Tempere sua espada com ferro bruto.",
    resultItem: "Espada de Ferro",
    resultQuantity: 1,
    requiredLevel: 2,
    ingredients: [{ itemName: "Anel de Bronze", quantity: 2 }],
  },
  {
    name: "Poção de Vida Reforçada",
    description: "Misture ervas e água pura para criar poções.",
    resultItem: "Poção de Vida",
    resultQuantity: 3,
    requiredLevel: 1,
    ingredients: [{ itemName: "Capa Esfarrapada", quantity: 1 }],
  },
  {
    name: "Poção de Mana Reforçada",
    description: "Destile mana bruta em poções de mana.",
    resultItem: "Poção de Mana",
    resultQuantity: 3,
    requiredLevel: 1,
    ingredients: [{ itemName: "Colar de Contas", quantity: 1 }],
  },
  {
    name: "Cajado Arcano Aprimorado",
    description: "Envolva o cajado em prata pura.",
    resultItem: "Cajado Arcano",
    resultQuantity: 1,
    requiredLevel: 3,
    ingredients: [{ itemName: "Anel de Prata", quantity: 3 }],
  },
  {
    name: "Armadura de Couro Reforçada",
    description: "Costure couro resistente na armadura.",
    resultItem: "Armadura de Couro",
    resultQuantity: 1,
    requiredLevel: 3,
    ingredients: [{ itemName: "Manto de Veludo", quantity: 2 }],
  },
  {
    name: "Espada do Abismo",
    description: "Reúna os materiais abissais e pague o ferreiro para forjar a lâmina lendária.",
    resultItem: "Espada do Abismo",
    resultQuantity: 1,
    requiredLevel: 10,
    requiredVip: false,
    requiredQuests: ["O Chefe dos Goblins"],
    goldCost: 50000,
    ingredients: [
      { itemName: "Fragmento do Abismo", quantity: 25 },
      { itemName: "Cristal Sombrio", quantity: 10 },
      { itemName: "Núcleo Demoníaco", quantity: 2 },
    ],
  },
  {
    name: "Manto do Abismo",
    description: "Um manto forjado com a essência dos demônios. Exige patrocínio VIP.",
    resultItem: "Manto do Abismo",
    resultQuantity: 1,
    requiredLevel: 10,
    requiredVip: true,
    requiredQuests: ["O Chefe dos Goblins"],
    goldCost: 40000,
    ingredients: [
      { itemName: "Fragmento do Abismo", quantity: 20 },
      { itemName: "Cristal Sombrio", quantity: 8 },
      { itemName: "Núcleo Demoníaco", quantity: 3 },
    ],
  },
];

const quests = [
  {
    title: "Caçada na Floresta",
    description: "A floresta está infestada de ratos. Elimine 5 Ratos da Floresta para Mestre Branko.",
    type: "main",
    difficulty: "easy",
    requiredLevel: 1,
    giverNpc: "Mestre Branko",
    map: "floresta-sombria",
    objectives: [{ id: "ratos", type: "kill", monsterName: "Rato da Floresta", amount: 5 }],
    xpReward: 100,
    goldReward: 50,
    itemRewards: [{ itemName: "Poção de Vida", quantity: 2 }],
  },
  {
    title: "Lobos à Solta",
    description: "Os lobos estão atacando viajantes. Elimine 3 Lobos Cinzentos.",
    type: "side",
    difficulty: "medium",
    requiredLevel: 1,
    giverNpc: "Mestre Branko",
    map: "floresta-sombria",
    objectives: [{ id: "lobos", type: "kill", monsterName: "Lobo Cinzento", amount: 3 }],
    xpReward: 150,
    goldReward: 80,
    itemRewards: [{ itemName: "Poção de Mana", quantity: 3 }],
  },
  {
    title: "Slimes em Excesso",
    description: "Os slimes estão tomando conta da floresta. Elimine 5 Slimes Verdes.",
    type: "daily",
    difficulty: "easy",
    requiredLevel: 1,
    giverNpc: "Mestre Branko",
    map: "floresta-sombria",
    isRepeatable: true,
    objectives: [{ id: "slimes", type: "kill", monsterName: "Slime Verde", amount: 5 }],
    xpReward: 80,
    goldReward: 40,
  },
  {
    title: "O Chefe dos Goblins",
    description: "Um Goblin Bruxo assumiu o controle da floresta. Elimine-o para provar seu valor.",
    type: "main",
    difficulty: "hard",
    requiredLevel: 3,
    requiredRank: 2,
    requires: ["Caçada na Floresta"],
    giverNpc: "Mestre Branko",
    map: "floresta-sombria",
    objectives: [{ id: "boss", type: "kill", monsterName: "Goblin Bruxo", amount: 1 }],
    xpReward: 400,
    goldReward: 200,
    itemRewards: [{ itemName: "Cajado Arcano", quantity: 1 }],
  },
];

// Efeitos (buff/debuff/hot/dot) — referenciados por slug nas ações das skills
const effects = [
  { name: "Fúria do Guerreiro", slug: "furia-do-guerreiro", description: "Aumenta o ataque.", kind: "buff", category: "stat", duration: 15000, maxStacks: 3, refreshBehavior: "stack", statModifiers: { flat: { attack: 5 } } },
  { name: "Armadura Arcana", slug: "armadura-arcana", description: "Aumenta a defesa.", kind: "buff", category: "stat", duration: 20000, maxStacks: 2, refreshBehavior: "stack", statModifiers: { flat: { defense: 6 } } },
  { name: "Passo das Sombras", slug: "passo-das-sombras", description: "Aumenta a esquiva.", kind: "buff", category: "stat", duration: 12000, maxStacks: 2, refreshBehavior: "stack", statModifiers: { flat: { dodge: 10 } } },
  { name: "Foco Arcano", slug: "foco-arcano", description: "Aumenta a recuperação de mana.", kind: "buff", category: "stat", duration: 20000, maxStacks: 3, refreshBehavior: "stack", statModifiers: { flat: { manaRegenPerTick: 5 } } },
  { name: "Bênção da Luz", slug: "bencao-da-luz", description: "Regenera vida ao longo do tempo.", kind: "hot", category: "healing", duration: 15000, tickInterval: 3000, tickHealing: { base: 12, scaling: [{ stat: "magic", factor: 0.6 }] } },
  { name: "Sangramento", slug: "sangramento", description: "Causa dano ao longo do tempo.", kind: "dot", category: "damage", duration: 10000, tickInterval: 2000, tickDamage: { base: 6, scaling: [{ stat: "attack", factor: 0.4 }], damageType: "physical" }, maxStacks: 3, refreshBehavior: "stack" },
  { name: "Chama Arcana", slug: "chama-arcana", description: "Queima o alvo com fogo arcano.", kind: "dot", category: "damage", duration: 12000, tickInterval: 2000, tickDamage: { base: 7, scaling: [{ stat: "magic", factor: 0.5 }], damageType: "magic" }, maxStacks: 4, refreshBehavior: "stack" },
  { name: "Veneno Corrosivo", slug: "veneno-corrosivo", description: "Veneno que corrói o alvo lentamente.", kind: "dot", category: "damage", duration: 12000, tickInterval: 2000, tickDamage: { base: 5, scaling: [{ stat: "attack", factor: 0.3 }], damageType: "physical" }, maxStacks: 5, refreshBehavior: "stack" },
];

// Skill kit por classe: 1 auto + 3 ativas + 1 ultimate (rankRequired), 3 passivas em `passives`.
// Ranks: auto=1, skill1=1, skill2=3, skill3=5, ultimate=8 | passivas: 1/4/7
// Ações: { action: "damage"|"heal"|"applyEffect"|"mana"|..., ...params } — DSL do motor de batalha.
const classSkills = [
  {
    class: "cavaleiro",
    skills: [
      { name: "Ataque do Cavaleiro", slug: "ataque-do-cavaleiro", description: "Golpeia o inimigo com a espada. Usado automaticamente.", kind: "attack", trigger: "auto", target: "enemy", cooldown: 2000, manaCost: 0, rankRequired: 1, sortOrder: 1, icon: "/icons/64x64/Skills/fc1106.png", actions: [{ action: "damage", amount: 6, scaling: [{ stat: "attack", factor: 1 }], damageType: "physical" }] },
      { name: "Golpe de Escudo", slug: "golpe-de-escudo", description: "Golpeia o inimigo com o escudo, causando dano físico e erguendo uma barreira.", kind: "attack", trigger: "active", target: "enemy", cooldown: 3000, manaCost: 8, rankRequired: 1, sortOrder: 2, icon: "/icons/64x64/Skills/fc1107.png", iconSecondary: "/icons/64x64/Skills/fc1111.png", actions: [{ action: "damage", amount: 10, scaling: [{ stat: "attack", factor: 0.8 }], damageType: "physical" }, { action: "applyEffect", effect: "armadura-arcana", target: "self", stacks: 1 }] },
      { name: "Postura Defensiva", slug: "postura-defensiva", description: "Ergue uma barreira arcana que aumenta sua defesa.", kind: "buff", trigger: "active", target: "self", cooldown: 10000, manaCost: 10, rankRequired: 3, sortOrder: 3, icon: "/icons/64x64/Skills/fc1108.png", iconSecondary: "/icons/64x64/Skills/fc1112.png", actions: [{ action: "applyEffect", effect: "armadura-arcana", target: "self", stacks: 2 }] },
      { name: "Grito de Guerra", slug: "grito-de-guerra", description: "Berro de batalha que aumenta seu ataque.", kind: "buff", trigger: "active", target: "self", cooldown: 15000, manaCost: 12, rankRequired: 5, sortOrder: 4, icon: "/icons/64x64/Skills/fc1109.png", iconSecondary: "/icons/64x64/Skills/fc1113.png", actions: [{ action: "applyEffect", effect: "furia-do-guerreiro", target: "self", stacks: 2 }] },
      { name: "Juízo Final", slug: "juizo-final", description: "Um golpe devastador que abala a terra.", kind: "attack", trigger: "ultimate", target: "enemy", cooldown: 30000, manaCost: 25, rankRequired: 8, sortOrder: 5, icon: "/icons/64x64/Skills/fc1110.png", actions: [{ action: "damage", amount: 40, scaling: [{ stat: "attack", factor: 1.5 }], damageType: "physical" }] },
    ],
    passives: [
      { name: "Bastião", slug: "bastiao", description: "Vida máxima +10% e defesa +5.", rankRequired: 1, sortOrder: 1, statModifiers: { percent: { hp: 10 }, flat: { defense: 5 } } },
      { name: "Muralha de Ferro", slug: "muralha-de-ferro", description: "Defesa +8 e resistência mágica +5.", rankRequired: 4, sortOrder: 2, statModifiers: { flat: { defense: 8, magicDefense: 5 } } },
      { name: "Espírito Inabalável", slug: "espirito-inabalavel", description: "Vida máxima +8% e recupera vida por rodada.", rankRequired: 7, sortOrder: 3, statModifiers: { percent: { hp: 8, healthRegenPerTick: 1 } } },
    ],
  },
  {
    class: "mago",
    skills: [
      { name: "Rajada Arcana", slug: "rajada-arcana", description: "Dispara um projétil de mana. Usado automaticamente.", kind: "attack", trigger: "auto", target: "enemy", cooldown: 2000, manaCost: 0, rankRequired: 1, sortOrder: 1, icon: "/icons/64x64/Skills/fc1116.png", actions: [{ action: "damage", amount: 8, scaling: [{ stat: "magic", factor: 0.9 }], damageType: "magic" }] },
      { name: "Bola de Fogo", slug: "bola-de-fogo", description: "Lança uma esfera de fogo que causa dano mágico e queima o alvo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 4000, manaCost: 15, rankRequired: 1, sortOrder: 2, icon: "/icons/64x64/Skills/fc1117.png", iconSecondary: "/icons/64x64/Skills/fc1121.png", actions: [{ action: "damage", amount: 16, scaling: [{ stat: "magic", factor: 1.2 }], damageType: "magic" }, { action: "applyEffect", effect: "chama-arcana", target: "enemy", stacks: 1 }] },
      { name: "Foco Arcano", slug: "foco-arcano", description: "Concentra energia arcana, aumentando a recuperação de mana.", kind: "buff", trigger: "active", target: "self", cooldown: 12000, manaCost: 10, rankRequired: 3, sortOrder: 3, icon: "/icons/64x64/Skills/fc1118.png", iconSecondary: "/icons/64x64/Skills/fc1122.png", actions: [{ action: "applyEffect", effect: "foco-arcano", target: "self", stacks: 2 }] },
      { name: "Raio Arcano", slug: "raio-arcano", description: "Um raio de energia pura que queima o alvo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 9000, manaCost: 20, rankRequired: 5, sortOrder: 4, icon: "/icons/64x64/Skills/fc1119.png", iconSecondary: "/icons/64x64/Skills/fc1123.png", actions: [{ action: "damage", amount: 22, scaling: [{ stat: "magic", factor: 1.5 }], damageType: "magic" }, { action: "applyEffect", effect: "chama-arcana", target: "enemy", stacks: 1 }] },
      { name: "Meteoro", slug: "meteoro", description: "Invoca um meteoro que esmaga os inimigos.", kind: "attack", trigger: "ultimate", target: "enemy", cooldown: 30000, manaCost: 30, rankRequired: 8, sortOrder: 5, icon: "/icons/64x64/Skills/fc1120.png", actions: [{ action: "damage", amount: 50, scaling: [{ stat: "magic", factor: 1.8 }], damageType: "magic" }] },
    ],
    passives: [
      { name: "Chama Interior", slug: "chama-interior", description: "Poder mágico +8.", rankRequired: 1, sortOrder: 1, statModifiers: { flat: { magic: 8 } } },
      { name: "Fluxo Arcano", slug: "fluxo-arcano", description: "Recuperação de mana +5 e poder mágico +4.", rankRequired: 4, sortOrder: 2, statModifiers: { flat: { manaRegenPerTick: 5, magic: 4 } } },
      { name: "Dominância Elemental", slug: "dominancia-elemental", description: "Dano mágico +12% e redução de custo de mana 10%.", rankRequired: 7, sortOrder: 3, statModifiers: { percent: { magicDamagePercent: 12, manaCostReduction: 10 } } },
    ],
  },
  {
    class: "assassino",
    skills: [
      { name: "Corte Rápido", slug: "corte-rapido", description: "Um corte veloz com as lâminas. Usado automaticamente.", kind: "attack", trigger: "auto", target: "enemy", cooldown: 2000, manaCost: 0, rankRequired: 1, sortOrder: 1, icon: "/icons/64x64/Skills/fc1126.png", actions: [{ action: "damage", amount: 7, scaling: [{ stat: "attack", factor: 1 }], damageType: "physical" }] },
      { name: "Golpe Sombrio", slug: "golpe-sombrio", description: "Um ataque rápido vindo das sombras que causa sangramento.", kind: "attack", trigger: "active", target: "enemy", cooldown: 3500, manaCost: 10, rankRequired: 1, sortOrder: 2, icon: "/icons/64x64/Skills/fc1127.png", iconSecondary: "/icons/64x64/Skills/fc1131.png", actions: [{ action: "damage", amount: 12, scaling: [{ stat: "attack", factor: 1.1 }], damageType: "physical" }, { action: "applyEffect", effect: "sangramento", target: "enemy", stacks: 1 }] },
      { name: "Passo Sombrio", slug: "passo-sombrio", description: "Desliza entre as sombras, aumentando sua esquiva.", kind: "buff", trigger: "active", target: "self", cooldown: 12000, manaCost: 8, rankRequired: 3, sortOrder: 3, icon: "/icons/64x64/Skills/fc1128.png", iconSecondary: "/icons/64x64/Skills/fc1132.png", actions: [{ action: "applyEffect", effect: "passo-das-sombras", target: "self", stacks: 2 }] },
      { name: "Lâmina Envenenada", slug: "lamina-envenenada", description: "Envenena as lâminas e fere o alvo com veneno corrosivo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 8000, manaCost: 14, rankRequired: 5, sortOrder: 4, icon: "/icons/64x64/Skills/fc1129.png", iconSecondary: "/icons/64x64/Skills/fc1133.png", actions: [{ action: "damage", amount: 15, scaling: [{ stat: "attack", factor: 1.3 }], damageType: "physical" }, { action: "applyEffect", effect: "veneno-corrosivo", target: "enemy", stacks: 1 }] },
      { name: "Execução", slug: "execucao", description: "Um golpe mortal que termina inimigos feridos.", kind: "attack", trigger: "ultimate", target: "enemy", cooldown: 25000, manaCost: 20, rankRequired: 8, sortOrder: 5, icon: "/icons/64x64/Skills/fc1130.png", actions: [{ action: "damage", amount: 45, scaling: [{ stat: "attack", factor: 1.6 }], damageType: "physical" }] },
    ],
    passives: [
      { name: "Sangue Frio", slug: "sangue-frio", description: "Chance de crítico +5%.", rankRequired: 1, sortOrder: 1, statModifiers: { flat: { critChance: 5 } } },
      { name: "Sombra da Morte", slug: "sombra-da-morte", description: "Dano crítico +15% e chance de crítico +3%.", rankRequired: 4, sortOrder: 2, statModifiers: { flat: { critDamage: 15, critChance: 3 } } },
      { name: "Veneno Lento", slug: "veneno-lento", description: "Dano dos seus efeitos de dano contínuo +20%.", rankRequired: 7, sortOrder: 3, statModifiers: { percent: { dotPercent: 20 } } },
    ],
  },
  {
    class: "suporte",
    skills: [
      { name: "Luz Sagrada", slug: "luz-sagrada", description: "Dispara um feixe de luz que fere o inimigo. Usado automaticamente.", kind: "attack", trigger: "auto", target: "enemy", cooldown: 2000, manaCost: 0, rankRequired: 1, sortOrder: 1, icon: "/icons/64x64/Skills/fc1136.png", actions: [{ action: "damage", amount: 7, scaling: [{ stat: "magic", factor: 0.7 }], damageType: "magic" }] },
      { name: "Toque Curativo", slug: "toque-curativo", description: "Cura com luz divina.", kind: "heal", trigger: "active", target: "self", cooldown: 4000, manaCost: 12, rankRequired: 1, sortOrder: 2, icon: "/icons/64x64/Skills/fc1137.png", actions: [{ action: "heal", amount: 25, scaling: [{ stat: "magic", factor: 0.9 }] }] },
      { name: "Palavra de Poder", slug: "palavra-de-poder", description: "Encanta a si mesmo, aumentando seu ataque.", kind: "buff", trigger: "active", target: "self", cooldown: 10000, manaCost: 10, rankRequired: 3, sortOrder: 3, icon: "/icons/64x64/Skills/fc1138.png", iconSecondary: "/icons/64x64/Skills/fc1142.png", actions: [{ action: "applyEffect", effect: "furia-do-guerreiro", target: "self", stacks: 2 }] },
      { name: "Bênção da Luz", slug: "bencao-da-luz", description: "Abençoa a si mesmo, regenerando vida ao longo do tempo.", kind: "buff", trigger: "active", target: "self", cooldown: 15000, manaCost: 15, rankRequired: 5, sortOrder: 4, icon: "/icons/64x64/Skills/fc1139.png", iconSecondary: "/icons/64x64/Skills/fc1143.png", actions: [{ action: "applyEffect", effect: "bencao-da-luz", target: "self", stacks: 1 }] },
      { name: "Milagre", slug: "milagre", description: "Uma cura massiva que restaura grande parte da vida.", kind: "heal", trigger: "ultimate", target: "self", cooldown: 30000, manaCost: 30, rankRequired: 8, sortOrder: 5, icon: "/icons/64x64/Skills/fc1140.png", actions: [{ action: "heal", amount: 80, scaling: [{ stat: "magic", factor: 1.5 }] }] },
    ],
    passives: [
      { name: "Piedade", slug: "piedade", description: "Poder de cura +10%.", rankRequired: 1, sortOrder: 1, statModifiers: { percent: { healingPercent: 10 } } },
      { name: "Graça Divina", slug: "graca-divina", description: "Recuperação de mana +4 e poder de cura +8%.", rankRequired: 4, sortOrder: 2, statModifiers: { flat: { manaRegenPerTick: 4 }, percent: { healingPercent: 8 } } },
      { name: "Sacrifício", slug: "sacrificio", description: "Suas curas podem exceder a vida máxima em até 10%.", rankRequired: 7, sortOrder: 3, statModifiers: { percent: { overhealPercent: 10 } } },
    ],
  },
  {
    class: "senhor-das-sombras",
    skills: [
      { name: "Corte Sombrio", slug: "corte-sombrio", description: "Um corte veloz tingido de sombras. Usado automaticamente.", kind: "attack", trigger: "auto", target: "enemy", cooldown: 2000, manaCost: 0, rankRequired: 1, sortOrder: 1, icon: "/icons/64x64/Skills/fc1146.png", actions: [{ action: "damage", amount: 8, scaling: [{ stat: "attack", factor: 1.05 }], damageType: "physical" }] },
      { name: "Lâmina da Penumbra", slug: "lamina-da-penumbra", description: "Fere o inimigo com uma lâmina sombria que causa sangramento.", kind: "attack", trigger: "active", target: "enemy", cooldown: 3500, manaCost: 10, rankRequired: 1, sortOrder: 2, icon: "/icons/64x64/Skills/fc1147.png", iconSecondary: "/icons/64x64/Skills/fc1151.png", actions: [{ action: "damage", amount: 13, scaling: [{ stat: "attack", factor: 1.15 }], damageType: "physical" }, { action: "applyEffect", effect: "sangramento", target: "enemy", stacks: 1 }] },
      { name: "Manto Sombrio", slug: "manto-sombrio", description: "Envolve-se em sombras, aumentando a esquiva e a defesa.", kind: "buff", trigger: "active", target: "self", cooldown: 12000, manaCost: 10, rankRequired: 3, sortOrder: 3, icon: "/icons/64x64/Skills/fc1148.png", iconSecondary: "/icons/64x64/Skills/fc1152.png", actions: [{ action: "applyEffect", effect: "passo-das-sombras", target: "self", stacks: 1 }, { action: "applyEffect", effect: "armadura-arcana", target: "self", stacks: 1 }] },
      { name: "Garra Corrosiva", slug: "garra-corrosiva", description: "Golpeia com garras envenenadas, causando veneno corrosivo.", kind: "attack", trigger: "active", target: "enemy", cooldown: 8000, manaCost: 14, rankRequired: 5, sortOrder: 4, icon: "/icons/64x64/Skills/fc1149.png", iconSecondary: "/icons/64x64/Skills/fc1153.png", actions: [{ action: "damage", amount: 16, scaling: [{ stat: "attack", factor: 1.35 }], damageType: "physical" }, { action: "applyEffect", effect: "veneno-corrosivo", target: "enemy", stacks: 1 }] },
      { name: "Tempestade das Sombras", slug: "tempestade-das-sombras", description: "Libera toda a escuridão acumulada em um golpe devastador.", kind: "attack", trigger: "ultimate", target: "enemy", cooldown: 30000, manaCost: 28, rankRequired: 8, sortOrder: 5, icon: "/icons/64x64/Skills/fc1150.png", actions: [{ action: "damage", amount: 55, scaling: [{ stat: "attack", factor: 1.7 }], damageType: "physical" }, { action: "applyEffect", effect: "furia-do-guerreiro", target: "self", stacks: 2 }] },
    ],
    passives: [
      { name: "Sombra Persistente", slug: "sombra-persistente", description: "Chance de crítico +5%.", rankRequired: 1, sortOrder: 1, statModifiers: { flat: { critChance: 5 } } },
      { name: "Abraço Noturno", slug: "abraco-noturno", description: "Vida máxima +8% e defesa +5.", rankRequired: 4, sortOrder: 2, statModifiers: { percent: { hp: 8 }, flat: { defense: 5 } } },
      { name: "Senhor da Penumbra", slug: "senhor-da-penumbra", description: "Dano contínuo +15% e esquiva +5%.", rankRequired: 7, sortOrder: 3, statModifiers: { percent: { dotPercent: 15, dodge: 5 } } },
    ],
  },
];

const redeemCodes = [
  {
    code: "BEMVINDO",
    description: "Kit de boas-vindas: 100 gold, 50 diamantes, 100 XP e poções.",
    gold: 100,
    diamonds: 50,
    experience: 100,
    items: [{ itemName: "Poção de Vida", quantity: 5 }, { itemName: "Poção de Mana", quantity: 3 }],
    maxUses: 500,
  },
  {
    code: "ARCADIA2026",
    description: "Bônus de teste: 500 gold, 25 diamantes e 250 XP.",
    gold: 500,
    diamonds: 25,
    experience: 250,
    items: [],
    maxUses: 500,
  },
];

// ===== Stat Models: identidade de combate das classes =====

const statModels = [
  {
    name: "Tank",
    slug: "tank",
    description: "Escudo inabalável. Endurance e Strength alimentam a sobrevivência e a ameaça.",
    category: "tank",
    base: { hp: 140, mana: 60, magic: 4, speed: 5, attack: 14, defense: 16, magicDefense: 12 },
    scaling: { aggroPerHit: 30, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 25, manaRegenPerTick: 4, critChancePerSpeed: 0.5, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    coreStats: { strength: 6, endurance: 8, dexterity: 2, wisdom: 3, luck: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.5 },
      { stat: "endurance", target: "hp", factor: 12 },
      { stat: "endurance", target: "defense", factor: 0.8 },
      { stat: "dexterity", target: "hitChance", factor: 0.3 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 2, critMultiplier: 150, evasion: 1, cooldownReduction: 0 },
    bonuses: { damageResistance: 10, physicalResistance: 15, magicalResistance: 10, threatPerAttack: 25 },
  },
  {
    name: "Caster",
    slug: "caster",
    description: "Arcano devastador. Intellect e Wisdom convertem em poder mágico puro.",
    category: "caster",
    base: { hp: 90, mana: 130, magic: 20, speed: 6, attack: 6, defense: 8, magicDefense: 12 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 10, manaRegenPerTick: 12, critChancePerSpeed: 0.5, healthRegenPerTick: 1, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    coreStats: { intellect: 8, wisdom: 5, dexterity: 2, luck: 2 },
    conversions: [
      { stat: "intellect", target: "spellPower", factor: 1.5 },
      { stat: "wisdom", target: "mana", factor: 8 },
      { stat: "wisdom", target: "magicDefense", factor: 0.6 },
      { stat: "luck", target: "critChance", factor: 0.1 },
    ],
    combatStatsBase: { hitChance: 95, critChance: 5, critMultiplier: 160, evasion: 1, cooldownReduction: 5 },
    bonuses: { magicalBoost: 10 },
  },
  {
    name: "DPS",
    slug: "dps",
    description: "Sombra mortal. Dexterity e Luck geram ataques rápidos e críticos devastadores.",
    category: "melee",
    base: { hp: 110, mana: 70, magic: 6, speed: 12, attack: 20, defense: 10, magicDefense: 8 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.8, critDamageBase: 180, threatPerAttack: 15, manaRegenPerTick: 6, critChancePerSpeed: 1.2, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    coreStats: { strength: 4, dexterity: 8, luck: 4, endurance: 2 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.3 },
      { stat: "dexterity", target: "hitChance", factor: 0.5 },
      { stat: "luck", target: "critChance", factor: 0.15 },
      { stat: "luck", target: "critDamage", factor: 1.2 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 8, critMultiplier: 180, evasion: 4, cooldownReduction: 3 },
    bonuses: { physicalBoost: 8, penetration: 5 },
  },
  {
    name: "Support",
    slug: "support",
    description: "Coração do grupo. Wisdom e Intellect fortalecem curas e recursos.",
    category: "support",
    base: { hp: 100, mana: 120, magic: 16, speed: 6, attack: 8, defense: 10, magicDefense: 12 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 10, manaRegenPerTick: 10, critChancePerSpeed: 0.5, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    coreStats: { intellect: 6, wisdom: 7, endurance: 3, luck: 1 },
    conversions: [
      { stat: "intellect", target: "spellPower", factor: 1.2 },
      { stat: "wisdom", target: "mana", factor: 10 },
      { stat: "wisdom", target: "manaRegenPerTick", factor: 0.4 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 3, critMultiplier: 150, evasion: 2, cooldownReduction: 8 },
    bonuses: { healingBoost: 15, damageResistance: 5 },
  },
  {
    name: "Hybrid",
    slug: "hybrid",
    description: "Equilíbrio entre todos os estilos. Flexível em qualquer situação.",
    category: "hybrid",
    base: { hp: 100, mana: 100, magic: 12, speed: 7, attack: 12, defense: 10, magicDefense: 10 },
    scaling: { aggroPerHit: 12, dodgePerSpeed: 0.3, critDamageBase: 155, threatPerAttack: 12, manaRegenPerTick: 8, critChancePerSpeed: 0.6, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    coreStats: { strength: 5, intellect: 5, endurance: 4, dexterity: 4, wisdom: 3, luck: 2 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.1 },
      { stat: "intellect", target: "spellPower", factor: 1.1 },
      { stat: "luck", target: "critChance", factor: 0.1 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 5, critMultiplier: 155, evasion: 2, cooldownReduction: 4 },
    bonuses: { damageBoost: 4, healingBoost: 4 },
  },
];

// ===== Classe exclusiva VIP (desbloqueada comprando VIP; não é starter) =====

const vipClasses = [
  {
    name: "Senhor das Sombras",
    slug: "senhor-das-sombras",
    description: "Classe exclusiva VIP. Um híbrido de dano e resistência que domina a escuridão, sangra e corrói seus inimigos.",
    lore: "Apenas aqueles que apoiam o reino conhecem os segredos da penumbra.",
    icon: "Moon",
    element: "dark",
    rarity: "rare",
    difficulty: "medium",
    role: "tank",
    combatType: "melee",
    statModel: "hybrid",
    requiredLevel: 10,
    requiredVip: true,
    price: 10000,
    sortOrder: 6,
  },
];

// ===== Loja: diamantes (moeda real simulada), VIP e passe premium =====

const shopProducts = [
  { slug: "diamantes-100", name: "Pacote de Diamantes — 100", description: "100 diamantes para gastar na loja.", type: "diamond_pack", currency: "money", price: 500, diamondAmount: 100, icon: "Gem", sortOrder: 1 },
  { slug: "diamantes-550", name: "Pacote de Diamantes — 550", description: "550 diamantes (melhor custo-benefício).", type: "diamond_pack", currency: "money", price: 2500, diamondAmount: 550, icon: "Gem", sortOrder: 2 },
  { slug: "diamantes-1300", name: "Pacote de Diamantes — 1300", description: "1300 diamantes para os colecionadores.", type: "diamond_pack", currency: "money", price: 5000, diamondAmount: 1300, icon: "Gem", sortOrder: 3 },
  { slug: "vip-7d", name: "VIP — 7 dias", description: "VIP por 7 dias: +10% XP, +10% ouro e classe exclusiva Senhor das Sombras.", type: "vip", currency: "diamond", price: 300, vipDays: 7, icon: "Crown", sortOrder: 10 },
  { slug: "vip-30d", name: "VIP — 30 dias", description: "VIP por 30 dias: +10% XP, +10% ouro e classe exclusiva Senhor das Sombras.", type: "vip", currency: "diamond", price: 800, vipDays: 30, icon: "Crown", sortOrder: 11 },
  { slug: "vip-30d-cash", name: "VIP — 30 dias (R$)", description: "VIP por 30 dias comprado com dinheiro real.", type: "vip", currency: "money", price: 4000, vipDays: 30, icon: "Crown", sortOrder: 12 },
  { slug: "pass-premium", name: "Passe Premium", description: "Ativa o Passe Premium da temporada atual e libera as recompensas premium dos tiers.", type: "pass_premium", currency: "diamond", price: 600, icon: "Trophy", sortOrder: 20 },
  { slug: "pass-premium-cash", name: "Passe Premium (R$)", description: "Ativa o Passe Premium da temporada atual comprando com dinheiro real.", type: "pass_premium", currency: "money", price: 3000, icon: "Trophy", sortOrder: 21 },
];

async function upsertItem(item) {
  const existing = await prisma.item.findFirst({ where: { name: item.name } });
  const data = { ...item, icon: iconForItem(item) };
  if (existing) return prisma.item.update({ where: { id: existing.id }, data });
  return prisma.item.create({ data });
}

async function upsertEnchantment(enchantment) {
  const existing = await prisma.enchantment.findFirst({
    where: { OR: [{ slug: enchantment.slug }, { name: enchantment.name }] },
  });
  if (existing) return prisma.enchantment.update({ where: { id: existing.id }, data: { ...enchantment } });
  return prisma.enchantment.create({ data: { ...enchantment } });
}

async function upsertMonster(monster) {
  const { drops, ...monsterData } = monster;
  const existing = await prisma.monster.findFirst({ where: { name: monster.name } });
  const created = existing
    ? await prisma.monster.update({ where: { id: existing.id }, data: { ...monsterData } })
    : await prisma.monster.create({ data: { ...monsterData } });
  if (Array.isArray(drops) && drops.length > 0) {
    await prisma.dropItem.deleteMany({ where: { monsterId: created.id } });
    for (const drop of drops) {
      const item = await prisma.item.findFirst({ where: { name: drop.item } });
      if (!item) continue;
      await prisma.dropItem.create({
        data: {
          monsterId: created.id,
          itemId: item.id,
          dropChance: drop.chance,
          minQuantity: drop.min || 1,
          maxQuantity: drop.max || drop.min || 1,
          isGuaranteed: drop.guaranteed || false,
          ...(drop.minLevel !== undefined ? { minLevel: drop.minLevel } : {}),
          ...(drop.maxLevel !== undefined ? { maxLevel: drop.maxLevel } : {}),
        },
      });
    }
  }
  return created;
}

async function upsertMap(map) {
  return prisma.map.upsert({
    where: { slug: map.slug },
    update: { ...map },
    create: { ...map },
  });
}

async function upsertNpc(npc) {
  const existing = await prisma.npc.findFirst({ where: { name: npc.name } });
  if (existing) return prisma.npc.update({ where: { id: existing.id }, data: { ...npc } });
  return prisma.npc.create({ data: { ...npc } });
}

async function upsertEffect(effect) {
  const existing = await prisma.effect.findFirst({
    where: { OR: [{ slug: effect.slug }, { name: effect.name }] },
  });
  const data = {
    name: effect.name,
    slug: effect.slug,
    description: effect.description || "",
    icon: effect.icon || null,
    kind: effect.kind || "buff",
    category: effect.category || "utility",
    maxStacks: effect.maxStacks || 1,
    duration: effect.duration || 0,
    refreshBehavior: effect.refreshBehavior || "refresh",
    stackLoss: effect.stackLoss || {},
    priority: effect.priority || 0,
    tickInterval: effect.tickInterval || 0,
    tickDamage: effect.tickDamage || {},
    tickHealing: effect.tickHealing || {},
    statModifiers: effect.statModifiers || {},
    shield: effect.shield || {},
    reflect: effect.reflect || {},
    hitkillChance: effect.hitkillChance ?? undefined,
    onMaxStacks: effect.onMaxStacks || [],
    onExpire: effect.onExpire || [],
    onTick: effect.onTick || [],
    exclusiveGroup: effect.exclusiveGroup || null,
    isActive: true,
  };
  if (existing) return prisma.effect.update({ where: { id: existing.id }, data });
  return prisma.effect.create({ data });
}

async function upsertQuest(quest, giverNpcId, mapId) {
  const existing = await prisma.quest.findFirst({ where: { title: quest.title } });
  const data = {
    title: quest.title,
    description: quest.description,
    type: quest.type,
    difficulty: quest.difficulty,
    requiredLevel: quest.requiredLevel || 1,
    requiredRank: quest.requiredRank || 1,
    giverNpcId,
    mapId,
    isRepeatable: !!quest.isRepeatable,
    objectives: JSON.stringify(quest.objectives || []),
    xpReward: BigInt(quest.xpReward || 0),
    goldReward: BigInt(quest.goldReward || 0),
    itemRewards: JSON.stringify(quest.itemRewards || []),
    isActive: true,
    sortOrder: quest.sortOrder || 0,
  };
  if (existing) return prisma.quest.update({ where: { id: existing.id }, data });
  return prisma.quest.create({ data });
}

async function upsertSkill(classId, skill) {
  const existing = await prisma.skill.findFirst({ where: { classId, name: skill.name } });
  const data = {
    name: skill.name,
    slug: skill.slug || skill.name.toLowerCase().replace(/\s+/g, "-"),
    description: skill.description,
    icon: skill.icon || null,
    iconSecondary: skill.iconSecondary || null,
    kind: skill.kind || "attack",
    trigger: skill.trigger || "active",
    target: skill.target || "enemy",
    cooldown: skill.cooldown || 0,
    manaCost: skill.manaCost || 0,
    castTime: skill.castTime || 0,
    channelMs: skill.channelMs || 0,
    rankRequired: skill.rankRequired || 1,
    sortOrder: skill.sortOrder || 0,
    scaling: skill.scaling || [],
    actions: skill.actions || [],
    conditions: skill.conditions || [],
    onConditionMet: skill.onConditionMet || [],
    events: skill.events || [],
    isActive: true,
  };
  if (existing) return prisma.skill.update({ where: { id: existing.id }, data });
  return prisma.skill.create({ data: { ...data, classId } });
}

async function upsertPassive(classId, passive) {
  const existing = await prisma.passive.findFirst({ where: { classId, name: passive.name } });
  const data = {
    name: passive.name,
    slug: passive.slug || passive.name.toLowerCase().replace(/\s+/g, "-"),
    description: passive.description,
    icon: passive.icon || null,
    rankRequired: passive.rankRequired || 1,
    sortOrder: passive.sortOrder || 0,
    statModifiers: passive.statModifiers || {},
    skillModifiers: passive.skillModifiers || [],
    effectModifiers: passive.effectModifiers || [],
    conditions: passive.conditions || [],
    events: passive.events || [],
    isActive: true,
  };
  if (existing) return prisma.passive.update({ where: { id: existing.id }, data });
  return prisma.passive.create({ data: { ...data, classId } });
}

// ===== Matérias-primas de craft a partir de ícones órfãos =====
// Ícones que não são usados por nenhum item do jogo viram itens de drop de
// monstro (type consumable / subtype material), servindo de matéria-prima
// para as receitas de craft (o craft casa ingredientes por NOME do item).
const MATERIAL_CAT_LABELS = {
  Aneis: "Anéis",
  Armaduras: "Armaduras",
  Armas: "Armas",
  Capas: "Capas",
  Classes: "Classes",
  Colares: "Colares",
  "Drop Boss": "Chefe",
  Elmo: "Elmos",
  "Elmos Magicos": "Elmos Mágicos",
  Encantamento: "Encantamentos",
  Potion: "Poções",
  Raridade: "Raridade",
  Robes: "Robes",
  Skills: "Habilidades",
};

function scanIconFiles() {
  const root = path.resolve(__dirname, "../../Icons/64x64");
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith(".png")) {
        out.push({ cat: entry.name, basename: f, url: "/icons/64x64/" + entry.name + "/" + f });
      }
    }
  }
  return out;
}

function materialNameFromIcon(cat, basename) {
  const label = MATERIAL_CAT_LABELS[cat] || cat;
  const base = basename.replace(/\.png$/i, "");
  return "Matéria-Prima de " + label + " (" + base + ")";
}

async function seedMaterialItems(monsterMap) {
  console.log("Seeding material items (ícones órfãos -> drops de monstro)...");
  const files = scanIconFiles();

  const referenced = new Set(items.map((i) => iconForItem(i)).filter(Boolean));
  const dbItems = await prisma.item.findMany({
    where: { icon: { not: null } },
    select: { icon: true },
  });
  for (const it of dbItems) if (it.icon) referenced.add(it.icon);

  let createdCount = 0;
  const materialList = [];
  for (const file of files) {
    if (referenced.has(file.url)) continue;
    const name = materialNameFromIcon(file.cat, file.basename);
    const existing = await prisma.item.findFirst({ where: { name } });
    if (existing) {
      materialList.push(existing);
      continue;
    }
    const item = await prisma.item.create({
      data: {
        name,
        description: "Matéria-prima coletada de monstros. Pode ser usada em receitas de craft.",
        icon: file.url,
        type: "consumable",
        subtype: "material",
        rarity: "common",
        level: 1,
        isStackable: true,
        maxStack: 99,
        buyPrice: 0,
        sellPrice: 5,
        isTradable: true,
        isSellable: true,
        isActive: true,
      },
    });
    materialList.push(item);
    createdCount++;
    if (createdCount % 100 === 0) console.log("  materials criados:", createdCount);
  }
  console.log("  materiais totais:", materialList.length, "(novos:", createdCount + ")");

  const monstersArr = Object.values(monsterMap);
  if (materialList.length === 0 || monstersArr.length === 0) return;

  const hashStr = (s) => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  const perMonster = Math.min(12, Math.max(1, Math.floor(materialList.length / monstersArr.length)));
  for (const monster of monstersArr) {
    const start = hashStr(monster.name) % materialList.length;
    let added = 0;
    for (let k = 0; k < perMonster && added < 12; k++) {
      const mat = materialList[(start + k) % materialList.length];
      const exists = await prisma.dropItem.findFirst({
        where: { monsterId: monster.id, itemId: mat.id },
      });
      if (exists) continue;
      await prisma.dropItem.create({
        data: {
          monsterId: monster.id,
          itemId: mat.id,
          dropChance: 25 + (hashStr(monster.name + "-" + k) % 30),
          minQuantity: 1,
          maxQuantity: 3,
        },
      });
      added++;
    }
    if (added > 0) console.log("  drops adicionados:", monster.name, "+" + added);
  }
}

async function seedWorld() {
  console.log("Seeding items...");
  const itemMap = {};
  for (const item of items) {
    const created = await upsertItem(item);
    itemMap[item.name] = created;
    console.log("  item:", item.name);
  }

  console.log("Seeding monsters...");
  const monsterMap = {};
  for (const monster of monsters) {
    const created = await upsertMonster(monster);
    monsterMap[monster.name] = created;
    console.log("  monster:", monster.name);
  }

  await seedMaterialItems(monsterMap);

  console.log("Seeding maps...");
  const mapMap = {};
  for (const map of maps) {
    const created = await upsertMap(map);
    mapMap[map.slug] = created;
    console.log("  map:", map.slug);
  }

  // Map connection: Arcádia <-> Floresta Sombria
  const existingConn = await prisma.mapConnection.findFirst({
    where: { fromMapId: mapMap.arcadia.id, toMapId: mapMap["floresta-sombria"].id },
  });
  if (!existingConn) {
    await prisma.mapConnection.create({
      data: { fromMapId: mapMap.arcadia.id, toMapId: mapMap["floresta-sombria"].id, requiredLevel: 1 },
    });
    console.log("  connection: arcadia -> floresta-sombria");
  }

  // Map monsters
  for (const [mapSlug, names] of Object.entries({
    "floresta-sombria": ["Rato da Floresta", "Slime Verde", "Lobo Cinzento", "Goblin Saqueador", "Goblin Bruxo"],
    arcadia: ["Dummy de Treino"],
    "caverna-do-dragao": ["Golem de Pedra", "Dragão Sombrio"],
  })) {
    for (const name of names) {
      const existing = await prisma.mapMonster.findFirst({
        where: { mapId: mapMap[mapSlug].id, monsterId: monsterMap[name].id },
      });
      if (!existing) {
        await prisma.mapMonster.create({
          data: { mapId: mapMap[mapSlug].id, monsterId: monsterMap[name].id, spawnRate: 100, minLevel: 1, maxLevel: 10 },
        });
        console.log(`  mapMonster: ${mapSlug} -> ${name}`);
      }
    }
  }
  // Arcádia: remove monstros que não sejam o Dummy de Treino
  {
    const dummy = monsterMap["Dummy de Treino"];
    const arcadiaMonsters = await prisma.mapMonster.findMany({
      where: { mapId: mapMap.arcadia.id },
      select: { id: true, monsterId: true },
    });
    for (const mm of arcadiaMonsters) {
      if (mm.monsterId !== dummy.id) {
        await prisma.mapMonster.delete({ where: { id: mm.id } });
        console.log("  mapMonster removed: arcadia ->", mm.monsterId);
      }
    }
  }

  console.log("Seeding npcs...");
  const npcMap = {};
  for (const npc of npcs) {
    const created = await upsertNpc(npc);
    npcMap[npc.name] = created;
    console.log("  npc:", npc.name);
  }

  // Map npcs (Arcádia)
  for (const npc of Object.values(npcMap)) {
    const existing = await prisma.mapNpc.findFirst({
      where: { mapId: mapMap.arcadia.id, npcId: npc.id },
    });
    if (!existing) {
      await prisma.mapNpc.create({ data: { mapId: mapMap.arcadia.id, npcId: npc.id } });
      console.log("  mapNpc: arcadia ->", npc.name);
    }
  }

  console.log("Seeding enchantments...");
  for (const enchantment of enchantments) {
    const created = await upsertEnchantment(enchantment);
    console.log("  enchantment:", created.slug);
  }

  // Limpeza: remove encantamentos obsoletos (que não existem mais no seed)
  // e ofertas de loja órfãs apontando para eles.
  const seedEnchantmentSlugs = new Set(enchantments.map((e) => e.slug));
  const allEnchantments = await prisma.enchantment.findMany({ select: { id: true, slug: true } });
  const staleEnchantmentIds = allEnchantments
    .filter((e) => !seedEnchantmentSlugs.has(e.slug))
    .map((e) => e.id);
  if (staleEnchantmentIds.length > 0) {
    await prisma.shopItem.deleteMany({ where: { enchantmentId: { in: staleEnchantmentIds } } });
    await prisma.shopProduct.deleteMany({ where: { enchantmentId: { in: staleEnchantmentIds } } });
    await prisma.item.updateMany({ where: { enchantmentId: { in: staleEnchantmentIds } }, data: { enchantmentId: null } });
    await prisma.userEnchantment.deleteMany({ where: { enchantmentId: { in: staleEnchantmentIds } } });
    await prisma.enchantment.deleteMany({ where: { id: { in: staleEnchantmentIds } } });
    console.log("  removed stale enchantments:", staleEnchantmentIds.length);
  }

  console.log("Seeding shop...");
  for (const offer of shopOffers) {
    const npc = npcMap[offer.npc];
    if (!npc) continue;
    const cls = offer.class ? await prisma.gameClass.findUnique({ where: { slug: offer.class } }) : null;
    let item = null;
    let enchantment = null;
    if (offer.item) {
      item = itemMap[offer.item];
      if (!item) continue;
    }
    if (offer.enchantment) {
      enchantment = await prisma.enchantment.findUnique({ where: { slug: offer.enchantment } });
      if (!enchantment) continue;
    }
    const where = offer.item
      ? { npcId: npc.id, itemId: item.id, enchantmentId: null }
      : offer.enchantment
        ? { npcId: npc.id, itemId: null, enchantmentId: enchantment.id }
        : { npcId: npc.id, itemId: null, enchantmentId: null, classId: cls?.id ?? null };
    const data = {
      npcId: npc.id,
      itemId: item?.id ?? null,
      enchantmentId: enchantment?.id ?? null,
      price: BigInt(offer.price),
      currency: "gold",
      classId: cls?.id ?? null,
      requiredLevel: offer.requiredLevel || 0,
      requiredVip: offer.requiredVip || false,
    };
    const existing = await prisma.shopItem.findFirst({ where });
    if (existing) {
      await prisma.shopItem.update({
        where: { id: existing.id },
        data: { classId: data.classId, requiredLevel: data.requiredLevel, requiredVip: data.requiredVip },
      });
      console.log("  shop (updated):", offer.npc, "->", offer.item ?? offer.enchantment ?? offer.class, cls ? `[${cls.name}]` : "");
    } else {
      await prisma.shopItem.create({ data });
      console.log("  shop:", offer.npc, "->", offer.item ?? offer.enchantment ?? offer.class, cls ? `[${cls.name}]` : "");
    }
  }

  console.log("Seeding craft recipes...");
  for (const recipe of craftRecipes) {
    const resultItem = itemMap[recipe.resultItem];
    if (!resultItem) continue;
    const ingredients = JSON.stringify(recipe.ingredients || []);
    const data = {
      description: recipe.description,
      resultItemId: resultItem.id,
      resultQuantity: recipe.resultQuantity,
      requiredLevel: recipe.requiredLevel,
      requiredVip: !!recipe.requiredVip,
      goldCost: BigInt(recipe.goldCost || 0),
      ingredients,
      isActive: true,
    };
    const existing = await prisma.craftRecipe.findFirst({ where: { name: recipe.name } });
    if (existing) {
      await prisma.craftRecipe.update({ where: { id: existing.id }, data });
      console.log("  craft (updated):", recipe.name);
    } else {
      await prisma.craftRecipe.create({ data: { name: recipe.name, ...data } });
      console.log("  craft:", recipe.name);
    }
  }

  console.log("Seeding quests...");
  const questMap = {};
  for (const quest of quests) {
    const created = await upsertQuest(quest, npcMap[quest.giverNpc]?.id ?? null, mapMap[quest.map]?.id ?? null);
    questMap[quest.title] = created;
    console.log("  quest:", created.title);
  }
  // Encadeamento de quests (resolvido por título, em duas passadas)
  for (const quest of quests) {
    if (!Array.isArray(quest.requires) || quest.requires.length === 0) continue;
    const id = questMap[quest.title]?.id;
    if (!id) continue;
    const reqIds = quest.requires.map((t) => questMap[t]?.id).filter(Boolean);
    if (reqIds.length > 0) {
      await prisma.quest.update({ where: { id }, data: { requiredQuestIds: JSON.stringify(reqIds) } });
      console.log("  chain:", quest.title, "<-", quest.requires.join(", "));
    }
  }
  // Receitas que exigem quests: resolve IDs pelo título da quest (seed de quests já rodou)
  for (const recipe of craftRecipes) {
    if (!Array.isArray(recipe.requiredQuests) || recipe.requiredQuests.length === 0) continue;
    const r = await prisma.craftRecipe.findFirst({ where: { name: recipe.name } });
    if (!r) continue;
    const ids = recipe.requiredQuests.map((t) => questMap[t]?.id).filter(Boolean);
    if (ids.length > 0) {
      await prisma.craftRecipe.update({ where: { id: r.id }, data: { requiredQuestIds: JSON.stringify(ids) } });
      console.log("  craft quests:", recipe.name, "<-", recipe.requiredQuests.join(", "));
    }
  }

  console.log("Seeding boosters (gacha)...");
  for (const booster of boosters) {
    const existing = await prisma.booster.findFirst({
      where: { OR: [{ slug: booster.slug }, { name: booster.name }] },
    });
    const created = existing
      ? await prisma.booster.update({ where: { id: existing.id }, data: { ...booster } })
      : await prisma.booster.create({ data: { ...booster } });
    console.log("  booster:", created.slug);
  }

  console.log("Seeding gacha config...");
  const gachaChances = { common: 40, uncommon: 25, rare: 15, epic: 10, legendary: 7, mythic: 3 };
  const gachaSlotChances = { ring: 50, necklace: 50 };
  await prisma.gachaConfig.upsert({
    where: { id: "gacha" },
    update: { freeTickets: 3, ticketCost: BigInt(5000), chances: gachaChances, slotChances: gachaSlotChances, active: true },
    create: { id: "gacha", freeTickets: 3, ticketCost: BigInt(5000), chances: gachaChances, slotChances: gachaSlotChances, active: true },
  });
  console.log("  gachaConfig: ok");

  console.log("Seeding effects...");
  const effectMap = {};
  for (const effect of effects) {
    const created = await upsertEffect(effect);
    effectMap[effect.slug] = created;
    console.log("  effect:", effect.slug);
  }

  console.log("Seeding skills & passives...");
  for (const entry of classSkills) {
    const cls = await prisma.gameClass.findUnique({ where: { slug: entry.class } });
    if (!cls) {
      console.log("  SKIP class not found:", entry.class);
      continue;
    }
    for (const skill of entry.skills) {
      const created = await upsertSkill(cls.id, skill);
      console.log("  skill:", entry.class, "->", created.name);
    }
    for (const passive of entry.passives) {
      await upsertPassive(cls.id, passive);
      console.log("  passive:", entry.class, "->", passive.name);
    }
  }

  console.log("Seeding redeem codes...");
  for (const code of redeemCodes) {
    const created = await prisma.redeemCode.upsert({
      where: { code: code.code },
      update: { ...code, items: code.items },
      create: { ...code, items: code.items },
    });
    console.log("  code:", created.code);
  }
}async function main() {
  console.log("Seeding stat models...");
  for (const sm of statModels) {
    const data = { ...sm };
    await prisma.statModel.upsert({
      where: { slug: sm.slug },
      update: data,
      create: data,
    });
    console.log("  statModel:", sm.slug);
  }

  console.log("Seeding starter classes...");
  for (const cls of starterClasses) {
    const statModel = cls.statModel
      ? await prisma.statModel.findFirst({ where: { slug: cls.statModel } })
      : null;
    const data = {
      name: cls.name,
      slug: cls.slug,
      description: cls.description,
      icon: cls.icon,
      role: cls.role,
      combatType: cls.combatType || "melee",
      rankMax: cls.rankMax || 10,
      requiredLevel: cls.requiredLevel || 1,
      resource: cls.resource || {},
      statModelId: statModel?.id ?? null,
      isStarter: true,
      isActive: true,
      price: cls.price || 0,
      sortOrder: cls.sortOrder || 0,
    };
    await prisma.gameClass.upsert({
      where: { slug: cls.slug },
      update: data,
      create: data,
    });
    console.log("  class:", cls.slug);
  }


  console.log("Seeding VIP class...");
  for (const cls of vipClasses) {
    const statModel = await prisma.statModel.findFirst({ where: { slug: cls.statModel } });
    const data = {
      name: cls.name,
      slug: cls.slug,
      description: cls.description,
      icon: cls.icon,
      role: cls.role,
      combatType: cls.combatType || "melee",
      rankMax: cls.rankMax || 10,
      requiredLevel: cls.requiredLevel || 1,
      requiredVip: true,
      resource: cls.resource || {},
      statModelId: statModel?.id ?? null,
      isStarter: false,
      isActive: true,
      price: cls.price || 0,
      sortOrder: cls.sortOrder || 5,
    };
    await prisma.gameClass.upsert({
      where: { slug: cls.slug },
      update: data,
      create: data,
    });
    console.log("  class:", cls.slug);
  }

  console.log("Promoting Darkin to admin...");
  const darkin = await prisma.user.updateMany({
    where: { username: "Darkin" },
    data: { role: "admin" },
  });
  console.log("  users updated:", darkin.count);

  await seedWorld();

  console.log("Seeding shop products...");
  const removedEnchantments = await prisma.shopProduct.deleteMany({ where: { type: "enchantment" } });
  if (removedEnchantments.count > 0) console.log("  removed legacy enchantment products:", removedEnchantments.count);
  for (const product of shopProducts) {
    const { enchantmentSlug, ...productData } = product;
    const created = await prisma.shopProduct.upsert({
      where: { slug: product.slug },
      update: { ...productData },
      create: { ...productData },
    });
    if (enchantmentSlug) {
      const enchantment = await prisma.enchantment.findFirst({ where: { slug: enchantmentSlug } });
      if (enchantment) {
        await prisma.shopProduct.update({
          where: { id: created.id },
          data: { enchantmentId: enchantment.id },
        });
      }
    }
    console.log("  product:", created.slug);
  }

  console.log("Seeding patch notes...");
  await prisma.patchNote.upsert({
    where: { id: "patch-notes-v1" },
    update: {},
    create: {
      id: "patch-notes-v1",
      title: "Atualização 1.0 — Raids e Skills de Monstros",
      content:
        "Bem-vindo à Temporada 1!\n• Novo mapa de Raid: Caverna do Dragão (tentativas limitadas com reset diário)\n• Monstros agora usam skills especiais (sopro de fogo, veneno, fúria...)\n• Encantamentos à venda na loja da Aurelia (por ouro)\n• Sistema de classes reformulado",
      version: "1.0",
      isActive: true,
    },
  });
  console.log("  patch note: v1");

  const [classes, users] = await Promise.all([
    prisma.gameClass.count(),
    prisma.user.findMany({ select: { username: true, role: true } }),
  ]);
  console.log("DONE. classes:", classes);
  console.log("users:", JSON.stringify(users));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
} else {
  // Permite importar os dados (ex.: script de regeneração de ícones)
  // sem disparar o seeding.
  module.exports = {
    items,
    monsters,
    maps,
    npcs,
    enchantments,
    shopOffers,
    shopProducts,
    craftRecipes,
    generatedIcons,
    iconForItem,
    classSkills,
    effects,
  };
}
