const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const quest = await p.quest.findFirst({ where: { title: "O Início da Jornada" } });
    if (!quest) {
      console.log("Quest não encontrada.");
      return;
    }
    console.log("Encontrada:", quest.id, quest.title);
    
    // Delete related questProgress first
    await p.questProgress.deleteMany({ where: { questId: quest.id } });
    console.log("questProgress deletados.");
    
    // Delete the quest
    await p.quest.delete({ where: { id: quest.id } });
    console.log("Quest DELETADA permanentemente.");
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }
}
main().catch((err) => {
  console.error("falha:", err.message || err);
  process.exit(1);
});