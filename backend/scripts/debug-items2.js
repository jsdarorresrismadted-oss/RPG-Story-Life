const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const allItems = await p.item.findMany({ 
      where: { isActive: true },
      select: { id: true, name: true, type: true, subtype: true }
    });
    
    const drops = await p.dropItem.findMany({ select: { itemId: true }, distinct: ["itemId"] });
    const dropItemIds = new Set(drops.map(d => d.itemId));
    
    const shops = await p.shopItem.findMany({ select: { itemId: true }, distinct: ["itemId"] });
    const shopItemIds = new Set(shops.map(s => s.itemId));
    
    const quests = await p.quest.findMany({ select: { itemRewards: true } });
    const usedInQuests = new Set();
    for (const q of quests) {
      if (q.itemRewards) {
        try {
          const rewards = JSON.parse(q.itemRewards);
          if (Array.isArray(rewards)) {
            for (const r of rewards) {
              if (r?.itemName) usedInQuests.add(r.itemName.toLowerCase());
            }
          }
        } catch {}
      }
      
    console.log("=== ITENS E ONDE ESTÃO USADOS ===");
    for (const item of allItems) {
      const inDrops = dropItemIds.has(item.id);
      const inShops = shopItemIds.has(item.id);
      const inQuests = usedInQuests.has(item.name.toLowerCase());
      const any = inDrops || inShops || inQuests;
      
      if (!any) {
        console.log(`LIVRE: ${item.name} (type=${item.type}, subtype=${item.subtype})`);
      } else {
        let where = [];
        if (inDrops) where.push("DROP");
        if (inShops) where.push("SHOP");
        if (inQuests) where.push("QUEST");
        console.log(`USADO: ${item.name} (type=${item.type}, subtype=${item.subtype}) -> [${where.join(", ")}]`);
      }
    }
  } finally {
    await p.$disconnect();
    tunnel.close();
  }
}
main().catch(e => console.error(e));