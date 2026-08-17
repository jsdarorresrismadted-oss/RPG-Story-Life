import { PrismaClient } from "@prisma/client";
import { openTunnel } from "./db-tunnel";

const ORDER: { tabela: string; fn: (p: PrismaClient) => Promise<number> }[] = [
  { tabela: "PvpMatch", fn: (p) => p.pvpMatch.deleteMany({}) },
  { tabela: "CharacterClass", fn: (p) => p.characterClass.deleteMany({}) },
  { tabela: "Equipment", fn: (p) => p.equipment.deleteMany({}) },
  { tabela: "Inventory", fn: (p) => p.inventory.deleteMany({}) },
  { tabela: "QuestProgress", fn: (p) => p.questProgress.deleteMany({}) },
  { tabela: "UserEnchantment", fn: (p) => p.userEnchantment.deleteMany({}) },
  { tabela: "Character", fn: (p) => p.character.deleteMany({}) },
  { tabela: "UserBooster", fn: (p) => p.userBooster.deleteMany({}) },
  { tabela: "UserAchievement", fn: (p) => p.userAchievement.deleteMany({}) },
  { tabela: "UserTitle", fn: (p) => p.userTitle.deleteMany({}) },
  { tabela: "RedeemRedemption", fn: (p) => p.redeemRedemption.deleteMany({}) },
  { tabela: "ShopOrder", fn: (p) => p.shopOrder.deleteMany({}) },
  { tabela: "MailItem", fn: (p) => p.mailItem.deleteMany({}) },
  { tabela: "Mail", fn: (p) => p.mail.deleteMany({}) },
  { tabela: "MarketListing", fn: (p) => p.marketListing.deleteMany({}) },
  { tabela: "GuildShopItem", fn: (p) => p.guildShopItem.deleteMany({}) },
  { tabela: "GuildQuest", fn: (p) => p.guildQuest.deleteMany({}) },
  { tabela: "GuildBank", fn: (p) => p.guildBank.deleteMany({}) },
  { tabela: "GuildPerk", fn: (p) => p.guildPerk.deleteMany({}) },
  { tabela: "GuildMember", fn: (p) => p.guildMember.deleteMany({}) },
  { tabela: "GuildRanking", fn: (p) => p.guildRanking.deleteMany({}) },
  { tabela: "Guild", fn: (p) => p.guild.deleteMany({}) },
  { tabela: "PartyMember", fn: (p) => p.partyMember.deleteMany({}) },
  { tabela: "Party", fn: (p) => p.party.deleteMany({}) },
  { tabela: "Friendship", fn: (p) => p.friendship.deleteMany({}) },
  { tabela: "RaidRun", fn: (p) => p.raidRun.deleteMany({}) },
  { tabela: "CombatSession", fn: (p) => p.combatSession.deleteMany({}) },
  { tabela: "CombatLog", fn: (p) => p.combatLog.deleteMany({}) },
  { tabela: "ChatLog", fn: (p) => p.chatLog.deleteMany({}) },
  { tabela: "GameLog", fn: (p) => p.gameLog.deleteMany({}) },
  { tabela: "ActiveCooldown", fn: (p) => p.activeCooldown.deleteMany({}) },
  { tabela: "ActiveEffect", fn: (p) => p.activeEffect.deleteMany({}) },
  { tabela: "AnalyticsEvent", fn: (p) => p.analyticsEvent.deleteMany({}) },
  { tabela: "User", fn: (p) => p.user.deleteMany({}) },
];

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    for (const { tabela, fn } of ORDER) {
      const n = await fn(p);
      if (n > 0) console.log(`${tabela}: ${n} apagado(s)`);
    }
    const checks: [string, number][] = [
      ["User", await p.user.count()],
      ["Character", await p.character.count()],
      ["CharacterClass", await p.characterClass.count()],
      ["Equipment", await p.equipment.count()],
      ["Inventory", await p.inventory.count()],
      ["UserEnchantment", await p.userEnchantment.count()],
      ["ShopOrder", await p.shopOrder.count()],
    ];
    console.table(checks.map(([tabela, total]) => ({ tabela, total })));
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});