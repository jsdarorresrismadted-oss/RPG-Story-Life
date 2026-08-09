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
  "REGRAS DE ARTE: Pixel Art; fundo transparente; alta qualidade, pronto para uso em jogos; sem personagem, sem texto, sem interface, sem logotipos, sem molduras, sem sombra externa; objeto centralizado, apenas um item por imagem.",
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
    "Para o desenho: o fundo DEVE ser um unico tom chapado e uniforme (uma cor so, sem gradiente, sem cena, sem chao, sem nuvens, sem sombra no fundo) - o jogo remove o fundo depois.",
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
    '"artPrompt":"PROMPT DE ARTE EM INGLES, auto-contido, descrevendo o item com detalhes (formato, material, cor, ornamentos, iluminacao) e terminando com: pixel art icon, 64x64 game asset, flat solid uniform single-color background, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered, no character, no text, no UI, no logo, no frame, no external shadow, no aura, no glow, no magic particles, no sparks, no light rays, no fire or energy coming out of the item, item at rest, consistent style with the game other equipment (same detail level, same lighting, same outline, same pixel density)",',
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

// ===== 3) Pos-processamento: 64x64 + remover fundo (auto-detecta a cor da borda) =====
export async function postProcess(buf: Buffer): Promise<{ png: Buffer; removedPct: number }> {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (x: number, y: number): number => (y * w + x) * 4;

  // Cor de fundo = mediana dos pixels da borda (flux costuma escolher a cor sozinho)
  const borderChannels: number[][] = [];
  for (let x = 0; x < w; x++) {
    borderChannels.push([data[px(x, 0)], data[px(x, 0) + 1], data[px(x, 0) + 2]]);
    borderChannels.push([data[px(x, h - 1)], data[px(x, h - 1) + 1], data[px(x, h - 1) + 2]]);
  }
  for (let y = 1; y < h - 1; y++) {
    borderChannels.push([data[px(0, y)], data[px(0, y) + 1], data[px(0, y) + 2]]);
    borderChannels.push([data[px(w - 1, y)], data[px(w - 1, y) + 1], data[px(w - 1, y) + 2]]);
  }
  const median = (vals: number[]): number => {
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };
  const bgR = median(borderChannels.map((c) => c[0]));
  const bgG = median(borderChannels.map((c) => c[1]));
  const bgB = median(borderChannels.map((c) => c[2]));

  const dist = (x: number, y: number): number => {
    const i = px(x, y);
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // Flood fill a partir das bordas removendo pixels parecidos com o fundo.
  // Tolerancia adaptativa: item escuro em fundo escuro some com tol alta, e
  // fundo com gradiente fica com halo com tol baixa -> tenta varias e escolhe
  // a que remove entre 20% e 85% da imagem (prioriza a maior tol que caber).
  const floodRemove = (tol: number): number => {
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
  };

  const totalPx = w * h;
  let chosenTol = 110;
  let chosenCount = 0;
  for (const tol of [110, 70, 45]) {
    const count = floodRemove(tol);
    const pct = (count / totalPx) * 100;
    if (pct >= 20 && pct <= 85) {
      chosenTol = tol;
      chosenCount = count;
      break;
    }
    if (pct < 20) {
      chosenTol = tol;
      chosenCount = count;
      break;
    }
  }
  if (chosenCount === 0) {
    // nada foi removivel em nenhuma tol -> mantem como veio
    const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    return { png, removedPct: 0 };
  }
  if (chosenTol !== 110) {
    // refaz a remocao na tol escolhida partindo da imagem limpa
    const { data: fresh } = await sharp(buf)
      .resize(64, 64, { kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data.set(fresh);
    const count2 = floodRemove(chosenTol);
    chosenCount = count2 || chosenCount;
  }

  // Franja: pixel opaco vizinho a transparente e quase da cor do fundo
  const isFringe = (x: number, y: number): boolean => {
    const i = px(x, y);
    if (data[i + 3] === 0) return false;
    if (dist(x, y) >= chosenTol * 1.2) return false;
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (data[px(nx, ny) + 3] === 0) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isFringe(x, y)) data[px(x, y) + 3] = 0;
    }
  }

  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] === 0) removed++;
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { png, removedPct: (removed / (w * h)) * 100 };
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
  const png = await renderSprite(plan.artPrompt, seed);
  const { png: processed, removedPct } = await postProcess(png);
  const filename = "ai-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, processed);
  log.push("Groq (plano) + Pollinations (imagem)");
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
    "pixel art icon, 64x64 game asset, flat solid uniform single-color background, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered, no character, no text, no UI, no logo, no frame, no external shadow, no aura, no glow, no magic particles, no sparks, no light rays, no fire or energy coming out of the item, item at rest, consistent style with the game other equipment (same detail level, same lighting, same outline, same pixel density)";
  const seed = Math.floor(Number(input.seed) || (Date.now() % 1000000));
  const png = await renderSprite(artPrompt, seed);
  const { png: processed, removedPct } = await postProcess(png);
  const filename = "ai-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, processed);
  if (log) {
    log.push("Pollinations (imagem) - prompt direto");
    if (removedPct < 15) {
      log.push("Aviso: fundo pode nao ter sido removido (" + Math.round(removedPct) + "% da imagem) - gere de novo se quiser");
    }
  }
  return { icon, removedPct };
}