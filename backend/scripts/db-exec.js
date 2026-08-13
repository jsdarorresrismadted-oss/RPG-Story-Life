// db-exec.js — executa SQL no Postgres do Railway via túnel SSH (raw, fora do Prisma).
// Uso: npm run db:exec -- caminho/para/migracao.sql   (no backend)
// Divide o arquivo em statements por ';' e executa um a um.
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run db:exec -- <arquivo.sql>");
    process.exit(1);
  }
  const sql = fs.readFileSync(file, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    console.error("[db:exec] nenhum statement encontrado.");
    process.exit(1);
  }

  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    for (const stmt of statements) {
      const label = stmt.split(/\s+/).slice(0, 3).join(" ");
      console.log(`[db:exec] ${label} ...`);
      try {
        const r = await prisma.$executeRawUnsafe(stmt);
        console.log(`[db:exec] OK (${r} linha(s) afetadas)`);
      } catch (err) {
        console.error(`[db:exec] FALHA em: ${stmt}`);
        throw err;
      }
    }
    console.log("[db:exec] migração concluída com sucesso!");
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("[db:exec] falha:", err.message || err);
  process.exit(1);
});