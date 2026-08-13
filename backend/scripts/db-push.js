// db-push.js — aplica o schema Prisma no Postgres do Railway via túnel SSH.
// Uso: npm run db:push  (no backend)
// Abre "railway connect Postgres --tunnel-only -P 15432", roda prisma db push e fecha o túnel.
const { spawn, execSync, execFileSync } = require("child_process");

const PORT = 15432;
const RAILWAY_JS = "C:\\Users\\Dark\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.js";
const DB_NAME = process.env.RAILWAY_DB_NAME || "railway";

const args = process.argv.slice(2);
const acceptDataLoss = args.includes("--accept-data-loss") || args.includes("-a");

function railwayVariables() {
  try {
    return execFileSync(process.execPath, [RAILWAY_JS, "variables", "-s", "Postgres", "-k"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function dbPassword() {
  const out = railwayVariables();
  const m = out.match(/PGPASSWORD=(.+)/) || out.match(/DATABASE_URL=postgresql:\/\/postgres:([^@]+)@/);
  return m ? m[1].trim() : "";
}

function tunnelArgs() {
  return [RAILWAY_JS, "connect", "Postgres", "--tunnel-only", "-P", String(PORT)];
}

function waitForTunnel(proc, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let ready = false;
    const check = (d) => {
      const text = d.toString();
      if (text.includes("tunnel open") || text.includes("URL:")) {
        ready = true;
        resolve();
      }
    };
    proc.stdout.on("data", check);
    proc.stderr.on("data", check);
    setTimeout(() => {
      if (!ready) reject(new Error("túnel não abriu a tempo"));
    }, timeoutMs);
  }).catch((err) => {
    proc.kill();
    throw err;
  });
}

async function main() {
  console.log("[db:push] abrindo túnel SSH para o Postgres do Railway...");
  const tunnel = spawn(process.execPath, tunnelArgs(), { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForTunnel(tunnel);
    console.log(`[db:push] túnel aberto em 127.0.0.1:${PORT}`);

    const password = dbPassword();
    if (!password) throw new Error("não consegui ler PGPASSWORD do Railway (login necessário?)");
    const dbUrl = `postgresql://postgres:${password}@127.0.0.1:${PORT}/${DB_NAME}`;
    const flags = acceptDataLoss ? " --accept-data-loss" : "";
    execSync(`npx.cmd prisma db push${flags}`, {
      stdio: "inherit",
      shell: "cmd.exe",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    console.log("[db:push] schema aplicado com sucesso!");
  } finally {
    tunnel.kill();
    // também mata o ssh filho (túnel) caso o parent morra antes
    try {
      const { execSync: exec } = require("child_process");
      const out = exec("netstat -ano -p tcp", { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        if (line.includes(`:${PORT}`) && line.includes("LISTENING")) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && !isNaN(Number(pid))) process.kill(Number(pid), "SIGKILL");
        }
      }
    } catch { /* melhor esforço */ }
    console.log("[db:push] túnel fechado.");
  }
}

main().catch((err) => {
  console.error("[db:push] falha:", err.message);
  process.exit(1);
});