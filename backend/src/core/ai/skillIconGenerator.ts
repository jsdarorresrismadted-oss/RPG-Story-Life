import { promises as fs } from "fs";
import path from "path";

// ===== Gerador de arte de skills via IA (imagem) =====
// Usa Gemini Image (GEMINI_IMAGE_MODEL) quando GEMINI_API_KEY existe;
// caso contrário usa Pollinations.ai (grátis), com seed fixo para manter
// consistência visual (~90% do estilo das artes atuais de iconskill/).
// Gera SEMPRE um par: ícone principal + ícone secundário (efeito).

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

function buildPrompt(input: { name: string; kind: string; description: string; variant: "primary" | "secondary" }): string {
  const theme = KIND_THEMES[input.kind] || KIND_THEMES.attack;
  const extra = input.variant === "secondary" ? " the same spell shown as the secondary/companion effect icon, complementary to the main icon" : "";
  const description = input.description ? ` Inspired by this description: "${input.description}".` : "";
  return `Create a ${input.variant === "secondary" ? "secondary" : "primary"} skill icon for the spell "${input.name}" (kind: ${input.kind}): ${theme}${extra}.${description} ${STYLE_TAG}`;
}

const genTimeout = (ms: number) => {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  return undefined;
};

async function geminiImage(prompt: string, referenceB64: string | null): Promise<{ buffer: Buffer; mime: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não definida");
  const parts: any[] = [{ text: prompt }];
  if (referenceB64) parts.push({ inlineData: { mimeType: "image/png", data: referenceB64 } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: genTimeout(120000),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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

async function pollinationsImage(prompt: string, referenceUrl: string | null, seed: number): Promise<{ buffer: Buffer; mime: string }> {
  const params = new URLSearchParams({
    width: "64",
    height: "64",
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
}

export interface SkillIconsResult {
  icon: string;
  iconSecondary: string;
}

export async function generateSkillIcons(input: SkillIconInput): Promise<SkillIconsResult> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome da skill é obrigatório");
  const kind = String(input.kind || "attack").toLowerCase();
  const description = String(input.description || "").trim();
  const slug = slugify(name);
  const seed = typeof input.seed === "number" ? input.seed : hashSeed(String(input.seed || name));
  const referenceUrl = typeof input.currentIcon === "string" && /^https?:\/\//i.test(input.currentIcon.trim()) ? input.currentIcon.trim() : null;

  const primary = buildPrompt({ name, kind, description, variant: "primary" });
  const secondary = buildPrompt({ name, kind, description, variant: "secondary" });

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

  const primaryResult = useGemini
    ? await geminiImage(primary, refB64)
    : await pollinationsImage(primary, referenceUrl, seed);
  const secondaryResult = useGemini
    ? await geminiImage(secondary, refB64)
    : await pollinationsImage(secondary, referenceUrl, seed + 1);

  const icon = await writeIcon(`ai-${slug}-${seed}`, primaryResult);
  const iconSecondary = await writeIcon(`ai-${slug}-${seed}-sec`, secondaryResult);

  return { icon, iconSecondary };
}