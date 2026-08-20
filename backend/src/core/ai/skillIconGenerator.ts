import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// ===== Gerador de arte de skills via IA (imagem) =====
// Usa Hugging Face Inference (SD3 Medium â€” grÃ¡tis, ~300 req/h no tier free).
// GeraÃ§Ã£o em LOTE: TODOS os Ã­cones de uma classe em UMA Ãºnica imagem
// (1 chamada de IA) e recorta cada cÃ©lula. Cada classe = 1 chamada de IA.

const SKILL_DIR = path.resolve(__dirname, "../../../../frontend/public/iconskill");
const ICON_URL_PREFIX = "/iconskill";

function buildBatchPrompt(inputs: SkillIconInput[]): string {
  const cls = String(inputs[0]?.class || "unknown");
  if (inputs.length === 1) return `cria 1 ícone skill "${inputs[0].name}" porem faz em um imagem só.`;
  return `cria ${inputs.length} ícones skills para uma classe "${cls}" porem faz em um imagem só.`;
}

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h % 100000;
}

const genTimeout = (ms: number) => {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  return undefined;
};

// Hugging Face Inference (SD3 Medium â€” o Ãºnico modelo text-to-image grÃ¡tis do
// provedor hf-inference, ~300 req/h no tier free, sem cartÃ£o).
async function huggingfaceImage(prompt: string, portrait = false): Promise<{ buffer: Buffer; mime: string }> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) throw new Error("HUGGINGFACE_API_TOKEN nÃ£o definido");
  // SD3 aceita mÃºltiplos de 64px. Em lote (5 cÃ©lulas): 384x1920 (cada cÃ©lula
  // 384x384 quadrada). UnitÃ¡rio: 512x512 (sliceAndSave redimensiona p/ 64).
  const width = portrait ? 384 : 512;
  const height = portrait ? 384 * Math.min(10, Math.max(1, Math.ceil(2048 / 384))) : 512;
  const res = await fetch(
    "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: genTimeout(240000),
      body: JSON.stringify({ inputs: prompt, parameters: { width, height } }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HuggingFace HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const mime = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("HuggingFace: resposta vazia");
  return { buffer, mime };
}

// NVIDIA NIM (FLUX.1-dev â€" gratuito para prototipagem, sem cartÃ£o, ~40 req/min).
async function nvidiaImage(prompt: string, portrait = false): Promise<{ buffer: Buffer; mime: string }> {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error("NVIDIA_NIM_API_KEY nÃ£o definido");
  const width = portrait ? 384 : 1024;
  const height = portrait ? 384 * Math.min(10, Math.max(1, Math.ceil(2048 / 384))) : 1024;
  const res = await fetch(
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: genTimeout(120000),
      body: JSON.stringify({ prompt, width, height }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NVIDIA NIM HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const b64 = data?.artifacts?.[0]?.base64;
  if (!b64) throw new Error("NVIDIA NIM: resposta sem imagem");
  const mime = "image/png";
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) throw new Error("NVIDIA NIM: imagem vazia");
  return { buffer, mime };
}

function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

async function writeIcon(fileName: string, result: { buffer: Buffer; mime: string }): Promise<string> {
  await fs.mkdir(SKILL_DIR, { recursive: true });
  const file = `${fileName}.${extForMime(result.mime)}`;
  await fs.writeFile(path.join(SKILL_DIR, file), result.buffer);
  return `${ICON_URL_PREFIX}/${file}`;
}

export interface SkillIconInput {
  name: string;
  description?: string;
  kind?: string;
  currentIcon?: string | null;
  seed?: string | number;
  key?: string; // chave de retorno + nome do arquivo (slug da skill)
  class?: string; // identidade visual da classe (tema de cores/materiais)
rarity?: string; // intensidade/brilho/complexidade (common..legendary)
}

// Recorta uma imagem em `n` cÃ©lulas iguais (coluna vertical, de cima para baixo),
// redimensiona cada uma para 64x64 PNG e salva em frontend/public/iconskill.
async function sliceAndSave(fileNames: string[], buffer: Buffer, n: number): Promise<string[]> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const width = meta.width || 64;
  const height = meta.height || 64 * n;
  const cellH = Math.max(1, Math.floor(height / n));
  const urls: string[] = [];
  await fs.mkdir(SKILL_DIR, { recursive: true });
  for (let i = 0; i < n; i++) {
    const tile = await sharp(buffer)
      .extract({ left: 0, top: Math.min(height - cellH, i * cellH), width, height: cellH })
      .resize(64, 64, { fit: "cover" })
      .png()
      .toBuffer();
    const file = `${fileNames[i]}.png`;
    await fs.writeFile(path.join(SKILL_DIR, file), tile);
    urls.push(`${ICON_URL_PREFIX}/${file}`);
  }
  return urls;
}

// Gera N Ã­cones em UMA Ãºnica chamada de IA (Hugging Face) e recorta.
// Retorna um mapa key (slug da skill) â†’ caminho do Ã­cone.
export async function generateSkillIconsBatch(inputs: SkillIconInput[]): Promise<Record<string, string>> {
  const list = inputs.slice(0, 10);
  if (list.length === 0) return {};
  const n = list.length;
  const fileNames = list.map((inp) => {
    const slug = inp.key || slugify(inp.name);
    const seed = typeof inp.seed === "number" ? inp.seed : hashSeed(String(inp.seed || inp.name));
    return `ai-${slug}-${seed}`;
  });
  const prompt = buildBatchPrompt(list);

  const providers: { name: string; run: () => Promise<{ buffer: Buffer; mime: string }> }[] = [];
  if (process.env.NVIDIA_NIM_API_KEY) {
    providers.push({ name: "NVIDIA NIM", run: () => nvidiaImage(prompt, true) });
  }
  providers.push({ name: "HuggingFace", run: () => huggingfaceImage(prompt, true) });

  let buffer: Buffer | null = null;
  let used = "";
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const result = await p.run();
      buffer = result.buffer;
      used = p.name;
      break;
    } catch (err: any) {
      errors.push(`${p.name}: ${String(err?.message || err).slice(0, 150)}`);
    }
  }
  if (!used || !buffer) throw new Error(`Todas as IAs de imagem falharam: ${errors.join(" | ")}`);
  console.log(`[skillIconGenerator] lote de ${n} skills gerado por ${used}${errors.length ? ` (erros anteriores: ${errors.join(" | ")})` : ""}`);

  // Salva tambÃ©m a imagem Ãºnica (todas as skills empilhadas) para conferÃªncia â€”
  // ex.: /iconskill/batch-<slug da 1Âª skill>.png
  const batchSeed = hashSeed(list.map((i) => String(i.name)).join("|"));
  const batchFile = `batch-${String(list[0].key || list[0].name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${batchSeed}`;
  await fs.mkdir(SKILL_DIR, { recursive: true });
  await fs.writeFile(path.join(SKILL_DIR, `${batchFile}.png`), buffer);

  const urls = await sliceAndSave(fileNames, buffer, n);
  const out: Record<string, string> = {};
  list.forEach((inp, i) => {
    out[inp.key || slugify(inp.name)] = urls[i];
  });
  return out;
}

export async function generateSkillIcons(input: SkillIconInput): Promise<{ icon: string }> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome da skill Ã© obrigatÃ³rio");
  const kind = String(input.kind || "attack").toLowerCase();
  const description = String(input.description || "").trim();
  const slug = slugify(name);
const seed = typeof input.seed === "number" ? input.seed : hashSeed(String(input.seed || name));

  const prompt = buildBatchPrompt([{ ...input, key: slug }]);

  const providers: { name: string; run: () => Promise<{ buffer: Buffer; mime: string }> }[] = [];
  if (process.env.NVIDIA_NIM_API_KEY) {
    providers.push({ name: "NVIDIA NIM", run: () => nvidiaImage(prompt, false) });
  }
  providers.push({ name: "HuggingFace", run: () => huggingfaceImage(prompt, false) });

  let result: { buffer: Buffer; mime: string } | null = null;
  let used = "";
  const errors: string[] = [];
  for (const p of providers) {
    try {
      result = await p.run();
      used = p.name;
      break;
    } catch (err: any) {
      errors.push(`${p.name}: ${String(err?.message || err).slice(0, 150)}`);
    }
  }
  if (!result) throw new Error(`Todas as IAs de imagem falharam: ${errors.join(" | ")}`);
  console.log(`[skillIconGenerator] skill "${name}" gerada por ${used}${errors.length ? ` (erros anteriores: ${errors.join(" | ")})` : ""}`);

  const icon = await writeIcon(`ai-${slug}-${seed}`, result);
  return { icon };
}
