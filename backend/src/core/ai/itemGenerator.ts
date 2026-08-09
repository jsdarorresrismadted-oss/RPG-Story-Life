import fs from "fs";
import path from "path";
import sharp from "sharp";
import { AppError } from "../middleware/errorHandler";

// ===== Gerador de equipamentos (icones pixel art 64x64) via IA =====
// - Groq (llama-3.3-70b) PLANEJA: nome, descricao, prompt de arte, atributos e precos.
// - Pollinations.ai (gratis, sem key) RENDERIZA o PNG 512x512.
// - sharp pos-processa: resize 64x64 (nearest) + chroma-key (magenta -> transparente).
// - Icone salvo em Icons/64x64/<categoria>/ e espelhado em frontend/public/icons
//   + manifest.json atualizado (picker de icones do admin e do jogo).

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const CATEGORY_BY_TYPE: Record<string, string> = {
  weapon: "Armas",
  helm: "Elmo",
  armor: "Armaduras",
  cape: "Capas",
  ring: "Aneis",
  necklace: "Colares",
};

const TYPE_PT: Record<string, string> = {
  weapon: "arma",
  helm: "elmo",
  armor: "armadura",
  cape: "capa",
  ring: "anel",
  necklace: "colar",
};

const SLOT_RULES: Record<string, string> = {
  weapon: "Apenas a arma. Sem personagem segurando.",
  helm: "Apenas o elmo. Feito para encaixar em um avatar humano 64x64 (o avatar nao aparece).",
  armor: "A armadura deve cobrir tronco, ombros e bracos. Feita para ser usada SOBRE um avatar humano 64x64 (o avatar nao aparece).",
  cape: "Apenas a capa, vista de frente, feita para ficar atras do personagem.",
  ring: "Anel visto de frente, icone altamente detalhado.",
  necklace: "Colar visto de frente, icone altamente detalhado.",
};

const RARITY_PT: Record<string, string> = {
  common: "comum",
  uncommon: "incomum",
  rare: "raro",
  epic: "epico",
  legendary: "lendario",
  mythic: "mitico",
};
const VALID_RARITIES = Object.keys(RARITY_PT);
const RARITY_MULT: Record<string, number> = { common: 1, uncommon: 1.6, rare: 2.6, epic: 4.5, legendary: 8, mythic: 14 };

const MASTER_RULES = [
  "Voce e um artista profissional especializado em criar equipamentos para jogos RPG. Sua funcao e criar apenas assets de jogo, nunca ilustracoes.",
  "Todos os equipamentos devem seguir exatamente o mesmo estilo visual.",
  "REGRAS DE ARTE: Pixel Art; o fundo DEVE ser um magenta solido e brilhante (#FF00FF), cor chapada e uniforme, sem gradiente, sem cena, sem chao, sem nuvens, nada atras do item; o item deve ser centralizado e preencher 80-90% do quadro, pronto para uso em jogos; sem personagem, sem texto, sem interface, sem logotipos, sem molduras, sem sombra externa, apenas um item por imagem.",
  "SEM EFEITOS MAGICOS: sem aura, sem brilho/glow ao redor do item, sem particulas, sem faiscas, sem raios de luz, sem chamas ou energia saindo do item — o item em repouso, como seria exibido em uma loja ou inventario.",
  "Mesmo nivel de detalhamento, mesma iluminacao, mesmo tipo de contorno, mesma densidade de pixels, mesmo estilo artistico, mesmo padrao de cores e mesmo nivel de qualidade dos equipamentos anteriores.",
  "O jogador nunca deve perceber diferenca entre um item antigo e um item criado agora.",
  "COMPATIBILIDADE: os equipamentos serao usados por um sistema de avatar modular 64x64 (personagens masculinos e femininos).",
].join("\n");

export interface ItemPlan {
  name: string;
  description: string;
  subtype: string;
  artPrompt: string;
  stats: Record<string, number>;
  attackSpeedMs?: number; // apenas armas
  dps?: number; // apenas armas
  buyPrice: number;
  sellPrice: number;
}

interface PlanInput {
  type: string;
  theme?: string;
  material?: string;
  color?: string;
  rarity: string;
  level: number;
}

// ===== 1) Planejamento via Groq =====
async function planItem(input: PlanInput): Promise<ItemPlan> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AppError(503, "GROQ_API_KEY nao definida - o gerador de itens precisa dela (variavel do Railway)");

  const auto = !input.theme && !input.material && !input.color;
  const userPrompt = [
    "Crie um novo equipamento para o RPG.",
    "Tipo: " + TYPE_PT[input.type] + " (" + input.type + ")",
    "Raridade: " + RARITY_PT[input.rarity] + " (" + input.rarity + ")",
    "Nivel: " + input.level,
    input.theme ? "Tema: " + input.theme : "",
    input.material ? "Material: " + input.material : "",
    input.color ? "Cor principal: " + input.color : "",
    auto ? "Escolha voce mesmo nome, tema, material, cor, estilo, formato, design e ornamentos. O equipamento deve parecer unico, sem copiar itens famosos, respeitando a raridade informada." : "",
    "",
    "Regra do slot (respeite fielmente):",
    SLOT_RULES[input.type],
    "",
    "Para o desenho: o fundo DEVE ser um magenta solido e brilhante (#FF00FF), um unico tom chapado e uniforme (sem gradiente, sem cena, sem chao, sem nuvens) - o jogo remove esse magenta depois. O item deve ficar centralizado e preencher 80-90% do quadro.",
    "",
    "ATRIBUTOS (stats): TODOS os equipamentos (arma, elmo, armadura, capa, anel, colar) fornecem os 6 atributos — TODOS acima de zero. O atributo principal do tipo recebe o maior valor:",
    "- arma fisica (sword/dagger/axe): strength e dexterity altos; arma magica (staff/tome): intellect e wisdom altos",
    "- elmo e armadura: endurance e dexterity altos",
    "- capa: wisdom e luck altos",
    "- anel e colar: luck alto + um secundario",
    "Os 4 atributos restantes recebem valores menores (20-60% do principal), mas NUNCA zero. Valores inteiros, proporcionais ao nivel (base ~1.2 x nivel) e a raridade (multiplicador " + RARITY_MULT[input.rarity] + "x), entre 1 e 200.",
    "",
    "ARMAS: inclua tambem attackSpeedMs (500 a 2600, velocidade de ataque em milissegundos — mais rapido = melhor) e dps (dano por segundo, proporcional ao nivel e raridade, entre 1 e 100000).",
    "",
    "PRECOS: buyPrice entre 50 e 500000, sellPrice = ~20% do buyPrice, coerentes com nivel e raridade.",
    "",
    "Responda SOMENTE com JSON valido neste formato:",
    '{"name":"Nome em portugues, curto e fantastico",',
    '"description":"1-2 frases em portugues descrevendo visual e lendinha",',
    '"subtype":"um de: sword, dagger, staff, axe, tome, bow (arma) | cap, helmet, crown, hood (elmo) | light, heavy, robe (armadura) | vazio para capa/anel/colar",',
    '"artPrompt":"PROMPT DE ARTE EM INGLES, auto-contido, descrevendo o item com detalhes (formato, material, cor, ornamentos, iluminacao) e terminando com: pixel art icon, 64x64 game asset, solid flat bright magenta (#FF00FF) background, uniform single color, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered and filling most of the frame (80-90% of the canvas), no character, no text, no UI, no logo, no frame, no external shadow, no aura, no glow, no magic particles, no sparks, no light rays, no fire or energy coming out of the item, item at rest, consistent style with the game other equipment (same detail level, same lighting, same outline, same pixel density)",',
    '"stats":{"strength":0,"intellect":0,"endurance":0,"dexterity":0,"wisdom":0,"luck":0},',
    '"attackSpeedMs":0,"dps":0,"buyPrice":0,"sellPrice":0}',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: MASTER_RULES + "\nVoce gera JSON valido seguindo o contrato do usuario. Responda SOMENTE com o JSON." },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError(502, "Groq HTTP " + res.status + ": " + body.slice(0, 200));
  }
  const data = (await res.json()) as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new AppError(502, "Groq: resposta vazia");

  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    raw = JSON.parse(text.slice(start, end + 1));
  }
  if (!raw || !raw.name || !raw.artPrompt) throw new AppError(502, "Groq: JSON invalido (name/artPrompt ausentes)");

  const STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];
  const stats: Record<string, number> = {};
  for (const k of STAT_KEYS) {
    const v = Number(raw.stats?.[k]) || 0;
    stats[k] = Math.max(1, Math.min(200, Math.round(v)));
  }
  const isWeapon = input.type === "weapon";
  return {
    name: String(raw.name).slice(0, 60),
    description: String(raw.description || "").slice(0, 300),
    subtype: String(raw.subtype || "").slice(0, 20),
    artPrompt: String(raw.artPrompt).slice(0, 1200),
    stats,
    attackSpeedMs: isWeapon ? Math.max(500, Math.min(2600, Math.round(Number(raw.attackSpeedMs) || 2000))) : 0,
    dps: isWeapon ? Math.max(0, Math.round(Number(raw.dps) || 0)) : 0,
    buyPrice: Math.max(0, Math.round(Number(raw.buyPrice) || 0)),
    sellPrice: Math.max(0, Math.round(Number(raw.sellPrice) || 0)),
  };
}

// ===== 2) Renderizacao via Pollinations.ai (flux, gratis) =====
async function renderSprite(artPrompt: string, seed: number): Promise<Buffer> {
  const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(artPrompt) + "?width=512&height=512&seed=" + seed + "&model=flux&nologo=true";
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

// ===== 3) Pos-processamento de alta qualidade =====
// - O prompt pede fundo magenta #FF00FF: aqui detectamos se o fundo realmente e
//   magenta e removemos por chroma key (fallback: flood fill antigo).
// - O recorte (bbox) do item acontece ANTES de reduzir para 64x64, deixando o
//   item grande e nitido (antes reduziamos a 64 primeiro e o item ficava minúsculo).
const MAGENTA = { r: 255, g: 0, b: 255 };

function colorDist(r: number, g: number, b: number, ref: { r: number; g: number; b: number }): number {
  const dr = r - ref.r;
  const dg = g - ref.g;
  const db = b - ref.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleBgColor(data: Buffer, w: number, h: number): { r: number; g: number; b: number } {
  const border: number[][] = [];
  const px = (x: number, y: number): number => (y * w + x) * 4;
  for (let x = 0; x < w; x++) {
    border.push([data[px(x, 0)], data[px(x, 0) + 1], data[px(x, 0) + 2]]);
    border.push([data[px(x, h - 1)], data[px(x, h - 1) + 1], data[px(x, h - 1) + 2]]);
  }
  for (let y = 1; y < h - 1; y++) {
    border.push([data[px(0, y)], data[px(0, y) + 1], data[px(0, y) + 2]]);
    border.push([data[px(w - 1, y)], data[px(w - 1, y) + 1], data[px(w - 1, y) + 2]]);
  }
  const median = (vals: number[]): number => {
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };
  return {
    r: median(border.map((c) => c[0])),
    g: median(border.map((c) => c[1])),
    b: median(border.map((c) => c[2])),
  };
}

function chromaRemove(data: Buffer, w: number, h: number, ref: { r: number; g: number; b: number }, tol: number): number {
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (colorDist(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], ref) < tol) {
      data[i * 4 + 3] = 0;
      count++;
    }
  }
  return count;
}

function floodRemove(data: Buffer, w: number, h: number, ref: { r: number; g: number; b: number }, tol: number): number {
  const dist = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    return colorDist(data[i], data[i + 1], data[i + 2], ref);
  };
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (!visited[idx] && dist(x, y) < tol) {
      visited[idx] = 1;
      queue.push(idx);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  let count = 0;
  while (queue.length > 0) {
    const idx = queue.pop() as number;
    data[idx * 4 + 3] = 0;
    count++;
    const x = idx % w;
    const y = Math.floor(idx / w);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return count;
}

function fringeClean(data: Buffer, w: number, h: number, ref: { r: number; g: number; b: number }, tol: number): void {
  const dist = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    return colorDist(data[i], data[i + 1], data[i + 2], ref);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      if (dist(x, y) >= tol * 1.3) continue;
      let touching = false;
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (data[(ny * w + nx) * 4 + 3] === 0) {
          touching = true;
          break;
        }
      }
      if (touching) data[i + 3] = 0;
    }
  }
}

// Recorta o bbox dos pixels opacos, adiciona uma pequena margem e redimensiona
// para o tamanho final. Retorna o PNG e a cobertura (quanto do quadro o item ocupava).
async function cropAndResize(data: Buffer, w: number, h: number, size: number): Promise<{ png: Buffer; coverage: number }> {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        opaque++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const coverage = (opaque / (w * h)) * 100;
  if (maxX < 0 || maxY < 0) {
    const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).resize(size, size, { kernel: "nearest" }).png().toBuffer();
    return { png, coverage: 100 };
  }
  const pad = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(w - 1, maxX + pad);
  const bottom = Math.min(h - 1, maxY + pad);
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(size, size, { kernel: "nearest" })
    .png()
    .toBuffer();
  return { png, coverage };
}

interface ProcessedSprite {
  png: Buffer;
  removedPct: number;
  coverage: number;
}

async function processSprite(buf: Buffer): Promise<ProcessedSprite> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const totalPx = w * h;
  const bg = sampleBgColor(data, w, h);
  const bgIsMagenta = colorDist(bg.r, bg.g, bg.b, MAGENTA) < 200;

  let work = Buffer.from(data);
  let removed = 0;
  let fringeTol = 110;
  if (bgIsMagenta) {
    let bestTol = 90;
    for (const tol of [200, 160, 120, 90]) {
      const copy = Buffer.from(data);
      const count = chromaRemove(copy, w, h, MAGENTA, tol);
      const pct = (count / totalPx) * 100;
      if (pct >= 20 && pct <= 85) {
        bestTol = tol;
        break;
      }
      if (pct >= 15) bestTol = tol;
    }
    work = Buffer.from(data);
    removed = chromaRemove(work, w, h, MAGENTA, bestTol);
    fringeTol = Math.max(60, bestTol * 1.1);
  } else {
    let bestTol = 45;
    for (const tol of [110, 70, 45]) {
      const copy = Buffer.from(data);
      const count = floodRemove(copy, w, h, bg, tol);
      const pct = (count / totalPx) * 100;
      if (pct >= 20 && pct <= 85) {
        bestTol = tol;
        break;
      }
      if (pct < 20) bestTol = tol;
    }
    work = Buffer.from(data);
    removed = floodRemove(work, w, h, bg, bestTol);
    fringeTol = bestTol;
  }
  fringeClean(work, w, h, bgIsMagenta ? MAGENTA : bg, fringeTol);
  const removedPct = (removed / totalPx) * 100;
  const { png, coverage } = await cropAndResize(work, w, h, 64);
  return { png, removedPct, coverage };
}

// Gera N candidatos e escolhe o melhor (fundo bem removido + item de bom tamanho).
async function renderBestSprite(artPrompt: string, seed: number, attempts: number): Promise<{ png: Buffer; removedPct: number; coverage: number; tried: number }> {
  const seeds = Array.from({ length: attempts }, (_, i) => seed + i);
  const results = await Promise.allSettled(seeds.map((s) => renderSprite(artPrompt, s).then(processSprite)));
  let best: ProcessedSprite | null = null;
  let bestScore = -Infinity;
  let tried = 0;
  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    tried++;
    const s = res.value;
    let score = -1;
    if (s.removedPct >= 20 && s.removedPct <= 85) {
      score = 1 - Math.abs(s.coverage - 50) / 100;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best) {
    const buf = await renderSprite(artPrompt, seed);
    const { png } = await processSprite(buf);
    return { png, removedPct: 0, coverage: 0, tried };
  }
  return { png: best.png, removedPct: best.removedPct, coverage: best.coverage, tried };
}

// ===== 4) Pos-processamento publico (mantido para compatibilidade) =====
export async function postProcess(buf: Buffer): Promise<{ png: Buffer; removedPct: number }> {
  const { png, removedPct } = await processSprite(buf);
  return { png, removedPct };
}

// ===== 4) Salvamento em Icons + mirror em frontend/public/icons + manifest =====
export const ICONS_ROOT = path.resolve(__dirname, "../../../../Icons");
const PUBLIC_ICONS_ROOT = path.resolve(__dirname, "../../../../frontend/public/icons");

function scanManifest(base: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const dir = path.join(base, "64x64");
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const files = fs
      .readdirSync(path.join(dir, entry.name))
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .sort();
    if (files.length > 0) out[entry.name] = files;
  }
  return out;
}

export function syncManifestFiles(): void {
  fs.mkdirSync(ICONS_ROOT, { recursive: true });
  fs.writeFileSync(path.join(ICONS_ROOT, "manifest.json"), JSON.stringify(scanManifest(ICONS_ROOT)));
  if (fs.existsSync(PUBLIC_ICONS_ROOT)) {
    fs.writeFileSync(path.join(PUBLIC_ICONS_ROOT, "manifest.json"), JSON.stringify(scanManifest(PUBLIC_ICONS_ROOT)));
  }
}

export async function saveGeneratedIcon(category: string, filename: string, png: Buffer): Promise<string> {
  const rel = path.join("64x64", category, filename);
  const target = path.join(ICONS_ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, png);
  const pubTarget = path.join(PUBLIC_ICONS_ROOT, rel);
  fs.mkdirSync(path.dirname(pubTarget), { recursive: true });
  fs.writeFileSync(pubTarget, png);
  syncManifestFiles();
  return "/icons/" + rel.split(path.sep).join("/");
}

// ===== Orquestrador =====
export interface GenerateItemInput {
  type: string;
  theme?: string;
  material?: string;
  color?: string;
  rarity?: string;
  level?: number;
  seed?: number;
  variants?: number;
}

export interface GeneratedItem {
  icon: string;
  plan: ItemPlan;
}

export async function generateItemSprite(input: GenerateItemInput, log: string[]): Promise<GeneratedItem> {
  const type = input.type;
  if (!CATEGORY_BY_TYPE[type]) throw new AppError(400, "Tipo invalido: " + type);
  const rarity = VALID_RARITIES.includes(String(input.rarity || "")) ? String(input.rarity) : "common";
  const level = Math.max(1, Math.min(100, Number(input.level) || 1));
  const plan = await planItem({ type, theme: input.theme, material: input.material, color: input.color, rarity, level });
  const seed = Math.floor(Number(input.seed) || Date.now() % 1000000);
  const attempts = Math.max(1, Math.min(3, Number(input.variants) || 3));
  const { png: processed, removedPct, tried } = await renderBestSprite(plan.artPrompt, seed, attempts);
  const filename = "ai-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, processed);
  log.push("Groq (plano) + Pollinations (imagem) - " + tried + " candidato(s)");
  if (removedPct < 15) {
    log.push("Aviso: fundo pode nao ter sido removido (" + Math.round(removedPct) + "% da imagem) - gere de novo se quiser");
  }
  return { icon, plan };
}

// ===== 5) Icone APENAS para item existente (sem replanejar stats/nome) =====
// Usado na regeneracao em lote: mantem nome/raridade/slot do item atual e
// desenha um icone novo com o estilo "sem aura" padronizado do jogo.
export interface IconSeedInput {
  name: string;
  type: string;
  rarity?: string;
  description?: string;
  seed?: number;
}

export async function generateItemIcon(input: IconSeedInput, log?: string[]): Promise<{ icon: string; removedPct: number }> {
  const type = input.type;
  if (!CATEGORY_BY_TYPE[type]) throw new AppError(400, "Tipo invalido: " + type);
  const rarity = VALID_RARITIES.includes(String(input.rarity || "")) ? String(input.rarity) : "common";
  const slotRule = SLOT_RULES[type] || "";
  const artPrompt =
    `A pixel art icon for an RPG ${TYPE_PT[type]} equipment item named "${input.name}" (rarity: ${RARITY_PT[rarity]}). ` +
    `${slotRule} ` +
    (input.description ? `Item description: ${input.description}. ` : "") +
    "pixel art icon, 64x64 game asset, solid flat bright magenta (#FF00FF) background, uniform single color, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered and filling most of the frame (80-90% of the canvas), no character, no text, no UI, no logo, no frame, no external shadow, no aura, no glow, no magic particles, no sparks, no light rays, no fire or energy coming out of the item, item at rest, consistent style with the game other equipment (same detail level, same lighting, same outline, same pixel density)";
  const seed = Math.floor(Number(input.seed) || (Date.now() % 1000000));
  const attempts = 3;
  const { png: processed, removedPct, tried } = await renderBestSprite(artPrompt, seed, attempts);
  const filename = "ai-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, processed);
  if (log) {
    log.push("Pollinations (imagem) - " + tried + " candidato(s)");
    if (removedPct < 15) {
      log.push("Aviso: fundo pode nao ter sido removido (" + Math.round(removedPct) + "% da imagem) - gere de novo se quiser");
    }
  }
  return { icon, removedPct };
}