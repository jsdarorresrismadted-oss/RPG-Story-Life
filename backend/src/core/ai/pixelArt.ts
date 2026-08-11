// ===== MOTOR DE PIXEL ART V3 - QUALIDADE PROFISSIONAL =====
// Baseado na referência: sprites limpos, volume metálico, silhueta clara
// Iluminação ↖ uniforme em todas as armas

import sharp from "sharp";

const FINAL_SIZE = 64;
const INTERNAL_SIZE = 16;
const SCALE = FINAL_SIZE / INTERNAL_SIZE;

type RGB = [number, number, number];

// ===== PALETAS COM CONTORNO COLORIDO =====
const PALETTE_STEEL: RGB[] = [
  [18, 20, 28],    // 0: contorno
  [40, 45, 55],    // 1: sombra profunda
  [70, 78, 90],    // 2: sombra
  [110, 120, 135], // 3: base
  [155, 168, 185], // 4: luz
  [200, 210, 225], // 5: brilho
  [235, 242, 255], // 6: brilho máximo
];

const PALETTE_FIRE: RGB[] = [
  [35, 10, 5],     // 0: contorno
  [85, 18, 8],     // 1: sombra profunda
  [150, 30, 12],   // 2: vermelho escuro
  [200, 50, 15],   // 3: vermelho
  [240, 95, 25],   // 4: laranja
  [255, 165, 45],  // 5: amarelo
  [255, 215, 100], // 6: brilho máximo
];

const PALETTE_ICE: RGB[] = [
  [8, 16, 32],     // 0: contorno
  [18, 45, 85],    // 1: sombra profunda
  [35, 90, 150],   // 2: azul escuro
  [60, 140, 200],  // 3: base
  [100, 185, 235], // 4: luz
  [160, 220, 250], // 5: brilho
  [215, 242, 255], // 6: brilho máximo
];

const PALETTE_SHADOW: RGB[] = [
  [22, 5, 30],     // 0: contorno
  [50, 10, 65],    // 1: sombra profunda
  [80, 20, 105],   // 2: roxo escuro
  [115, 38, 150],  // 3: base
  [155, 65, 195],  // 4: luz
  [195, 115, 235], // 5: brilho
  [235, 180, 255], // 6: brilho máximo
];

const PALETTE_NATURE: RGB[] = [
  [6, 22, 4],      // 0: contorno
  [15, 50, 10],    // 1: sombra profunda
  [30, 88, 22],    // 2: verde escuro
  [48, 128, 35],   // 3: base
  [75, 168, 58],   // 4: luz
  [115, 208, 100], // 5: brilho
  [170, 240, 155], // 6: brilho máximo
];

const PALETTE_HOLY: RGB[] = [
  [30, 24, 8],     // 0: contorno
  [72, 55, 15],    // 1: sombra profunda
  [130, 100, 25],  // 2: dourado escuro
  [185, 150, 40],  // 3: base
  [225, 195, 70],  // 4: luz
  [250, 232, 130], // 5: brilho
  [255, 248, 195], // 6: brilho máximo
];

const PALETTE_DARK: RGB[] = [
  [12, 4, 18],     // 0: contorno
  [30, 8, 45],     // 1: sombra profunda
  [50, 15, 72],    // 2: roxo escuro
  [72, 25, 105],   // 3: base
  [100, 42, 145],  // 4: luz
  [140, 75, 185],  // 5: brilho
  [185, 130, 225], // 6: brilho máximo
];

const PALETTE_ARCANE: RGB[] = [
  [18, 6, 28],     // 0: contorno
  [45, 12, 65],    // 1: sombra profunda
  [78, 22, 110],   // 2: magenta escuro
  [115, 35, 155],  // 3: base
  [155, 58, 200],  // 4: luz
  [195, 105, 240], // 5: brilho
  [235, 170, 255], // 6: brilho máximo
];

const PALETTES: Record<string, RGB[]> = {
  fire: PALETTE_FIRE, ice: PALETTE_ICE, lightning: PALETTE_FIRE,
  shadow: PALETTE_SHADOW, nature: PALETTE_NATURE, holy: PALETTE_HOLY,
  dark: PALETTE_DARK, arcane: PALETTE_ARCANE, steel: PALETTE_STEEL,
  iron: PALETTE_STEEL, gold: PALETTE_HOLY, default: PALETTE_STEEL,
};

// ===== CANVAS 16×16 =====
class Canvas16 {
  pixels: RGB[];
  width: number;
  height: number;

  constructor(w = 16, h = 16) {
    this.width = w;
    this.height = h;
    this.pixels = new Array(w * h).fill(null as any).map(() => [0, 0, 0] as RGB);
  }

  set(x: number, y: number, color: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = [...color] as RGB;
  }

  toBuffer64(): Buffer {
    const out = Buffer.alloc(FINAL_SIZE * FINAL_SIZE * 4);
    for (let y = 0; y < FINAL_SIZE; y++) {
      for (let x = 0; x < FINAL_SIZE; x++) {
        const srcX = Math.floor(x / SCALE);
        const srcY = Math.floor(y / SCALE);
        const src = this.pixels[srcY * this.width + srcX];
        const i = (y * FINAL_SIZE + x) * 4;
        out[i] = src[0]; out[i+1] = src[1]; out[i+2] = src[2];
        out[i+3] = (src[0] + src[1] + src[2] > 0) ? 255 : 0;
      }
    }
    return out;
  }
}

// ==================================================================
// ADAGA — curta, lâmina fina, guarda, cabo, pomo
// ==================================================================
function drawDagger(c: Canvas16, pal: RGB[]): void {
  const [O, SD, S, B, L, H, BR] = pal;

  // POMO
  c.set(7, 13, O); c.set(8, 13, O);
  c.set(7, 14, SD); c.set(8, 14, SD);

  // CABO (escuro, contrastante)
  c.set(7, 10, O); c.set(8, 10, O);
  c.set(7, 11, SD); c.set(8, 11, S);
  c.set(7, 12, O); c.set(8, 12, O);

  // GUARDA (horizontal)
  c.set(5, 9, O); c.set(6, 9, L); c.set(7, 9, H); c.set(8, 9, H); c.set(9, 9, L); c.set(10, 9, O);

  // LÂMINA (y=3-8)
  c.set(6, 8, O); c.set(7, 8, S); c.set(8, 8, B); c.set(9, 8, L); c.set(10, 8, O);
  c.set(6, 7, O); c.set(7, 7, B); c.set(8, 7, L); c.set(9, 7, H); c.set(10, 7, O);
  c.set(7, 6, O); c.set(8, 6, B); c.set(9, 6, L); c.set(10, 6, O);
  c.set(7, 5, O); c.set(8, 5, L); c.set(9, 5, H); c.set(10, 5, O);
  c.set(7, 4, O); c.set(8, 4, B); c.set(9, 4, L); c.set(10, 4, O);
  c.set(8, 3, O); c.set(9, 3, B); c.set(10, 3, O);
  c.set(8, 2, O); c.set(9, 2, O);
}

// ==================================================================
// ESPADA — lâmina longa, guarda ornamental, cabo proporcional
// ==================================================================
function drawSword(c: Canvas16, pal: RGB[]): void {
  const [O, SD, S, B, L, H, BR] = pal;

  // POMO
  c.set(7, 14, O); c.set(8, 14, O); c.set(9, 14, O);
  c.set(7, 15, SD); c.set(8, 15, S); c.set(9, 15, SD);

  // CABO (com textura de embrulho)
  c.set(7, 11, O); c.set(8, 11, O); c.set(9, 11, O);
  c.set(7, 12, SD); c.set(8, 12, S); c.set(9, 12, SD);
  c.set(7, 13, O); c.set(8, 13, SD); c.set(9, 13, O);

  // GUARDA (ornamental, 6px)
  c.set(5, 10, O); c.set(6, 10, B); c.set(7, 10, H); c.set(8, 10, BR); c.set(9, 10, H); c.set(10, 10, B); c.set(11, 10, O);
  // Detalhes da guarda
  c.set(4, 10, O); c.set(12, 10, O);

  // LÂMINA (y=2-9)
  c.set(6, 9, O); c.set(7, 9, S); c.set(8, 9, B); c.set(9, 9, L); c.set(10, 9, H); c.set(11, 9, O);
  c.set(6, 8, O); c.set(7, 8, B); c.set(8, 8, L); c.set(9, 8, H); c.set(10, 8, L); c.set(11, 8, O);
  c.set(6, 7, O); c.set(7, 7, L); c.set(8, 7, H); c.set(9, 7, BR); c.set(10, 7, H); c.set(11, 7, O);
  c.set(7, 6, O); c.set(8, 6, B); c.set(9, 6, L); c.set(10, 6, H); c.set(11, 6, O);
  c.set(7, 5, O); c.set(8, 5, L); c.set(9, 5, H); c.set(10, 5, BR); c.set(11, 5, O);
  c.set(7, 4, O); c.set(8, 4, B); c.set(9, 4, L); c.set(10, 4, H); c.set(11, 4, O);
  c.set(8, 3, O); c.set(9, 3, B); c.set(10, 3, L); c.set(11, 3, O);
  c.set(8, 2, O); c.set(9, 2, B); c.set(10, 2, O);
  c.set(9, 1, O); c.set(10, 1, O);
}

// ==================================================================
// MACHADO — cabeça larga, cabo diagonal, forma agressiva
// ==================================================================
function drawAxe(c: Canvas16, pal: RGB[]): void {
  const [O, SD, S, B, L, H, BR] = pal;

  // CABO (diagonal ↘)
  c.set(7, 7, O); c.set(8, 7, O);
  c.set(7, 8, O); c.set(8, 8, SD);
  c.set(8, 9, O); c.set(9, 9, O);
  c.set(8, 10, O); c.set(9, 10, SD);
  c.set(9, 11, O); c.set(10, 11, O);
  c.set(9, 12, O); c.set(10, 12, SD);
  c.set(10, 13, O); c.set(11, 13, O);
  c.set(10, 14, O); c.set(11, 14, SD); c.set(12, 14, O);

  // CABEÇA (grande, agressiva)
  // Topo (y=1)
  c.set(4, 1, O); c.set(5, 1, B); c.set(6, 1, L); c.set(7, 1, H); c.set(8, 1, L); c.set(9, 1, B); c.set(10, 1, O);
  // y=2
  c.set(3, 2, O); c.set(4, 2, S); c.set(5, 2, B); c.set(6, 2, L); c.set(7, 2, H); c.set(8, 2, BR); c.set(9, 2, H); c.set(10, 2, B); c.set(11, 2, O);
  // y=3
  c.set(2, 3, O); c.set(3, 3, SD); c.set(4, 3, S); c.set(5, 3, B); c.set(6, 3, L); c.set(7, 3, H); c.set(8, 3, BR); c.set(9, 3, H); c.set(10, 3, B); c.set(11, 3, O);
  // y=4 — centro (mais larga)
  c.set(1, 4, O); c.set(2, 4, SD); c.set(3, 4, S); c.set(4, 4, B); c.set(5, 4, L); c.set(6, 4, H); c.set(7, 4, BR); c.set(8, 4, H); c.set(9, 4, B); c.set(10, 4, S); c.set(11, 4, SD); c.set(12, 4, O);
  // y=5
  c.set(2, 5, O); c.set(3, 5, SD); c.set(4, 5, S); c.set(5, 5, B); c.set(6, 5, L); c.set(7, 5, H); c.set(8, 5, B); c.set(9, 5, S); c.set(10, 5, SD); c.set(11, 5, O);
  // y=6
  c.set(3, 6, O); c.set(4, 6, SD); c.set(5, 6, S); c.set(6, 6, B); c.set(7, 6, L); c.set(8, 6, B); c.set(9, 6, S); c.set(10, 6, O);
  // y=7 — conexão
  c.set(5, 7, O); c.set(6, 7, S); c.set(7, 7, B); c.set(8, 7, O);
}

// ==================================================================
// CAJADO — cabo longo, cristal na ponta, volume
// ==================================================================
function drawStaff(c: Canvas16, pal: RGB[]): void {
  const [O, SD, S, B, L, H, BR] = pal;

  // CABO (y=6-14, 3px largura)
  for (let y = 6; y <= 14; y++) {
    c.set(7, y, O);
    c.set(8, y, y % 3 === 0 ? L : (y % 3 === 1 ? B : S));
    c.set(9, y, O);
  }

  // PÉ
  c.set(6, 15, O); c.set(7, 15, SD); c.set(8, 15, S); c.set(9, 15, SD); c.set(10, 15, O);

  // CRISTAL (losango com volume)
  c.set(8, 1, O);
  c.set(7, 2, O); c.set(8, 2, BR); c.set(9, 2, O);
  c.set(6, 3, O); c.set(7, 3, H); c.set(8, 3, BR); c.set(9, 3, H); c.set(10, 3, O);
  c.set(7, 4, O); c.set(8, 4, L); c.set(9, 4, O);
  c.set(7, 5, O); c.set(8, 5, B); c.set(9, 5, O);

  // Detalhes decorativos ao redor do cristal
  c.set(5, 2, O); c.set(11, 2, O);
  c.set(4, 3, O); c.set(12, 3, O);
}

// ==================================================================
// ARCO — curva definida, corda visível, pontas decorativas
// ==================================================================
function drawBow(c: Canvas16, pal: RGB[]): void {
  const [O, SD, S, B, L, H, BR] = pal;

  // CORPO DO ARCO (curva para esquerda)
  // Topo pontiagudo
  c.set(10, 1, O); c.set(11, 1, O);
  c.set(9, 2, O); c.set(10, 2, B); c.set(11, 2, O);
  c.set(8, 3, O); c.set(9, 3, L); c.set(10, 3, B); c.set(11, 3, O);
  c.set(7, 4, O); c.set(8, 4, B); c.set(9, 4, L); c.set(10, 4, H); c.set(11, 4, O);
  c.set(6, 5, O); c.set(7, 5, S); c.set(8, 5, B); c.set(9, 5, L); c.set(10, 5, H); c.set(11, 5, O);
  c.set(6, 6, O); c.set(7, 6, SD); c.set(8, 6, S); c.set(9, 6, B); c.set(10, 6, L); c.set(11, 6, O);
  c.set(6, 7, O); c.set(7, 7, SD); c.set(8, 7, S); c.set(9, 7, B); c.set(10, 7, O);
  c.set(6, 8, O); c.set(7, 8, SD); c.set(8, 8, S); c.set(9, 8, O);
  c.set(7, 9, O); c.set(8, 9, SD); c.set(9, 9, O);
  c.set(7, 10, O); c.set(8, 10, S); c.set(9, 10, O);
  c.set(8, 11, O); c.set(9, 11, B); c.set(10, 11, O);
  c.set(8, 12, O); c.set(9, 12, L); c.set(10, 12, O);
  c.set(9, 13, O); c.set(10, 13, B); c.set(11, 13, O);
  c.set(10, 14, O); c.set(11, 14, O);

  // CORDA (linha fina, separada do corpo)
  c.set(5, 2, SD); c.set(5, 3, SD); c.set(5, 4, SD);
  c.set(5, 5, SD); c.set(5, 6, SD); c.set(5, 7, SD);
  c.set(5, 8, SD); c.set(5, 9, SD); c.set(5, 10, SD);
  c.set(5, 11, SD); c.set(5, 12, SD); c.set(5, 13, SD);
  c.set(5, 14, SD);

  // PONTAS DECORATIVAS
  c.set(4, 1, O); c.set(11, 14, O);
}

// ===== MAPA DE DESENHO =====
const DRAW_FUNCTIONS: Record<string, (c: Canvas16, pal: RGB[]) => void> = {
  dagger: drawDagger, sword: drawSword, axe: drawAxe,
  staff: drawStaff, bow: drawBow, tome: drawStaff,
  helmet: drawSword, cap: drawSword, crown: drawSword,
  hood: drawSword, light: drawSword, heavy: drawSword,
  robe: drawSword, cape: drawSword,
};

// ===== FUNÇÕES AUXILIARES =====
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export async function renderSkillIcon(input: { kind: string; name: string; element?: string; rarity?: string; seed: number }): Promise<Buffer> {
  const theme = (input.element || input.kind || "arcane").toLowerCase();
  const pal = PALETTES[theme] || PALETTES.arcane;
  const c = new Canvas16();
  const [O, SD, S, B, L, H] = pal;
  const cx = 8, cy = 8;

  switch (input.kind) {
    case "attack":
      c.set(cx-2, cy-2, O); c.set(cx-1, cy-1, B); c.set(cx, cy, H); c.set(cx+1, cy+1, B); c.set(cx+2, cy+2, O);
      c.set(cx+2, cy-2, O); c.set(cx+1, cy-1, B); c.set(cx, cy, H); c.set(cx-1, cy+1, B); c.set(cx-2, cy+2, O);
      break;
    case "buff":
      c.set(cx, cy-3, H); c.set(cx, cy-2, L); c.set(cx, cy-1, B);
      c.set(cx-1, cy, S); c.set(cx, cy, L); c.set(cx+1, cy, S);
      c.set(cx, cy+1, B); c.set(cx, cy+2, S);
      break;
    case "heal":
      c.set(cx, cy-2, H); c.set(cx, cy-1, L);
      c.set(cx-2, cy, L); c.set(cx-1, cy, B); c.set(cx, cy, H); c.set(cx+1, cy, B); c.set(cx+2, cy, L);
      c.set(cx, cy+1, L); c.set(cx, cy+2, B);
      break;
    default:
      c.set(cx, cy-2, H); c.set(cx-1, cy-1, L); c.set(cx, cy-1, L); c.set(cx+1, cy-1, L);
      c.set(cx-2, cy, B); c.set(cx-1, cy, L); c.set(cx, cy, H); c.set(cx+1, cy, L); c.set(cx+2, cy, B);
      c.set(cx-1, cy+1, S); c.set(cx, cy+1, B); c.set(cx+1, cy+1, S);
      c.set(cx, cy+2, S);
  }

  const buf = c.toBuffer64();
  return sharp(buf, { raw: { width: FINAL_SIZE, height: FINAL_SIZE, channels: 4 } }).png().toBuffer();
}

// ===== INTERFACE PÚBLICA =====
export interface ItemIconInput {
  type: string; subtype?: string; name?: string; description?: string;
  rarity?: string; theme?: string; material?: string; color?: string;
  seed?: number; palette?: Palette;
}

export interface Palette {
  outline: RGB; dark: RGB; base: RGB; light: RGB; metal: RGB; gem: RGB;
  accent?: RGB; wood?: RGB;
}

function paletteToRGBs(p: Palette): RGB[] {
  return [p.outline, p.dark, p.base, p.light, p.metal, p.gem];
}

export async function renderItemIcon(input: ItemIconInput): Promise<Buffer> {
  const subtype = input.subtype || "sword";
  const theme = (input.theme || input.material || "steel").toLowerCase();
  const pal = input.palette ? paletteToRGBs(input.palette) : (PALETTES[theme] || PALETTES.default);
  const c = new Canvas16();
  const drawFn = DRAW_FUNCTIONS[subtype] || DRAW_FUNCTIONS.sword;
  drawFn(c, pal);
  const buf = c.toBuffer64();
  return sharp(buf, { raw: { width: FINAL_SIZE, height: FINAL_SIZE, channels: 4 } }).png().toBuffer();
}

export { PALETTES, PALETTE_STEEL, PALETTE_FIRE, PALETTE_ICE, PALETTE_SHADOW, PALETTE_NATURE };
