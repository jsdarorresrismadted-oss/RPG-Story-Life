// ===== Renderizacao de imagens via IA (Gemini 2.5 Flash Image com fallback Pollinations) =====
// - Gemini 2.5 Flash Image gera imagens em alta qualidade (sem key de graca nao).
//   Usa a API REST generateContent com responseModalities IMAGE e devolve PNG base64.
// - Pollinations.ai (flux, gratis) e o fallback: PNG 512x512.
// - O pos-processamento (chroma key magenta + resize 64x64) fica no itemGenerator.

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export interface RenderResult {
  buf: Buffer;
  provider: "gemini" | "pollinations";
}

export function geminiImageAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function renderGeminiImage(prompt: string, seed?: number): Promise<Buffer> {
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
  const timer = setTimeout(() => controller.abort(), 120000);
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

export async function renderPollinationsImage(prompt: string, seed: number): Promise<Buffer> {
  const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=512&height=512&seed=" + seed + "&model=flux&nologo=true";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
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

// Renderiza a imagem: Gemini se houver key, senão Pollinations. Se Gemini falhar,
// tenta Pollinations como fallback (sempre que possível).
export async function renderSprite(prompt: string, seed: number): Promise<RenderResult> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const buf = await renderGeminiImage(prompt, seed);
      return { buf, provider: "gemini" };
    } catch {
      // fallback abaixo
    }
  }
  const buf = await renderPollinationsImage(prompt, seed);
  return { buf, provider: "pollinations" };
}
