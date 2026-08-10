import sharp from "sharp";

const SIZE = 64;

type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 255): number => Math.max(lo, Math.min(hi, Math.round(v)));

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lighten = (c: RGB, t: number): RGB => mix(c, [255, 255, 255], t);
const darken = (c: RGB, t: number): RGB => mix(c, [0, 0, 0], t);

export function hashSeed(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi === yj) continue;
    if (yi > py === yj > py) continue;
    if (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

class Canvas {
  buf: Buffer;

  constructor() {
    this.buf = Buffer.alloc(SIZE * SIZE * 4);
  }

  setPx(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= SIZE || yi >= SIZE) return;
    const i = (yi * SIZE + xi) * 4;
    this.buf[i] = clamp(c[0]);
    this.buf[i + 1] = clamp(c[1]);
    this.buf[i + 2] = clamp(c[2]);
    this.buf[i + 3] = 255;
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) this.setPx(x, y, c);
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    const rr = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rr) this.setPx(x, y, c);
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.setPx(x, y, c);
      }
    }
  }

  fillDiamond(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    this.fillPolygon([[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]], c);
  }

  fillTriangle(a: [number, number], b: [number, number], cc: [number, number], c: RGB): void {
    this.fillPolygon([a, b, cc], c);
  }

  fillPolygon(pts: [number, number][], c: RGB): void {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.floor(Math.min(...xs));
    const maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPolygon(x, y, pts)) this.setPx(x, y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, thickness: number, c: RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, c);
    }
  }

  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, thickness: number, c: RGB): void {
    const steps = Math.max(8, Math.round(Math.abs(a1 - a0)));
    for (let s = 0; s <= steps; s++) {
      const a = ((a0 + ((a1 - a0) * s) / steps) * Math.PI) / 180;
      this.fillCircle(cx + rx * Math.cos(a), cy + ry * Math.sin(a), thickness / 2, c);
    }
  }

  applyShading(light: RGB, dark: RGB): void {
    const src = Buffer.from(this.buf);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        if (src[i + 3] === 0) continue;
        const above = y > 0 ? src[((y - 1) * SIZE + x) * 4 + 3] : 0;
        const below = y < SIZE - 1 ? src[((y + 1) * SIZE + x) * 4 + 3] : 0;
        if (above === 0) this.setPx(x, y, light);
        else if (below === 0) this.setPx(x, y, dark);
      }
    }
  }

  applyOutline(outline: RGB): void {
    const src = Buffer.from(this.buf);
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        if (src[i + 3] > 0) continue;
        let adjacent = false;
        for (const [nx, ny] of neighbors) {
          const dx = x + nx;
          const dy = y + ny;
          if (dx < 0 || dy < 0 || dx >= SIZE || dy >= SIZE) continue;
          if (src[(dy * SIZE + dx) * 4 + 3] > 0) {
            adjacent = true;
            break;
          }
        }
        if (adjacent) this.setPx(x, y, outline);
      }
    }
  }

  sparkle(count: number, c: RGB, rng: () => number): void {
    for (let n = 0; n < count; n++) {
      this.setPx(rng() * SIZE, rng() * SIZE, c);
    }
  }
}

interface Palette {
  base: RGB;
  light: RGB;
  dark: RGB;
  metal: RGB;
  wood: RGB;
  accent: RGB;
  gem: RGB;
  outline: RGB;
}

const STEEL: RGB = [150, 160, 175];
const IRON: RGB = [140, 145, 155];
const GOLD: RGB = [222, 178, 70];
const SILVER: RGB = [196, 204, 216];
const BRONZE: RGB = [176, 122, 74];
const CRIMSON: RGB = [168, 48, 58];
const GRAY_METAL: RGB = [168, 176, 188];
const WOOD: RGB = [122, 82, 52];

const TYPE_DEFAULT: Record<string, RGB> = {
  weapon: STEEL,
  helm: STEEL,
  armor: IRON,
  cape: CRIMSON,
};

const RARITY_COLORS: Record<string, RGB> = {
  common: [168, 176, 188],
  uncommon: [92, 194, 108],
  rare: [82, 138, 240],
  epic: [170, 92, 240],
  legendary: [240, 186, 66],
  mythic: [244, 92, 130],
};

const ELEMENT_COLORS: Record<string, RGB> = {
  fire: [222, 92, 52],
  ice: [120, 190, 232],
  thunder: [232, 202, 74],
  nature: [92, 172, 92],
  light: [240, 230, 190],
  dark: [112, 82, 152],
  arcane: [182, 92, 222],
  earth: [152, 122, 82],
  water: [82, 142, 222],
};

const KEYWORD_COLORS: Record<string, RGB> = {
  red: [196, 58, 54], vermelho: [196, 58, 54],
  blue: [64, 110, 222], azul: [64, 110, 222],
  green: [76, 168, 88], verde: [76, 168, 88],
  gold: [222, 178, 70], dourado: [222, 178, 70], ouro: [222, 178, 70],
  silver: [196, 204, 216], prata: [196, 204, 216],
  black: [40, 42, 48], preto: [40, 42, 48],
  white: [236, 238, 240], branco: [236, 238, 240],
  purple: [164, 88, 224], roxo: [164, 88, 224], violeta: [164, 88, 224],
  orange: [232, 128, 52], laranja: [232, 128, 52],
  yellow: [236, 208, 74], amarelo: [236, 208, 74],
  cyan: [74, 196, 214], ciano: [74, 196, 214],
  teal: [60, 160, 150],
  brown: [146, 98, 60], marrom: [146, 98, 60],
  pink: [232, 118, 168], rosa: [232, 118, 168],
  steel: STEEL, aco: STEEL,
  iron: IRON, ferro: IRON,
  bronze: BRONZE,
  obsidian: [56, 50, 78], obsidiana: [56, 50, 78],
  bone: [224, 218, 198], osso: [224, 218, 198],
  crystal: [138, 208, 232], cristal: [138, 208, 232],
  shadow: [96, 78, 140], sombra: [96, 78, 140],
  crimson: CRIMSON, carmesim: CRIMSON,
  emerald: [64, 196, 110], esmeralda: [64, 196, 110],
  ruby: [208, 60, 84], rubi: [208, 60, 84],
  sapphire: [70, 110, 224], safira: [70, 110, 224],
  amethyst: [170, 100, 220], ametista: [170, 100, 220],
  onyx: [48, 46, 56], onix: [48, 46, 56],
  fire: ELEMENT_COLORS.fire, fogo: ELEMENT_COLORS.fire,
  ice: ELEMENT_COLORS.ice, gelo: ELEMENT_COLORS.ice,
  thunder: ELEMENT_COLORS.thunder, raio: ELEMENT_COLORS.thunder, trovao: ELEMENT_COLORS.thunder,
  nature: ELEMENT_COLORS.nature, natureza: ELEMENT_COLORS.nature,
  light: ELEMENT_COLORS.light, luz: ELEMENT_COLORS.light,
  dark: ELEMENT_COLORS.dark, escuridao: ELEMENT_COLORS.dark,
  arcane: ELEMENT_COLORS.arcane, arcano: ELEMENT_COLORS.arcano,
  earth: ELEMENT_COLORS.earth, terra: ELEMENT_COLORS.earth,
  water: ELEMENT_COLORS.water, agua: ELEMENT_COLORS.water,
};

function pickKeyword(base: RGB | null, ...terms: (string | undefined)[]): RGB | null {
  if (base) return base;
  for (const term of terms) {
    if (!term) continue;
    const lower = term.toLowerCase();
    for (const [key, value] of Object.entries(KEYWORD_COLORS)) {
      if (lower.includes(key)) return value;
    }
  }
  return null;
}

function basePalette(base: RGB, gem: RGB): Palette {
  return {
    base,
    light: lighten(base, 0.45),
    dark: darken(base, 0.42),
    metal: GRAY_METAL,
    wood: WOOD,
    accent: gem,
    gem,
    outline: darken(base, 0.78),
  };
}

function resolveItemPalette(input: ItemIconInput, rng: () => number): Palette {
  const base = pickKeyword(null, input.color, input.material, input.theme) ?? TYPE_DEFAULT[input.type] ?? GRAY_METAL;
  const jittered: RGB = [
    clamp(base[0] + (rng() * 14 - 7)),
    clamp(base[1] + (rng() * 14 - 7)),
    clamp(base[2] + (rng() * 14 - 7)),
  ];
  const pal = basePalette(jittered, rarityColor(input.rarity));
  const mat = (input.material || "").toLowerCase();
  if (/(gold|ouro|dourado)/.test(mat)) pal.metal = GOLD;
  else if (/(silver|prata)/.test(mat)) pal.metal = SILVER;
  else if (/(bronze)/.test(mat)) pal.metal = BRONZE;
  else if (/(obsidian|shadow|sombra)/.test(mat)) pal.metal = darken(jittered, 0.55);
  else if (/(crystal|cristal)/.test(mat)) pal.metal = lighten(jittered, 0.45);
  else if (/(iron|ferro)/.test(mat)) pal.metal = IRON;
  return pal;
}

function resolveSkillPalette(input: SkillIconInput, rng: () => number): Palette {
  const base = ELEMENT_COLORS[input.element || ""] || ELEMENT_COLORS.arcane;
  const jittered: RGB = [
    clamp(base[0] + (rng() * 14 - 7)),
    clamp(base[1] + (rng() * 14 - 7)),
    clamp(base[2] + (rng() * 14 - 7)),
  ];
  return basePalette(jittered, rarityColor(input.rarity));
}

function rarityColor(rarity?: string): RGB {
  const key = String(rarity || "").toLowerCase();
  return RARITY_COLORS[key] || RARITY_COLORS.common;
}

function drawSword(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 4], [29, 10], [35, 10]], p.base);
  c.fillPolygon([[29, 10], [35, 10], [38, 30], [38, 34], [26, 34], [26, 30]], p.base);
  c.fillPolygon([[30, 11], [31, 11], [31, 30], [27, 30], [27, 24], [30, 11]], p.light);
  c.fillPolygon([[20, 34], [44, 34], [44, 39], [20, 39]], p.metal);
  c.fillPolygon([[29, 39], [35, 39], [35, 49], [29, 49]], p.dark);
  c.fillCircle(32, 52, 3, p.gem);
  c.fillCircle(31, 51, 1.2, p.light);
}

function drawDagger(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 7], [29, 12], [35, 12]], p.base);
  c.fillPolygon([[29, 12], [35, 12], [37, 30], [37, 33], [27, 33], [27, 30]], p.base);
  c.fillPolygon([[30, 13], [31, 13], [31, 30], [28, 30], [28, 25], [30, 13]], p.light);
  c.fillPolygon([[23, 33], [41, 33], [41, 37], [23, 37]], p.metal);
  c.fillPolygon([[30, 37], [34, 37], [34, 44], [30, 44]], p.dark);
  c.fillCircle(32, 47, 2, p.gem);
}

function drawStaff(c: Canvas, p: Palette): void {
  c.fillCircle(32, 11, 5.5, p.gem);
  c.fillCircle(31, 10, 2.5, p.light);
  c.fillPolygon([[27, 19], [37, 19], [37, 26], [27, 26]], p.metal);
  c.fillPolygon([[30, 24], [34, 24], [34, 56], [30, 56]], p.wood);
  c.fillPolygon([[30, 56], [34, 56], [32, 61]], p.metal);
  c.fillPolygon([[28, 19], [32, 19], [30, 23], [26, 23]], p.light);
}

function drawAxe(c: Canvas, p: Palette): void {
  c.line(18, 58, 44, 22, 4, p.wood);
  c.line(19, 57, 43, 23, 1.6, p.light);
  c.fillPolygon([[28, 8], [50, 18], [54, 28], [46, 32], [38, 30], [32, 24], [30, 14]], p.metal);
  c.fillPolygon([[30, 14], [32, 24], [38, 30], [40, 26], [36, 18]], p.light);
  c.fillCircle(46, 10, 2.4, p.gem);
}

function drawTome(c: Canvas, p: Palette): void {
  c.fillPolygon([[15, 9], [49, 9], [49, 36], [15, 36]], p.base);
  c.fillPolygon([[28, 9], [36, 9], [36, 36], [28, 36]], p.dark);
  c.fillPolygon([[16, 11], [26, 11], [26, 34], [16, 34]], p.light);
  c.fillPolygon([[38, 11], [48, 11], [48, 34], [38, 34]], p.light);
  c.fillPolygon([[13, 36], [51, 36], [51, 43], [13, 43]], p.dark);
  c.fillPolygon([[28, 36], [36, 36], [32, 46]], p.accent);
  c.fillDiamond(32, 22, 3, 4, p.gem);
}

function drawBow(c: Canvas, p: Palette): void {
  c.arc(32, 34, 20, 20, 200, 340, 5, p.wood);
  c.arc(32, 34, 20, 20, 205, 335, 1.6, p.light);
  c.line(15, 28, 49, 28, 1.2, p.light);
  c.fillCircle(32, 28, 1.6, p.gem);
}

function drawCap(c: Canvas, p: Palette): void {
  c.fillEllipse(32, 34, 21, 16, p.base);
  c.fillEllipse(27, 27, 10, 7, p.light);
  c.fillPolygon([[11, 38], [53, 38], [53, 43], [11, 43]], p.accent);
  c.fillPolygon([[45, 43], [58, 43], [58, 46], [45, 46]], p.base);
}

function drawHelmet(c: Canvas, p: Palette): void {
  c.fillEllipse(32, 32, 19, 20, p.base);
  c.fillEllipse(27, 24, 9, 8, p.light);
  c.fillPolygon([[24, 36], [40, 36], [38, 47], [26, 47]], p.outline);
  c.fillPolygon([[26, 38], [38, 38], [37, 44], [27, 44]], p.dark);
  c.fillCircle(15, 40, 2, p.metal);
  c.fillCircle(49, 40, 2, p.metal);
  c.fillPolygon([[30, 11], [34, 11], [36, 22], [30, 22]], p.accent);
}

function drawCrown(c: Canvas, p: Palette): void {
  c.fillTriangle([32, 6], [25, 20], [39, 20], p.base);
  c.fillTriangle([14, 10], [9, 20], [21, 20], p.base);
  c.fillTriangle([50, 10], [43, 20], [55, 20], p.base);
  c.fillPolygon([[9, 20], [55, 20], [55, 33], [9, 33]], p.base);
  c.fillPolygon([[9, 20], [55, 20], [55, 24], [9, 24]], p.dark);
  c.fillCircle(32, 9, 2.2, p.gem);
  c.fillCircle(14, 13, 1.8, p.gem);
  c.fillCircle(50, 13, 1.8, p.gem);
  c.fillCircle(32, 27, 2.6, p.accent);
}

function drawHood(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 5], [52, 26], [48, 52], [16, 52], [12, 26]], p.base);
  c.fillPolygon([[26, 10], [32, 5], [52, 26], [40, 26]], p.light);
  c.fillEllipse(32, 42, 10, 14, p.outline);
  c.fillEllipse(32, 42, 8, 12, p.dark);
}

function drawLightArmor(c: Canvas, p: Palette): void {
  c.fillPolygon([[20, 20], [44, 20], [48, 44], [40, 58], [24, 58], [16, 44]], p.base);
  c.fillPolygon([[14, 20], [26, 20], [24, 32], [12, 30]], p.dark);
  c.fillPolygon([[38, 20], [50, 20], [52, 30], [40, 32]], p.dark);
  c.fillPolygon([[26, 22], [38, 22], [36, 27], [28, 27]], p.light);
  c.fillPolygon([[22, 46], [42, 46], [42, 52], [22, 52]], p.accent);
  c.fillDiamond(32, 49, 3, 3, p.metal);
}

function drawHeavyArmor(c: Canvas, p: Palette): void {
  c.fillPolygon([[20, 18], [44, 18], [50, 46], [40, 60], [24, 60], [14, 46]], p.base);
  c.fillCircle(16, 22, 8, p.dark);
  c.fillCircle(48, 22, 8, p.dark);
  c.fillCircle(16, 22, 5, p.metal);
  c.fillCircle(48, 22, 5, p.metal);
  c.fillPolygon([[28, 22], [36, 22], [36, 28], [28, 28]], p.light);
  c.fillDiamond(32, 36, 6, 7, p.gem);
  c.fillCircle(26, 24, 1.5, p.metal);
  c.fillCircle(38, 24, 1.5, p.metal);
  c.fillPolygon([[20, 48], [44, 48], [44, 54], [20, 54]], p.accent);
}

function drawRobe(c: Canvas, p: Palette): void {
  c.fillPolygon([[22, 16], [42, 16], [52, 30], [48, 60], [16, 60], [12, 30]], p.base);
  c.fillPolygon([[24, 18], [40, 18], [32, 30]], p.outline);
  c.fillPolygon([[26, 20], [38, 20], [32, 28]], p.dark);
  c.fillPolygon([[24, 20], [42, 20], [40, 26], [26, 26]], p.light);
  c.fillPolygon([[20, 38], [44, 38], [44, 44], [20, 44]], p.accent);
  c.fillPolygon([[16, 56], [48, 56], [48, 60], [16, 60]], p.accent);
  c.fillCircle(32, 30, 2.5, p.metal);
}

function drawCape(c: Canvas, p: Palette): void {
  c.fillPolygon([[26, 10], [38, 10], [44, 22], [52, 34], [56, 54], [44, 60], [20, 60], [8, 54], [12, 34], [20, 22]], p.base);
  c.fillPolygon([[28, 14], [36, 14], [30, 32], [34, 48], [30, 58], [26, 58], [22, 46], [26, 30]], p.dark);
  c.fillPolygon([[27, 12], [37, 12], [37, 15], [27, 15]], p.light);
  c.fillCircle(32, 12, 3, p.metal);
}

function drawGenericGem(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 10], [52, 32], [32, 54], [12, 32]], p.base);
  c.fillPolygon([[32, 10], [52, 32], [32, 32], [32, 10]], p.light);
  c.fillPolygon([[32, 32], [52, 32], [32, 54]], p.dark);
  c.fillDiamond(32, 32, 3, 3, p.gem);
}

function drawItem(c: Canvas, input: ItemIconInput, p: Palette, rng: () => number): void {
  const subtype = String(input.subtype || "").toLowerCase();
  const type = String(input.type || "").toLowerCase();
  const swordLike = subtype === "sword" || subtype === "espada" || (!subtype && type === "weapon");
  if (type === "weapon" || subtype === "weapon") {
    if (subtype === "dagger" || subtype === "adaga") drawDagger(c, p);
    else if (subtype === "staff" || subtype === "cajado" || subtype === "stave") drawStaff(c, p);
    else if (subtype === "axe" || subtype === "machado") drawAxe(c, p);
    else if (subtype === "tome" || subtype === "grimorio") drawTome(c, p);
    else if (subtype === "bow" || subtype === "arco") drawBow(c, p);
    else if (swordLike) drawSword(c, p);
    else {
      const shapes = [drawSword, drawAxe, drawStaff, drawTome];
      shapes[Math.floor(rng() * shapes.length)](c, p);
    }
    return;
  }
  if (type === "helm" || subtype === "helm") {
    if (subtype === "cap" || subtype === "gorro" || subtype === "chapeu") drawCap(c, p);
    else if (subtype === "crown" || subtype === "coroa") drawCrown(c, p);
    else if (subtype === "hood" || subtype === "capuz") drawHood(c, p);
    else if (subtype === "helmet" || subtype === "elmo" || subtype === "capacete") drawHelmet(c, p);
    else {
      const shapes = [drawHelmet, drawCap, drawCrown, drawHood];
      shapes[Math.floor(rng() * shapes.length)](c, p);
    }
    return;
  }
  if (type === "armor" || subtype === "armor" || type === "armadura") {
    if (subtype === "light" || subtype === "leve" || subtype === "couro") drawLightArmor(c, p);
    else if (subtype === "heavy" || subtype === "pesada" || subtype === "placa") drawHeavyArmor(c, p);
    else if (subtype === "robe" || subtype === "veste" || subtype === "manto") drawRobe(c, p);
    else {
      const shapes = [drawHeavyArmor, drawLightArmor, drawRobe];
      shapes[Math.floor(rng() * shapes.length)](c, p);
    }
    return;
  }
  if (type === "cape" || subtype === "cape" || subtype === "capa") {
    drawCape(c, p);
    return;
  }
  drawGenericGem(c, p);
}

function drawAttack(c: Canvas, p: Palette, rng: () => number): void {
  const variant = rng();
  if (variant < 0.6) {
    c.line(20, 16, 46, 42, 4, p.metal);
    c.line(46, 16, 20, 42, 4, p.metal);
    c.line(21, 17, 45, 41, 1.4, p.light);
    c.fillCircle(20, 16, 2.4, p.gem);
    c.fillCircle(46, 16, 2.4, p.gem);
    c.fillCircle(20, 42, 2.4, p.gem);
    c.fillCircle(46, 42, 2.4, p.gem);
  } else {
    c.line(16, 50, 48, 18, 5, p.base);
    c.line(17, 49, 47, 19, 1.6, p.light);
    c.fillCircle(48, 18, 2.6, p.gem);
  }
}

function drawBuff(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 7], [21, 22], [28, 22], [28, 42], [36, 42], [36, 22], [43, 22]], p.accent);
  c.fillPolygon([[32, 12], [26, 20], [30, 20], [30, 38], [34, 38], [34, 20], [38, 20]], p.light);
}

function drawDebuff(c: Canvas, p: Palette, rng: () => number): void {
  if (rng() < 0.5) {
    c.fillPolygon([[32, 48], [21, 34], [28, 34], [28, 14], [36, 14], [36, 34], [43, 34]], p.base);
    c.fillPolygon([[32, 43], [26, 36], [30, 36], [30, 18], [34, 18], [34, 36], [38, 36]], p.light);
  } else {
    c.fillCircle(32, 22, 10, p.base);
    c.fillPolygon([[24, 26], [40, 26], [40, 36], [36, 44], [28, 44], [24, 36]], p.base);
    c.fillCircle(27, 22, 2.6, p.outline);
    c.fillCircle(37, 22, 2.6, p.outline);
    c.fillPolygon([[28, 33], [36, 33], [34, 40], [30, 40]], p.outline);
    c.fillCircle(24, 27, 1, p.light);
  }
}

function drawHeal(c: Canvas, p: Palette): void {
  c.fillCircle(24, 28, 8, p.base);
  c.fillCircle(40, 28, 8, p.base);
  c.fillPolygon([[16, 28], [48, 28], [32, 50]], p.base);
  c.fillCircle(22, 25, 3, p.light);
  c.fillPolygon([[30, 30], [34, 30], [34, 40], [30, 40]], p.light);
}

function drawShield(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 7], [46, 13], [46, 35], [32, 55], [18, 35], [18, 13]], p.base);
  c.fillPolygon([[32, 15], [40, 20], [40, 33], [32, 47], [24, 33], [24, 20]], p.dark);
  c.fillPolygon([[29, 25], [35, 25], [35, 38], [29, 38]], p.metal);
  c.fillPolygon([[26, 29], [38, 29], [38, 33], [26, 33]], p.metal);
  c.fillCircle(32, 20, 2, p.gem);
}

function drawUtility(c: Canvas, p: Palette, rng: () => number): void {
  if (rng() < 0.6) {
    c.fillPolygon([[36, 7], [24, 32], [32, 32], [28, 55], [46, 27], [35, 27], [41, 7]], p.base);
    c.fillPolygon([[34, 13], [28, 28], [33, 28], [30, 42], [40, 25], [34, 25], [37, 13]], p.light);
  } else {
    c.fillDiamond(32, 20, 12, 14, p.base);
    c.fillDiamond(32, 20, 9, 11, p.dark);
    c.fillDiamond(32, 20, 3, 3, p.gem);
    c.fillCircle(32, 44, 2.4, p.gem);
  }
}

function drawSkill(c: Canvas, input: SkillIconInput, p: Palette, rng: () => number): void {
  const kind = String(input.kind || "").toLowerCase();
  if (kind === "attack") drawAttack(c, p, rng);
  else if (kind === "buff") drawBuff(c, p);
  else if (kind === "debuff") drawDebuff(c, p, rng);
  else if (kind === "heal") drawHeal(c, p);
  else if (kind === "shield") drawShield(c, p);
  else if (kind === "utility") drawUtility(c, p, rng);
  else if (kind === "passive") drawBuff(c, p);
  else drawAttack(c, p, rng);
}

export interface ItemIconInput {
  type: string;
  subtype?: string;
  name?: string;
  description?: string;
  rarity?: string;
  theme?: string;
  material?: string;
  color?: string;
  seed?: number;
}

export interface SkillIconInput {
  kind: string;
  name?: string;
  element?: string;
  rarity?: string;
  seed?: number;
}

function sparkleCount(rarity?: string): number {
  const key = String(rarity || "").toLowerCase();
  if (key === "mythic") return 26;
  if (key === "legendary") return 16;
  if (key === "epic") return 9;
  if (key === "rare") return 4;
  return 0;
}

async function encode(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toBuffer();
}

export async function renderItemIcon(input: ItemIconInput): Promise<Buffer> {
  const seed = Math.floor(input.seed ?? hashSeed(input.name ?? input.subtype ?? input.type));
  const rng = mulberry32(seed);
  const pal = resolveItemPalette(input, rng);
  const canvas = new Canvas();
  drawItem(canvas, input, pal, rng);
  canvas.applyShading(pal.light, pal.dark);
  canvas.applyOutline(pal.outline);
  canvas.sparkle(sparkleCount(input.rarity), lighten(pal.gem, 0.4), rng);
  return encode(canvas.buf);
}

export async function renderSkillIcon(input: SkillIconInput): Promise<Buffer> {
  const seed = Math.floor(input.seed ?? hashSeed(input.name ?? input.kind));
  const rng = mulberry32(seed);
  const pal = resolveSkillPalette(input, rng);
  const canvas = new Canvas();
  drawSkill(canvas, input, pal, rng);
  canvas.applyShading(pal.light, pal.dark);
  canvas.applyOutline(pal.outline);
  canvas.sparkle(sparkleCount(input.rarity), lighten(pal.gem, 0.4), rng);
  return encode(canvas.buf);
}
