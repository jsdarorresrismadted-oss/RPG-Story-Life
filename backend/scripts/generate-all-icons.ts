// Gera (via IA) os ícones pixel art nos paths EXATOS referenciados pelo seed e
// pelo banco (ex.: /icons/64x64/Armas/fc1441.png, /icons/64x64/Skills/fc1106.png).
// O filename é mantido igual ao que já está gravado nos dados, então nenhum
// registro precisa ser migrado — os arquivos simplesmente passam a existir.
//
// Uso:
//   cd backend
//   npx tsx scripts/generate-all-icons.ts
import "dotenv/config";
import sharp from "sharp";
import seedContent from "../prisma/seed-content";
import { renderSprite } from "../src/core/ai/imageRenderer";
import { postProcess, saveGeneratedIcon, syncManifestFiles } from "../src/core/ai/itemGenerator";

const SUFFIX =
  "pixel art icon, 64x64 game asset, solid flat bright magenta (#FF00FF) background, uniform single color, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered and filling most of the frame (80-90% of the canvas), no character, no text, no UI, no logo, no frame, no external shadow, no aura, no glow, no magic particles, no sparks, no light rays, no fire or energy coming out of the item, item at rest, consistent style, same detail level, same lighting, same outline, same pixel density";

interface Target {
  filename: string;
  category: string;
  prompt: string;
}

function parseIconPath(icon: string | null | undefined): { category: string; filename: string } | null {
  if (!icon) return null;
  const m = String(icon).match(/^\/icons\/64x64\/([^/]+)\/([^/]+\.png)$/i);
  if (!m) return null;
  return { category: m[1], filename: m[2] };
}

function slugHash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const RARITY_PT: Record<string, string> = {
  common: "comum",
  uncommon: "incomum",
  rare: "raro",
  epic: "epico",
  legendary: "lendario",
  mythic: "mitico",
};

async function buildTargets(): Promise<Target[]> {
  const targets = new Map<string, Target>(); // key = filename

  const add = (icon: string | null | undefined, prompt: string) => {
    const parsed = parseIconPath(icon);
    if (!parsed) return;
    const key = parsed.filename;
    if (!targets.has(key)) targets.set(key, { ...parsed, prompt });
  };

  // Itens de equipamento + consumíveis
  for (const item of seedContent.items) {
    const parsed = parseIconPath(item.icon);
    if (!parsed) continue;
    const rarity = RARITY_PT[item.rarity] || item.rarity;
    const prompt =
      `A pixel art icon for an RPG ${item.type} equipment item named "${item.name}" (rarity: ${rarity}). ` +
      (item.description ? `Item description: ${item.description}. ` : "") +
      SUFFIX;
    add(item.icon, prompt);
  }

  // Skills (icon principal + iconSecondary)
  for (const entry of seedContent.classSkills) {
    for (const skill of entry.skills || []) {
      const kindPt = skill.kind === "attack" ? "attack skill" : skill.kind === "heal" ? "healing spell" : skill.kind === "ultimate" ? "ultimate ability" : "buff effect";
      const base = `A pixel art icon for an RPG ${kindPt} named "${skill.name}". ${skill.description || ""} `;
      add(skill.icon, base + SUFFIX);
      add(skill.iconSecondary, `A pixel art icon for the secondary effect of the skill "${skill.name}". ${skill.description || ""} ` + SUFFIX);
    }
    for (const passive of entry.passives || []) {
      add(passive.icon, `A pixel art icon for a passive ability named "${passive.name}". ${passive.description || ""} ` + SUFFIX);
    }
  }

  // Effects
  for (const effect of seedContent.effects || []) {
    add(effect.icon, `A pixel art icon for a magic effect "${effect.name}". ${effect.description || ""} ` + SUFFIX);
  }

  return Array.from(targets.values());
}

const CONCURRENCY = 1;
const DELAY_MS = 2500;
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderWithRetry(prompt: string, seed: number): Promise<Buffer> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { buf } = await renderSprite(prompt, seed);
      return buf;
    } catch (err: any) {
      lastErr = err;
      const isRate = /429|too many|rate.?limit/i.test(String(err?.message || err));
      const wait = (attempt + 1) * (isRate ? 15000 : 4000);
      console.log(`    retry ${attempt + 1}/${MAX_RETRIES} em ${wait}ms (${String(err?.message || err).slice(0, 80)})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function run() {
  const allTargets = await buildTargets();
  const only = process.argv.slice(2).map((a) => a.trim().toLowerCase()).filter(Boolean);
  const targets = only.length > 0
    ? allTargets.filter((t) => only.includes(t.filename.toLowerCase()) || only.includes((t.category + "/" + t.filename).toLowerCase()))
    : allTargets;
  console.log("Total de ícones a gerar:", targets.length);

  let done = 0;
  const failures: string[] = [];
  const queue = [...targets];

  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) break;
      try {
        const seed = 100000 + (slugHash(t.filename) % 900000);
        const buf = await renderWithRetry(t.prompt, seed);
        const { png } = await postProcess(buf);
        // Se a chroma key removeu quase tudo, salva o PNG original
        // redimensionado para 64x64 (fundo magenta visível) em vez de um
        // sprite vazio/transparente — sempre deixa algo no inventário.
        const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 10) opaque++;
        const cov = (opaque / (info.width * info.height)) * 100;
        const final = cov < 2
          ? await sharp(buf).resize(64, 64, { kernel: "nearest" }).png().toBuffer()
          : png;
        await saveGeneratedIcon(t.category, t.filename, final);
        done++;
        console.log(`  [${done}/${targets.length}] ${t.category}/${t.filename} (cobertura ${cov.toFixed(1)}%)`);
      } catch (err: any) {
        failures.push(`${t.category}/${t.filename}: ${String(err?.message || err).slice(0, 140)}`);
        console.error("  FALHOU:", t.category + "/" + t.filename, String(err?.message || err).slice(0, 140));
      } finally {
        await sleep(DELAY_MS);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  syncManifestFiles();
  console.log("Resumo: gerados", done, "| falhas", failures.length);
  if (failures.length > 0) {
    console.log("Falhas:");
    for (const f of failures) console.log("  -", f);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
