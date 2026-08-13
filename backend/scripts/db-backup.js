// db-backup.js — snapshot COMPLETO do banco (Railway) em JSON, com data/hora.
// Uso: npm run db:backup [-- --keep N]  (no backend)
// - Abre o túnel SSH, baixa TODAS as tabelas (menos prisma_migrations) e salva em
//   backend/backups/<data-hora>/<tabela>.json + meta.json.
// - Mantém os últimos N backups (padrão 10) e apaga os mais antigos.
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const BACKUP_ROOT = path.join(__dirname, "..", "backups");
const EXCLUDE_TABLES = new Set(["prisma_migrations"]);

const args = process.argv.slice(2);
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx !== -1 && args[keepIdx + 1] ? Math.max(1, Number(args[keepIdx + 1]) || 10) : 10;

function serializeRow(row) {
  return JSON.stringify(row, (k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function tsName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pruneOld() {
  if (!fs.existsSync(BACKUP_ROOT)) return;
  const dirs = fs.readdirSync(BACKUP_ROOT)
    .filter((d) => /^\d{8}-\d{6}$/.test(d))
    .sort()
    .reverse();
  for (const d of dirs.slice(KEEP)) {
    fs.rmSync(path.join(BACKUP_ROOT, d), { recursive: true, force: true });
    console.log(`[db:backup] removendo backup antigo: ${d}`);
  }
}

// Faz o backup usando uma conexão ALREADY ABERTA (url). Não abre túnel próprio.
// Devolve a pasta criada. Usado pelo db-backup.js (CLI) e pelo db-restore.js.
async function runBackup(url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const dest = path.join(BACKUP_ROOT, tsName());
  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const names = tables.map((t) => t.tablename).filter((t) => !EXCLUDE_TABLES.has(t));
    if (names.length === 0) throw new Error("nenhuma tabela encontrada");

    fs.mkdirSync(dest, { recursive: true });
    const summary = {};
    for (const table of names) {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "public"."${table}"`);
      fs.writeFileSync(path.join(dest, `${table}.json`), serializeRow(rows), "utf8");
      summary[table] = rows.length;
      console.log(`[db:backup] ${table}: ${rows.length} linha(s)`);
    }
    fs.writeFileSync(
      path.join(dest, "meta.json"),
      JSON.stringify({ createdAt: new Date().toISOString(), tables: summary }, null, 2),
      "utf8"
    );
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    console.log(`\n[db:backup] OK — ${names.length} tabelas, ${total} registros em ${dest}`);
    return dest;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  const tunnel = await openTunnel();
  try {
    await runBackup(tunnel.url);
    pruneOld();
    console.log(`[db:backup] mantendo os últimos ${KEEP} backups.`);
  } finally {
    tunnel.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[db:backup] falha:", err.message || err);
    process.exit(1);
  });
}

module.exports = { runBackup, BACKUP_ROOT };