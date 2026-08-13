// db-restore.js — restaura um backup JSON no Postgres do Railway.
// Uso: npm run db:restore [<pasta-do-backup>|--latest] [--yes]  (no backend)
// - Faz um backup de segurança automático do estado atual ANTES de restaurar.
// - Substitui TODAS as tabelas pelos dados do backup escolhido.
// - Sem argumentos, pergunta qual backup usar; --latest usa o mais recente.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");
const { runBackup } = require("./db-backup");

const BACKUP_ROOT = path.join(__dirname, "..", "backups");
const EXCLUDE_TABLES = new Set(["prisma_migrations"]);

const args = process.argv.slice(2);
const autoYes = args.includes("--yes") || args.includes("-y");
const latest = args.includes("--latest") || args.includes("-l");

function listBackups() {
  if (!fs.existsSync(BACKUP_ROOT)) return [];
  return fs.readdirSync(BACKUP_ROOT).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort().reverse();
}

function chooseBackup() {
  const dirs = listBackups();
  if (dirs.length === 0) throw new Error("nenhum backup encontrado em backend/backups — rode npm run db:backup antes");
  if (latest) return dirs[0];
  const positional = args.find((a) => !a.startsWith("-"));
  if (positional) {
    if (!dirs.includes(positional)) throw new Error(`backup "${positional}" não encontrado`);
    return positional;
  }
  console.log("Backups disponíveis:");
  dirs.forEach((d, i) => console.log(`  ${i + 1}) ${d}`));
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Qual backup restaurar? [1-${dirs.length}] `, (ans) => {
      rl.close();
      const idx = parseInt(ans, 10);
      if (isNaN(idx) || idx < 1 || idx > dirs.length) return reject(new Error("opção inválida"));
      resolve(dirs[idx - 1]);
    });
  });
}

function confirm(backupDir, dbUrl) {
  if (autoYes) return Promise.resolve(true);
  console.log(`\nATENÇÃO: restaurar "${backupDir}" VAI SUBSTITUIR TODOS OS DADOS atuais do banco (${dbUrl.replace(/:[^:@]+@/, ":****@")}).`);
  console.log("Um backup de segurança do estado atual será feito antes.");
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Continuar? [s/N] ", (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === "s" || ans.toLowerCase() === "sim");
    });
  });
}

async function main() {
  const backupDir = await chooseBackup();
  const src = path.join(BACKUP_ROOT, backupDir);
  if (!fs.existsSync(path.join(src, "meta.json"))) throw new Error(`pasta ${backupDir} não parece um backup válido (sem meta.json)`);

  const tunnel = await openTunnel();
  // connection_limit=1: TODAS as queries usam a MESMA sessão, então o
  // session_replication_role (FK desligadas) vale para os inserts.
  const prisma = new PrismaClient({ datasources: { db: { url: `${tunnel.url}?connection_limit=1` } } });
  try {
    if (!(await confirm(backupDir, tunnel.url))) {
      console.log("restauração cancelada.");
      return;
    }

    // Backup de segurança automático do estado atual (reusa o túnel já aberto)
    console.log("\n[db:restore] backup de segurança do estado atual...");
    await runBackup(tunnel.url);

    const meta = JSON.parse(fs.readFileSync(path.join(src, "meta.json"), "utf8"));
    const tables = Object.keys(meta.tables).sort();

    // Tipos vindos do JSON que precisam de conversão de volta antes do INSERT:
    // - numéricos (bigint etc.) saíram como string no dump -> Number
    // - datas (timestamp sem/with tz) saíram como ISO string -> Date
    // - jsonb/json com arrays/objetos -> JSON.stringify (o driver pg serializa
    //   array como array do Postgres, e não como JSON)
    const colTypes = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const numericCols = new Set();
    const temporalCols = new Set();
    const jsonCols = new Set();
    const NUMERIC_TYPES = new Set(["integer", "bigint", "smallint", "numeric", "decimal", "real", "double precision", "serial", "bigserial"]);
    const TEMPORAL_TYPES = new Set(["timestamp without time zone", "timestamp with time zone", "date", "time without time zone", "time with time zone"]);
    for (const c of colTypes) {
      if (NUMERIC_TYPES.has(c.data_type)) numericCols.add(`${c.table_name}:${c.column_name}`);
      else if (TEMPORAL_TYPES.has(c.data_type)) temporalCols.add(`${c.table_name}:${c.column_name}`);
      else if (c.data_type === "json" || c.data_type === "jsonb") jsonCols.add(`${c.table_name}:${c.column_name}`);
    }

    // Sem transação explícita: com connection_limit=1 todas as queries usam a
    // mesma sessão, então o session_replication_role vale para os inserts.
    // A restauração é idempotente (TRUNCATE no começo), então pode ser reexecutada.
    await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);
    const failed = [];
    try {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((t) => `"public"."${t}"`).join(", ")} CASCADE`
      );
      console.log("[db:restore] truncado OK — restaurando dados...");
      for (const table of tables) {
        const rows = JSON.parse(fs.readFileSync(path.join(src, `${table}.json`), "utf8"));
        if (rows.length === 0) continue;
        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        // Colunas json/jsonb recebem cast explícito (o driver manda string como text)
        const placeholders = cols
          .map((c, i) => (jsonCols.has(`${table}:${c}`) ? `$${i + 1}::jsonb` : `$${i + 1}`))
          .join(", ");
        const sql = `INSERT INTO "public"."${table}" (${colList}) VALUES (${placeholders})`;
        try {
          for (const row of rows) {
            const params = cols.map((c) => {
              const key = `${table}:${c}`;
              const v = row[c];
              if (v === null || v === undefined) return v;
              if (numericCols.has(key) && typeof v === "string" && v !== "") return Number(v);
              if (temporalCols.has(key) && typeof v === "string" && v !== "") return new Date(v);
              if (jsonCols.has(key) && typeof v === "object") return JSON.stringify(v);
              return v;
            });
            await prisma.$executeRawUnsafe(sql, ...params);
          }
          console.log(`[db:restore] ${table}: ${rows.length} linha(s)`);
        } catch (e) {
          const msg = e.meta?.message || e.message || String(e);
          failed.push(`${table}: ${msg.split("\n")[0]}`);
          console.error(`[db:restore] FALHOU ${table}: ${msg.split("\n")[0]}`);
        }
      }
    } finally {
      await prisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
    }

    if (failed.length > 0) {
      console.error(`\n[db:restore] ${failed.length} tabela(s) com erro — reexecute para tentar de novo (o processo é idempotente):`);
      failed.forEach((f) => console.error("  - " + f));
      process.exitCode = 1;
      return;
    }
    const total = Object.values(meta.tables).reduce((a, b) => a + b, 0);
    console.log(`\n[db:restore] OK — ${tables.length} tabelas, ${total} registros restaurados de "${backupDir}".`);
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("[db:restore] falha:", err.meta?.message || err.message || err);
  process.exit(1);
});