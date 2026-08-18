import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// ===== Gerador de arte de skills via IA (imagem) =====
// Usa Gemini Image (GEMINI_IMAGE_MODEL) quando GEMINI_API_KEY existe;
// caso contrário usa Pollinations.ai (grátis), com seed fixo para manter
// consistência visual (~90% do estilo das artes atuais de iconskill/).
// Geração em LOTE: TODOS os ícones de uma classe em UMA única imagem
// (1 chamada de IA) e recorta cada célula — evita estourar o limite
// diário da Gemini. Cada classe = 1 chamada de IA para os 5 ícones.

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const SKILL_DIR = path.resolve(__dirname, "../../../../frontend/public/iconskill");
const ICON_URL_PREFIX = "/iconskill";

const STYLE_TAG =
  "classic MMORPG skill icon, dark fantasy RPG game art, 64x64 square game UI icon, hand-painted, vibrant glow effects, strong dark outline, dark dungeon background, centered single prominent subject, no text, no letters, no watermark";

const KIND_THEMES: Record<string, string> = {
  attack: "an offensive spell with bursting arcane energy and a glowing elemental slash",
  heal: "a soothing healing spell with emerald light and life runes",
  buff: "an empowering buff with a golden aura and rising sparkles",
  debuff: "a sinister debuff with toxic green mist and purple curse sigils",
  summon: "a summoning spell with a glowing portal and rune circle",
  mobility: "a swift movement spell with wind trails and speed lines",
  control: "a control spell with glowing chains and binding magic",
  defense: "a defensive spell with a sturdy magic shield and stone barrier",
  channel: "a channeling spell with a concentrated magical beam",
};

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

async function geminiImage(prompt: string, referenceB64: string | null, portrait = false): Promise<{ buffer: Buffer; mime: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não definida");
  const parts: any[] = [{ text: prompt }];
  if (referenceB64) parts.push({ inlineData: { mimeType: "image/png", data: referenceB64 } });
  const generationConfig: any = { responseModalities: ["TEXT", "IMAGE"] };
  // Em lote (N ícones empilhados): imagem vertical para cada célula sair quadrada.
  if (portrait) generationConfig.imageConfig = { aspectRatio: "9:16" };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: genTimeout(120000),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini Image HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const partsOut: any[] = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = partsOut.find((p) => p?.inlineData?.data);
  if (!imagePart) {
    const text = partsOut.map((p) => p?.text || "").join(" ").trim();
    throw new Error(text ? `Gemini Image não retornou imagem: ${text.slice(0, 150)}` : "Gemini Image: resposta vazia");
  }
  const mime = String(imagePart.inlineData.mimeType || "image/png");
  return { buffer: Buffer.from(imagePart.inlineData.data, "base64"), mime };
}

async function pollinationsImage(prompt: string, referenceUrl: string | null, seed: number, cells = 1): Promise<{ buffer: Buffer; mime: string }> {
  const params = new URLSearchParams({
    width: "64",
    height: String(64 * cells),
    seed: String(seed),
    nologo: "true",
    model: "flux",
  });
  if (referenceUrl) params.set("image", referenceUrl);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
  const res = await fetch(url, { signal: genTimeout(120000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pollinations HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const mime = res.headers.get("content-type") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("Pollinations: resposta vazia");
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
}

function buildBatchPrompt(inputs: SkillIconInput[]): string {
  const lines = inputs.map((inp, i) => {
    const theme = KIND_THEMES[String(inp.kind || "attack").toLowerCase()] || KIND_THEMES.attack;
    const desc = inp.description ? ` Inspired by this description: "${inp.description}".` : "";
    return `${i + 1}. "${inp.name}" (kind: ${inp.kind || "attack"}): ${theme}${desc}`;
  });
  return (
    `Create a SINGLE image containing exactly ${inputs.length} primary skill icons of the spells, ` +
    `arranged in one vertical column, top to bottom, in this exact order, each occupying its own equal square cell with no gaps, borders or numbers:\n${lines.join("\n")}\n\n` +
    `Each cell must be an isolated 64x64 square classic MMORPG skill icon. ${STYLE_TAG}`
  );
}

// Recorta uma imagem em `n` células iguais (coluna vertical, de cima para baixo),
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

// Gera N ícones em UMA única chamada de IA (Gemini ou Pollinations) e recorta.
// Retorna um mapa key (slug da skill) → caminho do ícone.
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

  const useGemini = !!process.env.GEMINI_API_KEY && !!process.env.GEMINI_IMAGE_MODEL;
  let buffer: Buffer;
  if (useGemini) {
    const refB64 = await firstReferenceB64(list);
    const result = await geminiImage(prompt, refB64, true);
    buffer = result.buffer;
  } else {
    const seed = hashSeed(list.map((i) => String(i.name)).join("|"));
    const result = await pollinationsImage(prompt, null, seed, n);
    buffer = result.buffer;
  }

  const urls = await sliceAndSave(fileNames, buffer, n);
  const out: Record<string, string> = {};
  list.forEach((inp, i) => {
    out[inp.key || slugify(inp.name)] = urls[i];
  });
  return out;
}

async function firstReferenceB64(inputs: SkillIconInput[]): Promise<string | null> {
  for (const inp of inputs) {
    const url = typeof inp.currentIcon === "string" && /^https?:\/\//i.test(inp.currentIcon.trim()) ? inp.currentIcon.trim() : null;
    if (!url) continue;
    try {
      const r = await fetch(url, { signal: genTimeout(20000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer()).toString("base64");
    } catch {
      // segue sem referência
    }
  }
  return null;
}

export async function generateSkillIcons(input: SkillIconInput): Promise<{ icon: string }> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome da skill é obrigatório");
  const kind = String(input.kind || "attack").toLowerCase();
  const description = String(input.description || "").trim();
  const slug = slugify(name);
  const seed = typeof input.seed === "number" ? input.seed : hashSeed(String(input.seed || name));
  const referenceUrl = typeof input.currentIcon === "string" && /^https?:\/\//i.test(input.currentIcon.trim()) ? input.currentIcon.trim() : null;

  const prompt = buildBatchPrompt([{ ...input, key: slug }]);

  const useGemini = !!process.env.GEMINI_API_KEY && !!process.env.GEMINI_IMAGE_MODEL;
  let refB64: string | null = null;
  if (useGemini && referenceUrl) {
    try {
      const r = await fetch(referenceUrl, { signal: genTimeout(20000) });
      if (r.ok) refB64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    } catch {
      refB64 = null;
    }
  }

  const result = useGemini
    ? await geminiImage(prompt, refB64)
    : await pollinationsImage(prompt, referenceUrl, seed);

  const icon = await writeIcon(`ai-${slug}-${seed}`, result);
  return { icon };
}