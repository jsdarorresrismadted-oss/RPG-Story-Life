import fs from "fs";
import path from "path";
import sharp from "sharp";
import { AppError } from "../middleware/errorHandler";
import { renderItemIcon, Palette } from "./pixelArt";
import { renderSprite, QualityTier } from "./imageRenderer";
import { extractReferencePalette } from "./referencePalette";
import { enhancePixelArt } from "./enhancePixelArt";
import {
  extractWeaponsFromSheet,
  saveWeaponCache,
  loadWeaponCache,
  pickRandomWeapon,
  recolorWeapon,
  resizeWeapon,
  THEME_PALETTES,
} from "./weaponLibrary";

// ===== Gerador de equipamentos (icones pixel art 64x64) =====
// - IA LOCAL (plano deterministico) gera: nome, descricao, atributos e precos.
//   (Groq opcional via GROQ_PLANNER=on quando o usuario quiser nomes por LLM.)
// - pixelArt.ts RENDERIZA o PNG de forma procedural e deterministica (sem IA de imagem).
// - Icone salvo em Icons/64x64/<categoria>/ e espelhado em frontend/public/icons
//   + manifest.json atualizado (picker de icones do admin e do jogo).

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const CATEGORY_BY_TYPE: Record<string, string> = {
  weapon: "Armas",
  helm: "Elmo",
  armor: "Armaduras",
  cape: "Capas",
};

const TYPE_PT: Record<string, string> = {
  weapon: "arma",
  helm: "elmo",
  armor: "armadura",
  cape: "capa",
};

const SLOT_RULES: Record<string, string> = {
  weapon: "Apenas a arma. Sem personagem segurando.",
  helm: "Apenas o elmo. Feito para encaixar em um avatar humano 64x64 (o avatar nao aparece).",
  armor: "A armadura deve cobrir tronco, ombros e bracos. Feita para ser usada SOBRE um avatar humano 64x64 (o avatar nao aparece).",
  cape: "Apenas a capa, vista de frente, feita para ficar atras do personagem.",
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
  "REGRAS ABSOLUTAS - NUNCA VIOLA:",
  "1) NUNCA gere PERSONAGENS, HUMANOS, ROSTOS, CORPOS, SILHUETAS HUMANAS. APENAS ITENS/ARMAS/ equipamentos soltos.",
  "2) O item e um OBJETO isolado, como seria exibido em um inventario de jogo. NAO ha ninguem segurando ou usando.",
  "3) Fundo MAGENTA SOLIDO (#FF00FF) para remocao por chroma key.",
  "",
  "ESTILO: Pixel Art detalhado, fantasy medieval.",
  "DETALHAMENTO: Cada item DEVE ter: formato distinctivo, sombreamento com 3+ tons, brilhos especulares em metal/gemas.",
  "EFEITOS VISUAIS: Pode incluir chamas, gelo, raios, aura, particulas luminosas. O item deve parecer PODEROSO.",
  "ILUMINACAO: Fonte de luz de cima-esquerda, sombras consistentes, reflexos metalicos.",
  "RARIDADE: Comuns sao simples. Lendarios/miticos devem ser ESPECTACULARES com efeitos e ornamentos.",
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
    '"artPrompt":"PROMPT DE ARTE EM INGLES, auto-contido, descrevendo o item com detalhes VISUAIS RICOS: formato da lamina/escudo/elmo, material e textura, ornamentos (asas, garras, gemas, espirais), efeitos magicos (chamas, gelo, raios, aura, particulas de energia), iluminacao e sombreamento. O prompt DEVE terminar com: pixel art icon, 64x64 game asset, solid flat bright magenta (#FF00FF) background, uniform single color, no gradient, no scene, no floor, no clouds, nothing behind the item, single item centered and filling most of the frame (80-90% of the canvas), no character, no text, no UI, no logo, no frame, no external shadow, item at rest, highly detailed fantasy RPG equipment style",',
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

// ===== 1b) Planejamento LOCAL (deterministico, sem API externa) =====
// Gera nome, descricao, stats, precos e arte a partir de tabelas + seed.
// Garante os mesmos contratos do plano via Groq (mesmos campos do ItemPlan).

const STRENGTH_NAMES: Record<string, string[]> = {
  weapon: ["Lamina", "Furia", "Presagio", "Dente", "Vedamen", "Cinto", "Horizonte", "Eco", "Firma", "Estilhaço", "Gume", "Julgamento"],
  helm: ["Elmo", "Capacete", "Coroa", "Aureola", "Viseira", "Fronte", "Sentinela", "Cume"],
  armor: ["Couraça", "Malha", "Peito", "Blindagem", "Camisa", "Vestes", "Redoma", "Baluarte"],
  cape: ["Capa", "Manto", "Traje", "Bornal", "Vela", "Sombra", "Aura", "Voe"],
};
const STRENGTH_DESC: Record<string, string[]> = {
  weapon: ["gume infalivel", "peso ancestral", "eco de batalhas antigas", "espirito forjado", "marca do destino", "fio incansavel"],
  helm: ["viseira imponente", "coroa de autoridade", "penacho de guerra", "olhar que inspira", "crista ancestral", "brilho de lideranca"],
  armor: ["placas entrelacadas", "malha reforcada", "aca vermelho", "espessura de muralha", "revestimento de aço", "costura de mestre"],
  cape: ["tecido vaporoso", "cauda longa", "forro real", "bordado de estrelas", "manto de vento", "fibra luminosa"],
};
const EFFECTS_BY_THEME: Record<string, string[]> = {
  fire: ["swirling flames engulfing the blade", "burning embers and sparks flying", "orange-red fire aura", "molten lava cracks on the metal"],
  ice: ["frost crystals forming on the surface", "cold blue mist emanating", "ice shards floating around", "frozen condensation trails"],
  lightning: ["electric sparks crackling", "blue-white lightning bolts", "static energy arcs", "thundercloud wisps"],
  shadow: ["dark purple shadow tendrils", "void energy wisps", "eerie dark mist", "spectral echoes"],
  nature: ["vines and leaves growing", "glowing green energy", "natural wood grain patterns", "flowering buds"],
  holy: ["divine golden light rays", "angelic wing feathers", "sacred symbol engravings", "healing aura glow"],
  dark: ["cursed dark energy swirls", "bone and skull ornaments", "deathly purple mist", "haunted ghostly wisps"],
  arcane: ["mystical rune symbols glowing", "purple-blue magical energy", "arcane circle patterns", "spell particles floating"],
};

const GEM_SHAPES: Record<string, string[]> = {
  weapon: ["round ruby", "teardrop sapphire", "hexagonal emerald", "diamond-shaped amethyst", "oval topaz"],
  helm: ["forehead ruby", "crown sapphire", "eye emerald", "temple amethyst", "visor diamond"],
  armor: ["chest ruby", "shoulder sapphire", "belt emerald", "collar amethyst", "breastplate diamond"],
  cape: ["clasp ruby", "brooch sapphire", "hem emerald", "border amethyst", "center diamond"],
};

const GUARD_STYLES: Record<string, string[]> = {
  weapon: ["wing-shaped crossguard", "dragon claw guard", "serpentine wave guard", "angelic feather guard", "gothic pointed guard"],
  helm: ["crest with horns", "winged side guards", "frontal visor plate", "temple guards", "crown spikes"],
  armor: ["pauldron chains", "chest plate engravings", "belt buckle ornament", "shoulder emblem", "collar clasp"],
  cape: ["hooded cape with clasp", "flowing cape with trim", "short cape with brooch", "royal cape with chain", "war cape with emblem"],
};

const PRICE_NAMES: Record<string, string[]> = {
  weapon: ["da Aurora", "do Abismo", "de Kael", "das Tempestades", "do Sol", "da Noite", "do Trovão", "da Serpente", "do Fim", "das Marés", "do Vale", "da Ruína"],
  helm: ["do Guardiao", "do Norte", "do Destino", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira"],
  armor: ["do Guardiao", "do Norte", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira", "do Cerco"],
  cape: ["do Andarilho", "da Aurora", "do Crepusculo", "do Vento", "da Viagem", "do Horizonte", "das Sombras", "do Peregrino"],
};

function buildArtPrompt(input: PlanInput, subtype: string, name: string, materialWord: string, seed: number): string {
  const h = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const pick = (arr: string[], salt: string) => arr[h(salt) % arr.length];

  const mat = materialWord.replace(/^ de /i, "") || "metal";
  const theme = (input.theme || "").toLowerCase();

  // Mapa de efeitos curtos por tema
  const EFFECTS: Record<string, string[]> = {
    fire: ["wrapped in flames", "burning with fire", "engulfed in orange flames"],
    ice: ["covered in frost", "frozen with ice crystals", "glowing with blue ice"],
    lightning: ["crackling with electricity", "sparking with lightning", "charged with electric energy"],
    shadow: ["surrounded by dark mist", "emanating shadow", "glowing with purple void energy"],
    nature: ["wrapped in vines", "glowing with green nature energy", "adorned with leaves"],
    holy: ["radiating golden light", "glowing with divine energy", "surrounded by holy aura"],
    dark: ["emanating dark energy", "cursed with purple mist", "glowing with demonic power"],
    arcane: ["glowing with magical runes", "surrounded by arcane energy", "pulsing with magical power"],
  };
  const allEffects = Object.values(EFFECTS).flat();
  const effect = theme && EFFECTS[theme] ? pick(EFFECTS[theme], `e:${theme}:${seed}`) : pick(allEffects, `e:${input.rarity}:${seed}`);

  // Nome da arma em ingles para o prompt
  const WEAPON_NAMES: Record<string, string[]> = {
    sword: ["sword", "longsword", "blade"],
    dagger: ["dagger", "knife", "stiletto"],
    axe: ["battle axe", "war axe", "axe"],
    bow: ["bow", "longbow", "crossbow"],
    staff: ["magic staff", "arcane staff", "wizard staff"],
    tome: ["spellbook", "grimoire", "magic tome"],
    helmet: ["helmet", "war helm", "crown helm"],
    cap: ["cap", "leather cap", "hood"],
    crown: ["royal crown", "golden crown", "jeweled crown"],
    hood: ["mystical hood", "shadow hood", "cloth hood"],
    light: ["leather armor", "light vest", "scout armor"],
    heavy: ["plate armor", "heavy armor", "steel armor"],
    robe: ["magic robe", "wizard robe", "arcane vestments"],
    cape: ["cape", "flowing cape", "battle cape"],
  };
  const weaponName = pick(WEAPON_NAMES[subtype] || WEAPON_NAMES.sword, `w:${subtype}:${seed}`);

  // Prompt CURTO e DIRETO - arma PRIMEIRO, efeito DEPOIS
  const prompt = `pixel art icon of a sharp ${weaponName} fantasy weapon, ${mat} blade with fire effect, centered on magenta background, game inventory item, detailed pixel art, no character`;

  return prompt;
}

const SUBTYPES: Record<string, string[]> = {
  weapon: ["sword", "dagger", "staff", "axe", "tome", "bow"],
  helm: ["cap", "helmet", "crown", "hood"],
  armor: ["light", "heavy", "robe"],
  cape: [""],
};

// Hash determinista a partir de uma string (FNV-1a 32 bits).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], key: string, salt = 0): T {
  return arr[(hashStr(key + ":" + salt) ) % arr.length];
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function planItemLocal(input: PlanInput, seed: number): ItemPlan {
  const rarMult = RARITY_MULT[input.rarity];
  const base = 1.2 * input.level;

  // Subtype determinado pela seed (estabilidade por tipo/raridade/nivel).
  const subtypes = SUBTYPES[input.type];
  const subtype = pick(subtypes, `${input.type}|${input.rarity}|${input.level}|${seed}`, 1);

  // nome = [substantivo forte] + [aposito ambientico]
  const root = pick(STRENGTH_NAMES[input.type] || STRENGTH_NAMES.weapon, `${input.type}|${seed}`, 2);
  const ep = pick(PRICE_NAMES[input.type] || PRICE_NAMES.weapon, `${input.type}|${input.rarity}|${seed}`, 3);
  const materialWord = input.material ? " de " + (input.material ?? "") : "";
  const name = (root + " " + ep + materialWord).slice(0, 60);

  const motif = pick(STRENGTH_DESC[input.type] || STRENGTH_DESC.weapon, `${input.type}|${input.rarity}|${seed}`, 4);
  const desc = `Equipamento ${RARITY_PT[input.rarity]} com ${motif}.` + (input.theme ? ` Inspirado em ${input.theme}.` : "");
  const description = desc.slice(0, 300);

  // Stats: 6 atributos sempre > 0; principal do tipo recebe o maior valor.
  const STAT_KEYS: Record<string, number> = { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 };
  const primary: string[] =
    input.type === "weapon"
      ? (subtype === "staff" || subtype === "tome" ? ["intellect", "wisdom"] : ["strength", "dexterity"])
      : input.type === "cape"
        ? ["wisdom", "luck"]
        : ["endurance", "dexterity"];

  const seeded = hashStr(`${input.type}|${input.rarity}|${input.level}|${seed}`);
  const main = clampInt(base * rarMult, 1, 200);
  let keyIdx = 0;
  for (const k of Object.keys(STAT_KEYS) as (keyof typeof STAT_KEYS)[]) {
    if (primary.includes(k)) {
      STAT_KEYS[k] = main + (primary[0] === k ? 0 : Math.round(main * 0.15));
    } else {
      const frac = 0.2 + ((seeded >> (keyIdx * 3)) & 7) / 20; // 0.20 a 0.55
      STAT_KEYS[k] = clampInt(main * frac, 1, 200);
    }
    keyIdx++;
  }

  const isWeapon = input.type === "weapon";
  let attackSpeedMs = 0;
  let dps = 0;
  if (isWeapon) {
    // Velocidade por subtipo alinhada aos itens do seed (dagger rápido, axe lento).
    const speedBySubtype: Record<string, [number, number]> = {
      dagger: [1300, 1600], sword: [1800, 2100], bow: [1700, 2000], staff: [2200, 2500], axe: [2300, 2600], tome: [2400, 2600],
    };
    const [lo, hi] = speedBySubtype[subtype] || [2000, 2300];
    attackSpeedMs = lo + (seeded % (hi - lo + 1));
    // DPS linear com nivel*raridade (para ~= attackPower); escala igual ao seed
    // (lv1 comum ~7, lv10 epica ~120). independente da velocidade.
    const powerScale = base * rarMult * 2.5;
    dps = clampInt(powerScale + (seeded % 15), 5, 100000);
  }

  const buyPrice = clampInt(50 + base * rarMult * base * 0.6 + (seeded % 300), 50, 500000);
  const sellPrice = Math.round(buyPrice * 0.2);

  const backdrop = input.theme ? `, ${input.theme} inspired` : "";
  return {
    name,
    description,
    subtype,
    artPrompt: buildArtPrompt(input, subtype, name, materialWord, seed),
    stats: { ...STAT_KEYS },
    attackSpeedMs,
    dps,
    buyPrice,
    sellPrice,
  };
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
  reference?: string | Buffer;
  quality?: QualityTier;
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
  const seed = Math.floor(Number(input.seed) || Date.now() % 1000000);

  // 0) Plano: por padrao usa a IA LOCAL (deterministica, sem API externa).
  //    Groq fica opcional (GROQ_PLANNER=on) para nomes/textos via LLM.
  const plan = process.env.GROQ_PLANNER === "on"
    ? await planItem({ type, theme: input.theme, material: input.material, color: input.color, rarity, level })
    : planItemLocal({ type, theme: input.theme, material: input.material, color: input.color, rarity, level }, seed);

  // 1) Se houver referencia (sprite sheet), usa como base para criar a arma.
  //    Extrai armas do pack, recolor por tema, adiciona efeitos.
  if (input.reference) {
    try {
      let refBuf: Buffer;
      if (typeof input.reference === "string") {
        // Pode ser dataURL ou .piskel
        if (input.reference.startsWith("data:")) {
          refBuf = Buffer.from(input.reference.replace(/^data:[^,]+;base64,/, ""), "base64");
        } else {
          refBuf = Buffer.from(input.reference, "base64");
        }
      } else {
        refBuf = input.reference;
      }

      // Detecta se e .piskel (JSON com PNG base64)
      let pngBuf = refBuf;
      if (refBuf.length > 0 && refBuf[0] === 0x7b) {
        try {
          const src = JSON.parse(refBuf.toString("utf8"));
          if (src.piskel && src.piskel.layers) {
            const layer = JSON.parse(src.piskel.layers[0]);
            const b64 = layer.chunks[0].base64PNG.replace(/^data:image\/png;base64,/, "");
            pngBuf = Buffer.from(b64, "base64");
          }
        } catch { /* nao e piskel, usa como PNG */ }
      }

      // Extrai armas do sprite sheet
      const weapons = await extractWeaponsFromSheet(pngBuf, 16);
      if (weapons.length > 0) {
        // Salva no cache para reusar
        const packName = "user-pack-" + Date.now();
        await saveWeaponCache(weapons, packName);

        // Pega uma arma aleatoria como base
        const baseWeapon = pickRandomWeapon(weapons, seed);

        // Recolor pelo tema
        const theme = (input.theme || "fire").toLowerCase();
        const palette = THEME_PALETTES[theme] || THEME_PALETTES.fire;
        const recolored = recolorWeapon(baseWeapon, palette);

        // Redimensiona para 64x64
        const resized = await resizeWeapon(recolored);

        // Aplica efeitos (glow, particulas, contraste)
        const enhanced = await enhancePixelArt(resized, {
          theme,
          glow: true,
          particles: ["rare", "epic", "legendary", "mythic"].includes(rarity),
          contrast: 1.2,
          saturation: 1.3,
        });

        // Salva
        const filename = "lib-" + Date.now() + "-" + seed + ".png";
        const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, enhanced);
        log.push("biblioteca de referencia (" + weapons.length + " armas) + recolor " + theme + " + efeitos");
        return { icon, plan };
      }
    } catch (e) {
      log.push("biblioteca falhou (" + (e as Error).message + ") - usando procedural");
    }
  }

  // 2) Pixel art PROCURAL e determinístico é a IA padrão do jogo (nosso estilo).
  if (process.env.IMAGE_AI === "on" && plan.artPrompt) {
    try {
      // Converte referencia para Buffer se necessario (img2img)
      let refBuf: Buffer | undefined;
      if (input.reference) {
        refBuf = typeof input.reference === "string"
          ? Buffer.from(input.reference.replace(/^data:[^,]+;base64,/, ""), "base64")
          : input.reference;
      }
      const { buf, provider } = await renderSprite(plan.artPrompt, seed, {
          quality: input.quality || "normal",
          negativePrompt: `blurry ${input.type} ${input.rarity} pixel art`,
          referenceImage: refBuf,
        });
      const { png } = await processSprite(buf);
      const filename = "ai-" + Date.now() + "-" + seed + ".png";
      const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, png);
      const mode = refBuf ? "img2img" : "txt2img";
      log.push((process.env.GROQ_PLANNER === "on" ? "Groq" : "IA local") + " (plano) + " + provider + " (IA " + mode + ", " + (input.quality || "normal") + ")");
      return { icon, plan };
    } catch (e) {
      log.push("IA de imagem falhou (" + (e as Error).message + ") - usando procedural");
    }
  }

  // 2) Pixel art procedural (nossa IA visual). Se houver referencia
  //    (PNG/.piskel pre-desenhado), usa a paleta extraida dela como base.
  let palette: Palette | undefined;
  if (input.reference) {
    try {
      const refBuf: Buffer = typeof input.reference === "string"
        ? Buffer.from(input.reference.replace(/^data:[^,]+;base64,/, ""), "base64")
        : input.reference;
      palette = await extractReferencePalette(refBuf);
      log.push("paleta de referencia aplicada (sprite pre-desenhado)");
    } catch (e) {
      log.push("referencia invalida - paleta padrao usada");
    }
  }
  const png = await renderItemIcon({
    type,
    subtype: plan.subtype,
    name: plan.name,
    rarity,
    theme: input.theme,
    material: input.material,
    color: input.color,
    seed,
    palette,
  });
  const filename = "px-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, png);
  log.push((process.env.GROQ_PLANNER === "on" ? "Groq" : "IA local") + " (plano) + pixel art procedural (pixelArt.ts)");
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
  const seed = Math.floor(Number(input.seed) || (Date.now() % 1000000));
  const png = await renderItemIcon({
    type,
    name: input.name,
    rarity,
    description: input.description,
    seed,
  });
  const filename = "px-" + Date.now() + "-" + seed + ".png";
  const icon = await saveGeneratedIcon(CATEGORY_BY_TYPE[type], filename, png);
  if (log) {
    log.push("pixel art procedural (pixelArt.ts)");
  }
  return { icon, removedPct: 0 };
}