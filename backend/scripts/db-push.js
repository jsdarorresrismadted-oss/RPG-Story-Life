// db-push.js — aplica o schema Prisma no Postgres do Railway via túnel SSH.
// Uso: npm run db:push  (no backend)
// Abre "railway connect Postgres --tunnel-only -P 15432", roda prisma db push e fecha o túnel.
const { execSync } = require("child_process");
const { openTunnel } = require("./db-tunnel");

const args = process.argv.slice(2);
const acceptDataLoss = args.includes("--accept-data-loss") || args.includes("-a");

async function main() {
  const tunnel = await openTunnel();
  try {
    const flags = acceptDataLoss ? " --accept-data-loss" : "";
    execSync(`npx.cmd prisma db push${flags}`, {
      stdio: "inherit",
      shell: "cmd.exe",
      env: { ...process.env, DATABASE_URL: tunnel.url },
    });
    console.log("[db:push] schema aplicado com sucesso!");
  } finally {
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("[db:push] falha:", err.message);
  process.exit(1);
});