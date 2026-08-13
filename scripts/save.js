// Salva TODAS as modificações em um commit local (sem push/deploy).
// Uso: npm run save -- "mensagem opcional"
const { execSync } = require("child_process");

const message = process.argv.slice(2).join(" ").trim() || `save ${new Date().toISOString()}`;

try {
  const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  if (!status) {
    console.log("Nada para salvar — tudo já está commitado.");
    process.exit(0);
  }
  const fileCount = status.split(/\r?\n/).filter(Boolean).length;
  execSync("git add -A", { stdio: "inherit" });
  execSync(`git commit -m "save: ${message}"`, { stdio: "inherit" });
  console.log(`Salvo! ${fileCount} arquivo(s) commitado(s) localmente.`);
} catch (err) {
  console.error("Falha ao salvar:", err.message);
  process.exit(1);
}