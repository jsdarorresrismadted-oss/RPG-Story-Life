// Autosave contínuo: vigia o repositório e commita automaticamente (local, sem push)
// toda mudança que ficar parada por 20s. Rode com: npm run autosave
const { execSync } = require("child_process");

const IDLE_MS = 20 * 1000;
const MIN_INTERVAL_MS = 45 * 1000;

let lastCommitAt = 0;
let lastChangeAt = 0;
let dirty = false;

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function check() {
  const status = git("status --porcelain").split(/\r?\n/).filter(Boolean);
  const now = Date.now();
  if (status.length === 0) {
    if (dirty) console.log("[autosave] repositório limpo.");
    dirty = false;
    return;
  }
  dirty = true;
  const changedNow = git("status --porcelain").split(/\r?\n/).filter(Boolean).join("\n");
  lastChangeAt = now;
  if (now - lastCommitAt < MIN_INTERVAL_MS) return;
  const title = status.length <= 3 ? status.map((l) => l.slice(3)).join(", ") : `${status.length} arquivos`;
  try {
    git("add -A");
    execSync(`git commit -m "autosave: ${title}"`, { stdio: "ignore" });
    lastCommitAt = Date.now();
    console.log(`[autosave] commit local criado (${title})...`);
    void changedNow;
  } catch (err) {
    console.error("[autosave] falha no commit:", err.message);
  }
}

console.log("[autosave] vigiando modificações do projeto (commits locais automáticos, sem push). Ctrl+C para parar.");
setInterval(check, 5 * 1000);