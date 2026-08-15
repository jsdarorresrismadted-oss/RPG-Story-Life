// =====================================================================
// Deploy para a VM (Oracle Cloud Always Free / qualquer servidor Ubuntu).
// Uso (do diretorio raiz do repo):
//   node scripts/deploy-vm.js --host ubuntu@IP                 # deploy normal (git pull + build + restart)
//   node scripts/deploy-vm.js --host ubuntu@IP --deploy-key deploy-key.pem   # 1a vez: clone + deploy
//   node scripts/deploy-vm.js --host ubuntu@IP --init-env --domain rpg.dominio.com   # gera .env da VM
//   node scripts/deploy-vm.js --host ubuntu@IP --migrate-data # copia dados do Railway p/ VM
//   VM_HOST=ubuntu@IP node scripts/deploy-vm.js               # host via variavel de ambiente
// =====================================================================
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const host = process.env.VM_HOST || getArg("--host");
const appDir = process.env.VM_APP_DIR || "/opt/rpg-story-life";
const deployKey = getArg("--deploy-key");
const domain = getArg("--domain");
const mode = args.includes("--migrate-data") ? "migrate-data" : args.includes("--init-env") ? "init-env" : "deploy";

if (!host) {
  console.error("Uso: node scripts/deploy-vm.js --host ubuntu@IP [--deploy-key KEY] [--domain DOMINIO] [--migrate-data]");
  process.exit(1);
}

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, stdio: opts.capture ? "pipe" : "inherit", ...opts });
  if (r.status !== 0 && !opts.ignore) process.exit(r.status ?? 1);
  return r;
}

function ssh(remoteCmd, opts = {}) {
  const r = spawnSync(
    "ssh",
    ["-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20", host, remoteCmd],
    { stdio: opts.capture ? "pipe" : "inherit", ...opts }
  );
  if (r.status !== 0 && !opts.ignore) process.exit(r.status ?? 1);
  return r;
}

function scp(localPath, remotePath) {
  const r = spawnSync("scp", ["-o", "StrictHostKeyChecking=accept-new", localPath, `${host}:${remotePath}`], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------
// init-env: monta o .env da VM a partir do .env local (secrets do Railway)
// ---------------------------------------------------------------------
function initEnv() {
  const localEnv = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(localEnv)) {
    console.error("Nao achei .env local para copiar secrets. Edite manualmente o .env da VM (deploy/vm-env.template).");
    process.exit(1);
  }
  const lines = fs.readFileSync(localEnv, "utf8").split(/\r?\n/);
  const vars = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith("#")) vars[m[1]] = m[2];
  }
  if (!domain) {
    console.warn("--domain nao informado: FRONTEND_URL/ADMIN_URL ficarao como no .env local (localhost). Passe --domain!");
  }
  const base = domain ? `https://${domain}` : (vars.FRONTEND_URL || "http://localhost:5173");
  vars.NODE_ENV = "production";
  vars.PORT = "3001";
  vars.DB_USER = vars.DB_USER || "rpgstory";
  vars.DB_PASSWORD = vars.DB_PASSWORD || "CHANGE_ME";
  vars.DB_NAME = vars.DB_NAME || "rpgstorylife";
  vars.DATABASE_URL = `postgresql://${vars.DB_USER}:${vars.DB_PASSWORD}@127.0.0.1:5432/${vars.DB_NAME}?schema=public`;
  vars.REDIS_URL = "redis://127.0.0.1:6379";
  vars.FRONTEND_URL = base;
  vars.ADMIN_URL = base;
  vars.CORS_ORIGIN = base;
  vars.DISCORD_REDIRECT_URI = `${base}/api/auth/discord/callback`;

  const out = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";

  const tmp = path.join(os.tmpdir(), "vm.env");
  fs.writeFileSync(tmp, out);
  scp(tmp, `${appDir}/.env`);
  ssh(`chmod 600 ${appDir}/.env && echo ".env enviado para ${appDir}/.env — agora rode o setup e o deploy:" && echo "  sudo bash ${appDir}/deploy/setup-vm.sh"`);
  console.log("OK. Proximo passo:");
  console.log(`  ssh ${host} "sudo bash ${appDir}/deploy/setup-vm.sh"`);
  console.log(`  node scripts/deploy-vm.js --host ${host} --deploy-key <KEY> [--domain ${domain || "seu-dominio.com"}]`);
}

// ---------------------------------------------------------------------
// deploy: git pull (ou clone) + build + prisma + restart + healthcheck
// ---------------------------------------------------------------------
function deploy() {
  const gitCmd = `ssh -i ${appDir}/deploy-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;

  ssh(`mkdir -p ${appDir}`);

  // Deploy key (1a vez): copia local para a VM e configura o git
  if (deployKey) {
    scp(deployKey, `${appDir}/deploy-key`);
    ssh(`chmod 600 ${appDir}/deploy-key`);
  }

  const hasRepo = ssh(`test -d ${appDir}/.git && echo yes`, { ignore: true, capture: true }).stdout?.toString().includes("yes");
  if (!hasRepo) {
    const repoUrl = sh(`git remote get-url origin`, { ignore: true, capture: true }).stdout?.toString().trim();
    if (!repoUrl) {
      console.error("Nao consegui descobrir a URL do repo (git remote get-url origin). Clone manualmente na VM.");
      process.exit(1);
    }
    if (!deployKey) {
      console.error("Primeira vez: passe --deploy-key <caminho-da-deploy-key> para clonar o repo privado na VM.");
      process.exit(1);
    }
    console.log(`==> Clonando ${repoUrl}`);
    ssh(`cd ${appDir} && GIT_SSH_COMMAND='${gitCmd}' git clone ${repoUrl} .`);
  } else {
    console.log("==> git pull");
    ssh(`cd ${appDir} && GIT_SSH_COMMAND='${gitCmd}' git pull --ff-only`);
  }

  console.log("==> npm install + build (backend + frontend + admin) — pode levar alguns minutos");
  ssh(`cd ${appDir} && set -a && . ./.env && set +a && npm install --no-audit --no-fund && npm run build`);

  console.log("==> prisma db push (schema no banco da VM)");
  ssh(`cd ${appDir}/backend && set -a && . ../.env && set +a && npx prisma db push --accept-data-loss --skip-generate`);

  console.log("==> restart do servico");
  ssh(`systemctl restart rpg-backend`);

  console.log("==> healthcheck");
  let ok = false;
  for (let i = 0; i < 10; i++) {
    const r = ssh(`sleep 3; curl -fsS http://127.0.0.1:3001/api/health`, { ignore: true });
    if (r.status === 0) { ok = true; break; }
  }
  if (!ok) {
    console.error("Healthcheck falhou! Veja os logs: ssh " + host + " \"journalctl -u rpg-backend -n 50\"");
    process.exit(1);
  }
  console.log("\nDeploy concluido e saudavel!");
  console.log(`Frontend:  https://\${FRONTEND_URL} (configure DNS + certbot: sudo certbot --nginx -d seu-dominio.com)`);
}

// ---------------------------------------------------------------------
// migrate-data: pg_dump do Railway -> restore no Postgres local da VM
// ---------------------------------------------------------------------
function migrateData() {
  ssh(
    `set -a; . ${appDir}/.env; set +a; ` +
    `test -n "$RAILWAY_DATABASE_URL" || { echo "Defina RAILWAY_DATABASE_URL no ${appDir}/.env (Railway > Settings > DATABASE_URL)"; exit 1; }; ` +
    `PGPASSWORD="$DB_PASSWORD" pg_dump "$RAILWAY_DATABASE_URL" -Fc -f /tmp/rpg-dump.sql && ` +
    `PGPASSWORD="$DB_PASSWORD" pg_restore --clean --if-exists --no-owner -d "$DB_NAME" /tmp/rpg-dump.sql && ` +
    `echo "MIGRACAO OK" && rm -f /tmp/rpg-dump.sql`
  );
  console.log("Dados migrados! Depois remova RAILWAY_DATABASE_URL do .env da VM.");
}

if (mode === "init-env") initEnv();
else if (mode === "migrate-data") migrateData();
else deploy();