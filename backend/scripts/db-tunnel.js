// db-tunnel.js — helper compartilhado: abre o túnel SSH para o Postgres do Railway
// e devolve a URL de conexão. Usado por db-push, db-backup e db-restore.
const { spawn, execFileSync } = require("child_process");

const PORT = 15432;
const RAILWAY_JS = "C:\\Users\\Dark\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.js";
const DB_NAME = process.env.RAILWAY_DB_NAME || "railway";

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

function waitForTunnel(proc, timeoutMs = 45000) {
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

function killPortListeners(port) {
  try {
    const { execSync } = require("child_process");
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && line.includes("LISTENING")) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && !isNaN(Number(pid))) {
          try { process.kill(Number(pid), "SIGKILL"); } catch { /* já morreu */ }
        }
      }
    }
  } catch { /* melhor esforço */ }
}

// Abre o túnel e devolve { url, password, close() }.
async function openTunnel() {
  console.log("[db] abrindo túnel SSH para o Postgres do Railway...");
  const tunnel = spawn(process.execPath, [RAILWAY_JS, "connect", "Postgres", "--tunnel-only", "-P", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForTunnel(tunnel);
    const password = dbPassword();
    if (!password) throw new Error("não consegui ler a senha do Postgres (login do Railway necessário?)");
    console.log(`[db] túnel aberto em 127.0.0.1:${PORT}`);
    return {
      url: `postgresql://postgres:${password}@127.0.0.1:${PORT}/${DB_NAME}`,
      password,
      close() {
        tunnel.kill();
        killPortListeners(PORT);
        console.log("[db] túnel fechado.");
      },
    };
  } catch (err) {
    tunnel.kill();
    killPortListeners(PORT);
    throw err;
  }
}

module.exports = { openTunnel, dbPassword, PORT, DB_NAME };