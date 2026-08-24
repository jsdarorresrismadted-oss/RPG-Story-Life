// ===== DATABASE SEED =====

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Create admin user
  const adminPassword = await hash("159852", 10);
  const admin = await prisma.user.upsert({
    where: { username: "darki" },
    update: {},
    create: {
      username: "darki",
      email: "admin@rpgstorylife.com",
      passwordHash: adminPassword,
      displayName: "Darki",
      role: "owner",
    },
  });
  console.log("✅ Admin user created:", admin.username);

  // Create starter items
  const starterItems = [
    // Weapons
    { name: "Adaga de Iniciante", type: "weapon", subtype: "dagger", rarity: "common", level: 1, attackSpeedMs: 1600, dps: 8, strength: 5, buyPrice: 50n, sellPrice: 10n },
    { name: "Espada de Iniciante", type: "weapon", subtype: "sword", rarity: "common", level: 1, attackSpeedMs: 2000, dps: 10, strength: 8, buyPrice: 50n, sellPrice: 10n },
    { name: "Cajado de Iniciante", type: "weapon", subtype: "staff", rarity: "common", level: 1, attackSpeedMs: 2200, dps: 7, intellect: 8, buyPrice: 50n, sellPrice: 10n },
    { name: "Lança de Iniciante", type: "weapon", subtype: "spear", rarity: "common", level: 1, attackSpeedMs: 2100, dps: 9, strength: 6, dexterity: 3, buyPrice: 50n, sellPrice: 10n },
    { name: "Martelo de Iniciante", type: "weapon", subtype: "mace", rarity: "common", level: 1, attackSpeedMs: 2400, dps: 11, strength: 10, buyPrice: 50n, sellPrice: 10n },
    // Armor
    { name: "Armadura de Iniciante", type: "armor", subtype: "light", rarity: "common", level: 1, endurance: 5, intellect: 2, buyPrice: 50n, sellPrice: 10n },
    { name: "Capacete de Iniciante", type: "helm", subtype: "light", rarity: "common", level: 1, endurance: 3, intellect: 1, buyPrice: 30n, sellPrice: 5n },
    { name: "Capa de Iniciante", type: "cape", subtype: "cloth", rarity: "common", level: 1, intellect: 2, luck: 2, buyPrice: 30n, sellPrice: 5n },
    // Consumables
    { name: "Poção de Vida", type: "consumable", subtype: "potion", rarity: "common", level: 1, effects: '{"heal":50}', buyPrice: 20n, sellPrice: 5n, isStackable: true, maxStack: 99 },
    { name: "Poção de Mana", type: "consumable", subtype: "potion", rarity: "common", level: 1, effects: '{"mana":30}', buyPrice: 20n, sellPrice: 5n, isStackable: true, maxStack: 99 },
  ];

  for (const item of starterItems) {
    await prisma.item.upsert({
      where: { name: item.name },
      update: {},
      create: {
        ...item,
        buyPrice: BigInt(item.buyPrice.toString()),
        sellPrice: BigInt(item.sellPrice.toString()),
        isActive: true,
      },
    });
  }
  console.log("✅ Starter items created");

  // Create starter classes
  const classes = [
    { name: "Guerreiro", slug: "guerreiro", description: "Mestre do combate corpo a corpo, alta defesa e vida.", isStarter: true },
    { name: "Mago", slug: "mago", description: "Mestre das artes arcanas, alto dano mágico.", isStarter: true },
    { name: "Assassino", slug: "assassino", description: "Ágil e letal, especialista em crítico e esquiva.", isStarter: true },
    { name: "Suporte", slug: "suporte", description: "Protetor dos aliados, cura e buffs poderosos.", isStarter: true },
  ];

  for (const cls of classes) {
    await prisma.gameClass.upsert({
      where: { slug: cls.slug },
      update: {},
      create: cls,
    });
  }
  console.log("✅ Starter classes created");

  // Create basic enchantments
  const enchantments = [
    { name: "Força Bruta", slug: "forca-bruta", category: "strength", strength: 2, compatibleSlots: ["weapon"] },
    { name: "Mente Afiada", slug: "mente-afiada", category: "intellect", intellect: 2, compatibleSlots: ["weapon"] },
    { name: "Corpo de Ferro", slug: "corpo-de-ferro", category: "endurance", endurance: 2, compatibleSlots: ["armor", "helm"] },
    { name: "Reflexos", slug: "reflexos", category: "dexterity", dexterity: 2, compatibleSlots: ["helm", "cape"] },
    { name: "Sabedoria Antiga", slug: "sabedoria-antiga", category: "wisdom", wisdom: 2, compatibleSlots: ["cape", "ring", "necklace"] },
    { name: "Sorte do Iniciante", slug: "sorte-iniciante", category: "luck", luck: 2, compatibleSlots: ["ring", "necklace", "cape"] },
  ];

  for (const enc of enchantments) {
    await prisma.enchantment.upsert({
      where: { slug: enc.slug },
      update: {},
      create: {
        ...enc,
        price: 100n,
        isActive: true,
      },
    });
  }
  console.log("✅ Basic enchantments created");

  // Create basic effects
  const effects = [
    { name: "Queimadura", slug: "queimadura", type: "dot", duration: 10, magnitude: 5, stacking: true, maxStacks: 5 },
    { name: "Envenenamento", slug: "envenenamento", type: "dot", duration: 15, magnitude: 3, stacking: true, maxStacks: 10 },
    { name: "Sangramento", slug: "sangramento", type: "dot", duration: 8, magnitude: 4, stacking: true, maxStacks: 3 },
    { name: "Regeneração", slug: "regeneracao", type: "hot", duration: 10, magnitude: 10, stacking: false },
    { name: "Escudo Mágico", slug: "escudo-magico", type: "shield", duration: 15, magnitude: 50, stacking: false },
    { name: "Atordoamento", slug: "atordoamento", type: "stun", duration: 3, stacking: false },
    { name: "Silêncio", slug: "silencio", type: "silence", duration: 5, stacking: false },
    { name: "Raiz", slug: "raiz", type: "root", duration: 4, stacking: false },
    { name: "Lentidão", slug: "lentidao", type: "slow", duration: 10, magnitude: 30, stacking: false },
    { name: "Aceleração", slug: "aceleracao", type: "haste", duration: 10, magnitude: 25, stacking: false },
  ];

  for (const eff of effects) {
    await prisma.effect.upsert({
      where: { slug: eff.slug },
      update: {},
      create: { ...eff, isActive: true },
    });
  }
  console.log("✅ Basic effects created");

  // Create Gacha Config
  await prisma.gachaConfig.upsert({
    where: { id: "gacha" },
    update: {},
    create: {
      id: "gacha",
      freeTickets: 3,
      ticketCost: 100n,
      chances: { common: 50, uncommon: 25, rare: 15, epic: 7, legendary: 2.5, mythic: 0.5 },
      slotChances: { ring: 50, necklace: 50 },
      active: true,
    },
  });
  console.log("✅ Gacha config created");

  // Create basic boosters (Gacha)
  const boosters = [
    { name: "Força Comum", slug: "forca-comum", boostType: "damage", value: 5, slot: "any", rarity: "common", price: 50n },
    { name: "Defesa Comum", slug: "defesa-comum", boostType: "defense", value: 5, slot: "any", rarity: "common", price: 50n },
    { name: "Força Incomum", slug: "forca-incomum", boostType: "damage", value: 10, slot: "any", rarity: "uncommon", price: 200n },
    { name: "Defesa Incomum", slug: "defesa-incomum", boostType: "defense", value: 10, slot: "any", rarity: "uncommon", price: 200n },
    { name: "Força Rara", slug: "forca-rara", boostType: "damage", value: 20, slot: "any", rarity: "rare", price: 500n },
    { name: "Defesa Rara", slug: "defesa-rara", boostType: "defense", value: 20, slot: "any", rarity: "rare", price: 500n },
    { name: "Força Épica", slug: "forca-epica", boostType: "damage", value: 30, slot: "any", rarity: "epic", price: 1000n },
    { name: "Defesa Épica", slug: "defesa-epica", boostType: "defense", value: 30, slot: "any", rarity: "epic", price: 1000n },
    { name: "Força Lendária", slug: "forca-lendaria", boostType: "damage", value: 40, slot: "any", rarity: "legendary", price: 2500n },
    { name: "Defesa Lendária", slug: "defesa-lendaria", boostType: "defense", value: 40, slot: "any", rarity: "legendary", price: 2500n },
    { name: "Força Mítica", slug: "forca-mitica", boostType: "damage", value: 51, slot: "any", rarity: "mythic", price: 5000n },
    { name: "Defesa Mítica", slug: "defesa-mitica", boostType: "defense", value: 51, slot: "any", rarity: "mythic", price: 5000n },
  ];

  for (const bst of boosters) {
    await prisma.booster.upsert({
      where: { slug: bst.slug },
      update: {},
      create: { ...bst, isActive: true },
    });
  }
  console.log("✅ Basic boosters created");

  // Create starter NPCs
  const npcs = [
    {
      name: "Mestre Ferreiro",
      type: "vendor",
      description: "Forja armas e armaduras para aventureiros.",
      description: "Forja armas e armaduras para aventureiros.",
      isActive: true,
    },
    {
      name: "Mestre dos Encantamentos",
      type: "enchantments",
      description: "Aplica encantamentos poderosos em equipamentos.",
      isActive: true,
    },
    {
      name: "Mestre das Classes",
      type: "classes",
      description: "Ensina novas classes e habilidades.",
      isActive: true,
    },
    {
      name: "Comerciante Viajante",
      type: "vendor",
      description: "Vende poções, materiais e itens diversos.",
      isActive: true,
    },
    {
      name: "Mestre de Guildas",
      type: "guild",
      description: "Gerencia guildas e suas recompensas.",
      isActive: true,
    },
  ];

  for (const npc of npcs) {
    await prisma.npc.upsert({
      where: { name: npc.name },
      update: {},
      create: npc,
    });
  }
  console.log("✅ Starter NPCs created");

  // Create Gacha NPC with shop items
  const gachaNpc = await prisma.npc.upsert({
    where: { name: "Mestre do Gacha" },
    update: {},
    create: {
      name: "Mestre do Gacha",
      description: "Gira a roleta do destino e ganhe poderosos boosters!",
      type: "vendor",
      isActive: true,
    },
  });

  const boostersList = await prisma.booster.findMany({ where: { isActive: true } });
  for (const booster of boostersList) {
    await prisma.shopItem.upsert({
      where: {
        npcId_itemId_enchantmentId: {
          npcId: gachaNpc.id,
          itemId: "",
          enchantmentId: booster.id,
        },
      },
      update: {},
      create: {
        npcId: gachaNpc.id,
        enchantmentId: booster.id,
        currency: "gold",
        price: booster.price,
        stock: -1,
        requiredLevel: 1,
        isActive: true,
      },
    });
  }
  console.log("✅ Gacha NPC and shop items created");

  // Create basic shop items for vendors
  const vendorNpc = await prisma.npc.findFirst({ where: { name: "Comerciante Viajante" } });
  if (vendorNpc) {
    const potions = await prisma.item.findMany({
      where: { name: { in: ["Poção de Vida", "Poção de Mana"] } },
    });
    for (const potion of potions) {
      await prisma.shopItem.upsert({
        where: {
          npcId_itemId_enchantmentId: {
            npcId: vendorNpc.id,
            itemId: potion.id,
            enchantmentId: "",
          },
        },
        update: {},
        create: {
          npcId: vendorNpc.id,
          itemId: potion.id,
          currency: "gold",
          price: potion.buyPrice,
          stock: -1,
          requiredLevel: 1,
          isActive: true,
        },
      });
    }
  }
  console.log("✅ Vendor shop items created");

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });