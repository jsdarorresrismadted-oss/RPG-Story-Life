import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// ===== Gerador de arte de skills via IA (imagem) =====
// Usa Gemini Image (GEMINI_IMAGE_MODEL) quando GEMINI_API_KEY existe,
// com fallback para OpenAI (gpt-image-1) quando OPENAI_API_KEY existe.
// GeraÃ§Ã£o em LOTE: TODOS os Ã­cones de uma classe em UMA Ãºnica imagem
// (1 chamada de IA) e recorta cada cÃ©lula â€” evita estourar o limite
// diÃ¡rio da Gemini. Cada classe = 1 chamada de IA para os 5 Ã­cones.

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const SKILL_DIR = path.resolve(__dirname, "../../../../frontend/public/iconskill");
const ICON_URL_PREFIX = "/iconskill";

const STYLE_TAG =
  "Premium fantasy RPG skill icon for a video game, polished professional game ability artwork, stylized fantasy game UI aesthetic, designed specifically for 64x64 pixel interface, extremely readable at small size, strong recognizable silhouette, single dominant central subject occupying most of the frame, compact composition, large clear shapes, dynamic action, dramatic lighting, strong depth and dimensionality, clean sharp edges, controlled details, detailed but not cluttered, powerful visual impact, cohesive professional game icon design, consistent visual language, isolated subject, transparent background, no scenery, no landscape, no character portrait, no full body character unless specifically required, no text, no letters, no numbers, no logo, no watermark, no UI elements, no excessive tiny particles, no blurry details";

// Identidade visual por classe: a classe define tema/cores, a skill define o desenho.
const CLASS_IDENTITIES: { match: RegExp; identity: string; colors: string }[] = [
  {
    match: /assassin|assassino|rogue|sombras|shadow|senhor/i,
    identity: "assassin visual identity: stealth, darkness, speed, lethal precision, dark smoke, sharp motion",
    colors: "class color identity: deep violet, crimson and black",
  },
  {
    match: /guard|guardi|warrior|guerreiro|cavaleiro|knight|tank|bronze/i,
    identity: "heavy weapon and armor visual identity: impact, defense, powerful strike, shockwave",
    colors: "class color identity: steel blue, silver and gold",
  },
  {
    match: /mage|mago|wizard|arcan|elemental/i,
    identity: "mage visual identity: arcane energy, magical runes, elemental power, mystical aura, spell energy",
    colors: "class color identity: arcane blue, violet and cyan",
  },
  {
    match: /support|suporte|healer|cleric|priest|paladin|protetor/i,
    identity: "support visual identity: healing energy, protective aura, radiant energy, magical barrier, restoration",
    colors: "class color identity: white, gold and light blue",
  },
  {
    match: /berserk|barbaro|barbarian|selvagem|feral/i,
    identity: "berserker visual identity: raw fury, primal power, brutal impact, blood energy",
    colors: "class color identity: dark red, ember orange and iron",
  },
];

function classVisualIdentity(cls: string | undefined): { identity: string; colors: string } {
  const name = String(cls || "").toLowerCase();
  for (const c of CLASS_IDENTITIES) {
    if (c.match.test(name)) return { identity: c.identity, colors: c.colors };
  }
  return {
    identity: "fantasy RPG visual identity: heroic energy, balanced power, legendary presence",
    colors: "class color identity: deep blue, purple and gold",
  };
}

const KIND_THEMES: Record<string, string> = {
  attack: "MAIN OBJECT: a large weapon or spell blade performing a bold slash, thick branching energy arcs around it",
  heal: "MAIN OBJECT: a radiant glowing sphere of light with large magical runes and a protective halo",
  buff: "MAIN OBJECT: a golden aura crest with rising bold flame-like energy",
  debuff: "MAIN OBJECT: a cursed sigil with large swirling toxic green and purple mist",
  summon: "MAIN OBJECT: a glowing portal with a bold rune circle",
  mobility: "MAIN OBJECT: a sweeping wind trail with large speed lines and momentum",
  control: "MAIN OBJECT: thick glowing chains wrapping a magical seal",
  defense: "MAIN OBJECT: a sturdy magical shield with a stone barrier and strong protective aura",
  channel: "MAIN OBJECT: a concentrated magical beam with large radiating energy rings",
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
  if (!key) throw new Error("GEMINI_API_KEY nÃ£o definida");
  const parts: any[] = [{ text: prompt }];
  if (referenceB64) parts.push({ inlineData: { mimeType: "image/png", data: referenceB64 } });
  const generationConfig: any = { responseModalities: ["TEXT", "IMAGE"] };
  // Em lote (N Ã­cones empilhados): imagem vertical para cada cÃ©lula sair quadrada.
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
    throw new Error(text ? `Gemini Image nÃ£o retornou imagem: ${text.slice(0, 150)}` : "Gemini Image: resposta vazia");
  }
  const mime = String(imagePart.inlineData.mimeType || "image/png");
  return { buffer: Buffer.from(imagePart.inlineData.data, "base64"), mime };
}

// OpenAI (gpt-image-1 â€” o gerador de imagens do ChatGPT). Sem env key a funÃ§Ã£o
// Ã© pulada; o fallback segue para o prÃ³ximo provedor.
async function openaiImage(prompt: string, portrait = false): Promise<{ buffer: Buffer; mime: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY nÃ£o definida");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal: genTimeout(120000),
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: portrait ? "1024x1536" : "1024x1024",
      output_format: "png",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI Image HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    const url = data?.data?.[0]?.url;
    if (url) {
      const imgRes = await fetch(url, { signal: genTimeout(60000) });
      if (imgRes.ok) return { buffer: Buffer.from(await imgRes.arrayBuffer()), mime: imgRes.headers.get("content-type") || "image/png" };
    }
    throw new Error("OpenAI Image: resposta sem imagem");
  }
  return { buffer: Buffer.from(b64, "base64"), mime: "image/png" };
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

function buildBatchPrompt(inputs: SkillIconInput[]): string {
  const baseIdentity = classVisualIdentity(inputs[0]?.class);
  const lines = inputs.map((inp, i) => {
    const theme = KIND_THEMES[String(inp.kind || "attack").toLowerCase()] || KIND_THEMES.attack;
    const effect = inp.description
      ? ` LARGE swirling effect inspired by: "${inp.description}".`
      : "";
    const rarity =
      inp.rarity && ["common", "uncommon", "rare", "epic", "legendary"].includes(String(inp.rarity).toLowerCase())
        ? ` Power level ${String(inp.rarity).toLowerCase()}: the higher the power, the brighter the glow and the richer the detail (single main object, one dominant effect, one secondary effect).`
        : "";
    return `${i + 1}. Class: ${String(inp.class || "unknown").slice(0, 40)}. Skill: "${inp.name}" (kind: ${inp.kind || "attack"}). ${theme}.${effect}${rarity}`;
  });
  const identity = classVisualIdentity(inputs[0]?.class);
  return (
    `Create a SINGLE image containing exactly ${inputs.length} skill icons of a video game, ` +
    `arranged in one vertical column, top to bottom, in this exact order, each occupying its own equal square cell with no gaps, borders or numbers:\n${lines.join("\n")}\n\n` +
    `Rules for every icon: the skill NAME defines the main drawing; the skill EFFECT defines what appears around it; the CLASS defines the visual identity (${baseIdentity.identity}; ${baseIdentity.colors}) — do not draw full characters, focus entirely on the skill effect and weapon. ` +
    `Each skill must have its own instantly recognizable silhouette, and all icons must share the SAME visual language: same composition, same level of detail, same lighting, same subject scale, same RPG aesthetic (${identity.colors}). ` +
    `${STYLE_TAG}`
  );
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

// Gera N Ã­cones em UMA Ãºnica chamada de IA (Gemini ou OpenAI) e recorta.
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

  // Fallback em cadeia: Gemini â†’ OpenAI (ChatGPT).
  // Se o provedor principal falhar (quota 429, erro), o prÃ³ximo assume.
  const providers: { name: string; run: () => Promise<{ buffer: Buffer; mime: string }> }[] = [];
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_IMAGE_MODEL) {
    providers.push({
      name: "Gemini",
      run: async () => {
        const refB64 = await firstReferenceB64(list);
        return geminiImage(prompt, refB64, true);
      },
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: "OpenAI", run: () => openaiImage(prompt, true) });
  }

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

async function firstReferenceB64(inputs: SkillIconInput[]): Promise<string | null> {
  for (const inp of inputs) {
    const url = typeof inp.currentIcon === "string" && /^https?:\/\//i.test(inp.currentIcon.trim()) ? inp.currentIcon.trim() : null;
    if (!url) continue;
    try {
      const r = await fetch(url, { signal: genTimeout(20000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer()).toString("base64");
    } catch {
      // segue sem referÃªncia
    }
  }
  return null;
}

export async function generateSkillIcons(input: SkillIconInput): Promise<{ icon: string }> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome da skill Ã© obrigatÃ³rio");
  const kind = String(input.kind || "attack").toLowerCase();
  const description = String(input.description || "").trim();
  const slug = slugify(name);
  const seed = typeof input.seed === "number" ? input.seed : hashSeed(String(input.seed || name));
  const referenceUrl = typeof input.currentIcon === "string" && /^https?:\/\//i.test(input.currentIcon.trim()) ? input.currentIcon.trim() : null;

  const prompt = buildBatchPrompt([{ ...input, key: slug }]);

// Fallback em cadeia: Gemini â†’ OpenAI (ChatGPT).
  const providers: { name: string; run: () => Promise<{ buffer: Buffer; mime: string }> }[] = [];
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_IMAGE_MODEL) {
    providers.push({
      name: "Gemini",
      run: async () => {
        let refB64: string | null = null;
        if (referenceUrl) {
          try {
            const r = await fetch(referenceUrl, { signal: genTimeout(20000) });
            if (r.ok) refB64 = Buffer.from(await r.arrayBuffer()).toString("base64");
          } catch {
            refB64 = null;
          }
        }
        return geminiImage(prompt, refB64);
      },
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: "OpenAI", run: () => openaiImage(prompt, false) });
  }

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
