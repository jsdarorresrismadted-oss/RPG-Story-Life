// db-pull.js — baixa o backup mais recente (ou o escolhido) do VOLUME do Railway
// para a pasta local backend/backups/. Depois pode usar: npm run db:restore <nome>.
// Uso: npm run db:pull [<nome-do-backup>]   (no backend)
// - Sem argumento, baixa o backup mais recente do volume.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAILWAY_JS = "C:\\Users\\Dark\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.js";
const BACKUP_ROOT = path.join(__dirname, "..", "backups");

function railway(args) {
  return execFileSync(process.execPath, [RAILWAY_JS, ...args], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function volumeId() {
  const out = JSON.parse(railway(["volume", "list", "--json"]));
  const list = Array.isArray(out) ? out : out.volumes || [];
  const vol = list.find((v) => (v.mountPath || v.mount_path || "").includes("backups")) || list[0];
  if (!vol) throw new Error("nenhum volume encontrado no projeto");
  return vol.id;
}

function listRemote(vol, dir) {
  const out = JSON.parse(railway(["volume", "files", "-v", vol, "list", dir, "--json"]));
  return out.files || [];
}

function main() {
  const vol = volumeId();
  const entries = listRemote(vol, "/");
  const dirs = entries
    .filter((e) => e.type === "directory" && /^\d{8}-\d{6}$/.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (dirs.length === 0) throw new Error("nenhum backup no volume — o servidor ainda não gerou snapshots");

  const positional = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const target = positional || dirs[0].name;
  if (!dirs.some((d) => d.name === target)) throw new Error(`backup "${target}" não existe no volume`);

  const local = path.join(BACKUP_ROOT, target);
  console.log(`[db:pull] baixando ${target} do volume (${dirs.find((d) => d.name === target).path})...`);
  // O CLI cria <local>/<target>/... se a pasta já existir; passamos o ROOT para
  // ele criar diretamente em backups/<target>/. Se sobrou algo de uma tentativa
  // anterior, limpamos para não duplicar.
  fs.rmSync(local, { recursive: true, force: true });
  railway(["volume", "files", "-v", vol, "download", `/${target}`, BACKUP_ROOT, "--overwrite"]);
  const files = fs.readdirSync(local);
  const total = files.filter((f) => f.endsWith(".json")).length;
  console.log(`[db:pull] OK — ${total} arquivos em ${local}`);
  console.log(`[db:pull] para restaurar: npm run db:restore ${target}`);
}

main();
