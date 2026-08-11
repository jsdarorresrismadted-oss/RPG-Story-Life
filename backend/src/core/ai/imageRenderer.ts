// ===== Renderizacao de imagens via IA (Gemini Flash-Lite Image com fallback Pollinations) =====
// - Gemini Flash-Lite Image gera pixel art rapido.
// - Pollinations.ai (flux, gratis) e o fallback: PNG ate 1024x1024.
// - QUALIDADE: rapido (2min), normal (3min), perfeito (5min).
// - O pos-processamento (chroma key magenta + resize 64x64) fica no itemGenerator.

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image";

export type QualityTier = "fast" | "normal" | "perfect";

export interface RenderResult {
  buf: Buffer;
  provider: "gemini" | "pollinations";
}

export interface RenderOptions {
  quality?: QualityTier;
  negativePrompt?: string;
  referenceImage?: Buffer;
}

const QUALITY_CONFIG: Record<QualityTier, { timeout: number; width: number; height: number; enhance: boolean }> = {
  fast:    { timeout: 120_000, width: 512,  height: 512,  enhance: false },
  normal:  { timeout: 180_000, width: 768,  height: 768,  enhance: true  },
  perfect: { timeout: 300_000, width: 1024, height: 1024, enhance: true  },
};

export function geminiImageAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

const NEGATIVE_PROMPT_BASE = [
  "person, character, human, face, body, portrait, portrait shot, selfie",
  "warrior, mage, knight, wizard, hero, villain, creature, monster",
  "blurry, low quality, deformed, ugly, cropped, out of frame",
  "text, watermark, logo, signature, frame, border",
  "background scene, floor, clouds, sky, landscape, room, wall",
  "duplicate, multiple items, two items",
].join(", ");

export function getNegativePrompt(extra?: string): string {
  return extra ? `${NEGATIVE_PROMPT_BASE}, ${extra}` : NEGATIVE_PROMPT_BASE;
}

export async function renderGeminiImage(prompt: string, seed?: number, timeout = 120000): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não definida");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`;
  const payload: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "1:1" },
    },
  };
  if (seed !== undefined) payload.generationConfig.seed = Math.floor(seed) % 99999;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as any;
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p?.inlineData?.data);
    if (!imagePart) throw new Error("Gemini: resposta sem imagem (inlineData ausente)");
    let b64 = String(imagePart.inlineData.data).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 100) throw new Error("Gemini: imagem vazia");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export async function renderPollinationsImage(
  prompt: string,
  seed: number,
  quality: QualityTier = "normal",
  negativePrompt?: string,
  referenceImage?: Buffer,
): Promise<Buffer> {
  const cfg = QUALITY_CONFIG[quality];

  const fullPrompt = cfg.enhance ? `${prompt}, masterpiece, best quality, highly detailed, sharp focus` : prompt;

  const params = new URLSearchParams({
    width: String(cfg.width),
    height: String(cfg.height),
    seed: String(seed),
    model: "flux",
    nologo: "true",
  });

  if (negativePrompt) params.set("negative", getNegativePrompt(negativePrompt));
  if (cfg.enhance) params.set("enhance", "true");

  // Se tem imagem de referencia, usa POST para img2img
  if (referenceImage && referenceImage.length > 0) {
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(fullPrompt)}?${params.toString()}`;
    const formData = new FormData();
    formData.append("image", new Blob([referenceImage], { type: "image/png" }), "reference.png");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Pollinations img2img HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error("Resposta de imagem vazia");
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }

  // Sem referencia: GET normal (txt2img)
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error("Pollinations HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("Resposta de imagem vazia");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// Renderiza a imagem: Gemini se houver key, senao Pollinations.
// Se Gemini falhar, tenta Pollinations como fallback.
export async function renderSprite(
  prompt: string,
  seed: number,
  options?: RenderOptions,
): Promise<RenderResult> {
  const quality = options?.quality || "normal";
  const negative = options?.negativePrompt;
  const reference = options?.referenceImage;
  const cfg = QUALITY_CONFIG[quality];

  if (process.env.GEMINI_API_KEY) {
    try {
      const buf = await renderGeminiImage(prompt, seed, cfg.timeout);
      return { buf, provider: "gemini" };
    } catch {
      // fallback abaixo
    }
  }
  const buf = await renderPollinationsImage(prompt, seed, quality, negative, reference);
  return { buf, provider: "pollinations" };
}
