const { execFileSync } = require("child_process");
const { openTunnel, PORT, DB_NAME } = require("../backend/scripts/db-tunnel");
const fs = require("fs");

const PG_BIN = "C:\\Program Files\\PostgreSQL\\16\\bin";
const LOCAL_PASSWORD = process.argv[2];
const DUMP = process.env.TEMP + "\\railway-dump.sql";

if (!LOCAL_PASSWORD) {
  console.error("Uso: node scripts/notebook-migrate.js <senha-do-postgres-local>");
  process.exit(1);
}

(async () => {
  console.log("[migrate] abrindo tunel para o Postgres do Railway...");
  const tunnel = await openTunnel();
  try {
    console.log("[migrate] pg_dump do Railway...");
    execFileSync(PG_BIN + "\\pg_dump.exe", [
      "-h", "127.0.0.1", "-p", String(PORT), "-U", "postgres", "-d", DB_NAME,
      "--no-owner", "--no-privileges", "-f", DUMP,
    ], { stdio: "inherit", env: { ...process.env, PGPASSWORD: tunnel.password } });

    console.log("[migrate] restaurando no Postgres local (rpgstorylife)...");
    execFileSync(PG_BIN + "\\psql.exe", [
      "-h", "127.0.0.1", "-U", "rpgstory", "-d", "rpgstorylife", "-v", "ON_ERROR_STOP=1", "-f", DUMP,
    ], { stdio: "inherit", env: { ...process.env, PGPASSWORD: LOCAL_PASSWORD } });

    fs.unlinkSync(DUMP);
    console.log("[migrate] pronto! Dados migrados do Railway para o notebook.");
  } finally {
    tunnel.close();
  }
})().catch((err) => {
  console.error("[migrate] falhou:", err.message);
  process.exit(1);
});