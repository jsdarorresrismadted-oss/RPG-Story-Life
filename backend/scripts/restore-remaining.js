const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const BACKUP_DIR = process.argv[2] || "20260813-153541";
const TARGETS = ["MapMonster", "MapNpc", "User", "RedeemCode", "ShopProduct"];

const NUMERIC_TYPES = new Set(["integer", "bigint", "smallint", "numeric", "decimal", "real", "double precision", "serial", "bigserial"]);
const TEMPORAL_TYPES = new Set(["timestamp without time zone", "timestamp with time zone", "date", "time without time zone", "time with time zone"]);

(async () => {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: `${tunnel.url}?connection_limit=1` } } });
  try {
    const cols = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const numericCols = new Set();
    const temporalCols = new Set();
    const jsonCols = new Set();
    const colNames = {};
    for (const c of cols) {
      colNames[c.table_name] = colNames[c.table_name] || new Set();
      colNames[c.table_name].add(c.column_name);
      const key = `${c.table_name}:${c.column_name}`;
      if (NUMERIC_TYPES.has(c.data_type)) numericCols.add(key);
      else if (TEMPORAL_TYPES.has(c.data_type)) temporalCols.add(key);
      else if (c.data_type === "json" || c.data_type === "jsonb") jsonCols.add(key);
    }

    const src = path.join(__dirname, "..", "backups", BACKUP_DIR);
    for (const table of TARGETS) {
      const file = path.join(src, `${table}.json`);
      if (!fs.existsSync(file)) { console.log(`${table}: backup ausente`); continue; }
      const rows = JSON.parse(fs.readFileSync(file, "utf8"));
      if (rows.length === 0) { console.log(`${table}: 0 linhas`); continue; }
      const existing = colNames[table] || new Set();
      const missing = Object.keys(rows[0]).filter((c) => !existing.has(c));
      if (missing.length) console.log(`${table}: colunas ignoradas (nao existem no schema atual): ${missing.join(", ")}`);
      const useCols = Object.keys(rows[0]).filter((c) => existing.has(c));
      if (useCols.length === 0) { console.log(`${table}: nenhuma coluna compativel — pulando`); continue; }
      const colList = useCols.map((c) => `"${c}"`).join(", ");
      const placeholders = useCols.map((c, i) => (jsonCols.has(`${table}:${c}`) ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ");
      const sql = `INSERT INTO "public"."${table}" (${colList}) VALUES (${placeholders})`;
      let ok = 0;
      for (const row of rows) {
        try {
          const params = useCols.map((c) => {
            const key = `${table}:${c}`;
            const v = row[c];
            if (v === null || v === undefined) return v;
            if (numericCols.has(key) && typeof v === "string" && v !== "") return Number(v);
            if (temporalCols.has(key) && typeof v === "string" && v !== "") return new Date(v);
            if (jsonCols.has(key) && typeof v === "object") return JSON.stringify(v);
            return v;
          });
          await prisma.$executeRawUnsafe(sql, ...params);
          ok++;
        } catch (e) {
          console.error(`${table}: falhou id=${row.id || row.slug || "?"}: ${(e.meta?.message || e.message).split("\n")[0]}`);
        }
      }
      console.log(`${table}: ${ok}/${rows.length} restauradas`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
})().catch((err) => {
  console.error("falha:", err.meta?.message || err.message || err);
  process.exit(1);
});