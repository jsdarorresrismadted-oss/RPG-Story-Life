import sharp from "sharp";

const SIZE = 64;

type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 255): number => Math.max(lo, Math.min(hi, Math.round(v)));

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lighten = (c: RGB, t: number): RGB => mix(c, [255, 255, 255], t);
const darken = (c: RGB, t: number): RGB => mix(c, [0, 0, 0], t);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hue2rgb(p, q, h + 1 / 3) * 255),
    clamp(hue2rgb(p, q, h) * 255),
    clamp(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function hueShift(c: RGB, deg: number): RGB {
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  return hslToRgb(h + deg, s, l);
}

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

  fillGradientPolygon(pts: [number, number][], colorFn: (t: number) => RGB, from: [number, number], to: [number, number]): void {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const lenSq = dx * dx + dy * dy || 1;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.floor(Math.min(...xs));
    const maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!pointInPolygon(x, y, pts)) continue;
        const t = ((x - from[0]) * dx + (y - from[1]) * dy) / lenSq;
        this.setPx(x, y, colorFn(clamp(t, 0, 1)));
      }
    }
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

  paintBackground(fn: (x: number, y: number) => RGB | null): void {
    const src = Buffer.from(this.buf);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        if (src[i + 3] > 0) continue;
        const col = fn(x, y);
        if (col) this.setPx(x, y, col);
      }
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
  const shifted = hueShift(base, (rng() * 48 - 24) + ((rng() < 0.35 ? 120 : 0)));
  const jittered: RGB = [
    clamp(shifted[0] + (rng() * 30 - 15)),
    clamp(shifted[1] + (rng() * 30 - 15)),
    clamp(shifted[2] + (rng() * 30 - 15)),
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
  const shifted = hueShift(base, (rng() * 40 - 20));
  const jittered: RGB = [
    clamp(shifted[0] + (rng() * 26 - 13)),
    clamp(shifted[1] + (rng() * 26 - 13)),
    clamp(shifted[2] + (rng() * 26 - 13)),
  ];
  return basePalette(jittered, rarityColor(input.rarity));
}

function rarityColor(rarity?: string): RGB {
  const key = String(rarity || "").toLowerCase();
  return RARITY_COLORS[key] || RARITY_COLORS.common;
}

const RAINBOW: RGB[] = [
  [222, 62, 62],
  [232, 128, 52],
  [236, 208, 74],
  [88, 196, 96],
  [74, 196, 214],
  [82, 138, 240],
  [170, 92, 240],
];

function sectionGradient(stops: RGB[]): (t: number) => RGB {
  return (t: number): RGB => {
    const scaled = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    return mix(stops[i], stops[i + 1], scaled - i);
  };
}

function bladeGradient(p: Palette): (t: number) => RGB {
  return (t: number): RGB => {
    const light = mix(p.light, p.base, 0.4);
    const mid = p.base;
    const dark = mix(p.base, p.dark, 0.7);
    if (t < 0.5) return mix(light, mid, t * 2);
    return mix(mid, dark, (t - 0.5) * 2);
  };
}

function isRainbow(input: ItemIconInput): boolean {
  const joined = [input.theme, input.material, input.color, input.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(rainbow|arco.?iris|spectrum|prism)/.test(joined);
}

function drawSword(c: Canvas, p: Palette, rng: () => number, input?: ItemIconInput): void {
  const gradient = (input && isRainbow(input)) ? sectionGradient(RAINBOW) : bladeGradient(p);
  const v = rng();
  if (v < 0.4) {
    c.fillGradientPolygon([[24, 8], [34, 18], [30, 44], [24, 44]], gradient, [24, 8], [30, 44]);
    c.fillGradientPolygon([[24, 8], [34, 18], [32, 20], [26, 10]], gradient, [24, 8], [30, 44]);
  } else {
    c.fillGradientPolygon([[26, 8], [36, 20], [31, 44], [25, 44]], gradient, [26, 8], [31, 44]);
    c.fillGradientPolygon([[26, 8], [36, 20], [34, 22], [28, 10]], gradient, [26, 8], [31, 44]);
  }
  c.fillPolygon([[18, 34], [44, 30], [44, 34], [18, 38]], p.metal);
  c.fillPolygon([[22, 30], [26, 29], [24, 35], [20, 36]], p.metal);
  c.fillPolygon([[40, 29], [44, 28], [44, 34], [40, 33]], p.metal);
  c.fillPolygon([[24, 38], [28, 37], [27, 46], [23, 47]], p.dark);
  c.fillPolygon([[23, 47], [27, 46], [28, 53], [22, 54]], p.dark);
  c.fillCircle(25, 55, 2.6, p.gem);
  c.fillCircle(24, 54, 1.2, p.light);
  c.fillCircle(20, 36, 2, p.gem);
  c.fillCircle(42, 31, 2, p.gem);
  c.fillDiamond(26, 18, 1.6, 2.4, p.light);
}

function drawDagger(c: Canvas, p: Palette, rng: () => number): void {
  const v = rng();
  if (v < 0.5) {
    c.fillPolygon([[32, 7], [29, 12], [35, 12]], p.base);
    c.fillPolygon([[29, 12], [35, 12], [37, 30], [37, 33], [27, 33], [27, 30]], p.base);
    c.fillPolygon([[30, 13], [31, 13], [31, 30], [28, 30], [28, 25], [30, 13]], p.light);
    c.fillPolygon([[23, 33], [41, 33], [41, 37], [23, 37]], p.metal);
    c.fillPolygon([[30, 37], [34, 37], [34, 44], [30, 44]], p.dark);
    c.fillCircle(32, 47, 2, p.gem);
  } else {
    c.fillPolygon([[33, 8], [30, 13], [35, 13]], p.base);
    c.fillPolygon([[30, 13], [35, 13], [38, 32], [38, 35], [28, 35], [28, 32]], p.base);
    c.fillPolygon([[31, 14], [32, 14], [32, 32], [29, 32], [29, 27], [31, 14]], p.light);
    c.fillPolygon([[24, 35], [42, 35], [42, 39], [24, 39]], p.metal);
    c.fillPolygon([[30, 39], [34, 39], [34, 46], [30, 46]], p.dark);
    c.fillDiamond(32, 49, 2, 2.4, p.gem);
  }
}

function drawStaff(c: Canvas, p: Palette, rng: () => number): void {
  const v = rng();
  if (v < 0.5) {
    c.fillCircle(32, 11, 5.5, p.gem);
    c.fillCircle(31, 10, 2.5, p.light);
    c.fillPolygon([[27, 19], [37, 19], [37, 26], [27, 26]], p.metal);
    c.fillPolygon([[30, 24], [34, 24], [34, 56], [30, 56]], p.wood);
    c.fillPolygon([[30, 56], [34, 56], [32, 61]], p.metal);
    c.fillPolygon([[28, 19], [32, 19], [30, 23], [26, 23]], p.light);
  } else {
    c.fillDiamond(32, 12, 5, 7, p.gem);
    c.fillDiamond(31, 11, 2.5, 3.5, p.light);
    c.fillPolygon([[30, 21], [34, 21], [34, 56], [30, 56]], p.wood);
    c.fillCircle(32, 24, 2, p.metal);
    c.fillCircle(32, 52, 2, p.metal);
    c.fillPolygon([[30, 56], [34, 56], [32, 61]], p.metal);
  }
}

function drawAxe(c: Canvas, p: Palette, rng: () => number): void {
  const v = rng();
  if (v < 0.5) {
    c.line(18, 58, 44, 22, 4, p.wood);
    c.line(19, 57, 43, 23, 1.6, p.light);
    c.fillPolygon([[28, 8], [50, 18], [54, 28], [46, 32], [38, 30], [32, 24], [30, 14]], p.metal);
    c.fillPolygon([[30, 14], [32, 24], [38, 30], [40, 26], [36, 18]], p.light);
    c.fillCircle(46, 10, 2.4, p.gem);
  } else {
    c.line(24, 58, 40, 18, 4, p.wood);
    c.fillPolygon([[20, 12], [36, 8], [52, 16], [54, 24], [46, 28], [38, 24], [32, 18]], p.metal);
    c.fillPolygon([[22, 12], [28, 10], [34, 16], [38, 22], [32, 18], [26, 16]], p.light);
    c.fillCircle(28, 16, 2.4, p.gem);
  }
}

function drawTome(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[15, 9], [49, 9], [49, 36], [15, 36]], p.base);
  c.fillPolygon([[28, 9], [36, 9], [36, 36], [28, 36]], p.dark);
  c.fillPolygon([[16, 11], [26, 11], [26, 34], [16, 34]], p.light);
  c.fillPolygon([[38, 11], [48, 11], [48, 34], [38, 34]], p.light);
  c.fillPolygon([[13, 36], [51, 36], [51, 43], [13, 43]], p.dark);
  c.fillPolygon([[28, 36], [36, 36], [32, 46]], p.accent);
  if (rng() < 0.5) c.fillDiamond(32, 22, 3, 4, p.gem);
  else c.fillCircle(32, 22, 3, p.gem);
}

function drawBow(c: Canvas, p: Palette, rng: () => number): void {
  c.arc(32, 34, 20, 20, 200, 340, 5, p.wood);
  c.arc(32, 34, 20, 20, 205, 335, 1.6, p.light);
  c.line(15, 28, 49, 28, 1.2, p.light);
  if (rng() < 0.6) c.fillCircle(32, 28, 1.6, p.gem);
}

function drawCap(c: Canvas, p: Palette, rng: () => number): void {
  c.fillEllipse(32, 34, 21, 16, p.base);
  c.fillEllipse(27, 27, 10, 7, p.light);
  c.fillPolygon([[11, 38], [53, 38], [53, 43], [11, 43]], p.accent);
  if (rng() < 0.5) c.fillPolygon([[45, 43], [58, 43], [58, 46], [45, 46]], p.base);
  else c.fillCircle(32, 27, 2.4, p.gem);
}

function drawHelmet(c: Canvas, p: Palette, rng: () => number): void {
  c.fillEllipse(32, 32, 19, 20, p.base);
  c.fillEllipse(27, 24, 9, 8, p.light);
  c.fillPolygon([[24, 36], [40, 36], [38, 47], [26, 47]], p.outline);
  c.fillPolygon([[26, 38], [38, 38], [37, 44], [27, 44]], p.dark);
  c.fillCircle(15, 40, 2, p.metal);
  c.fillCircle(49, 40, 2, p.metal);
  if (rng() < 0.5) c.fillPolygon([[30, 11], [34, 11], [36, 22], [30, 22]], p.accent);
}

function drawCrown(c: Canvas, p: Palette, rng: () => number): void {
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

function drawHood(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[32, 5], [52, 26], [48, 52], [16, 52], [12, 26]], p.base);
  c.fillPolygon([[26, 10], [32, 5], [52, 26], [40, 26]], p.light);
  c.fillEllipse(32, 42, 10, 14, p.outline);
  c.fillEllipse(32, 42, 8, 12, p.dark);
}

function drawLightArmor(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[20, 20], [44, 20], [48, 44], [40, 58], [24, 58], [16, 44]], p.base);
  c.fillPolygon([[14, 20], [26, 20], [24, 32], [12, 30]], p.dark);
  c.fillPolygon([[38, 20], [50, 20], [52, 30], [40, 32]], p.dark);
  c.fillPolygon([[26, 22], [38, 22], [36, 27], [28, 27]], p.light);
  c.fillPolygon([[22, 46], [42, 46], [42, 52], [22, 52]], p.accent);
  if (rng() < 0.5) c.fillDiamond(32, 49, 3, 3, p.metal);
  else c.fillCircle(32, 49, 2.6, p.gem);
}

function drawHeavyArmor(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[20, 18], [44, 18], [50, 46], [40, 60], [24, 60], [14, 46]], p.base);
  c.fillCircle(16, 22, 8, p.dark);
  c.fillCircle(48, 22, 8, p.dark);
  c.fillCircle(16, 22, 5, p.metal);
  c.fillCircle(48, 22, 5, p.metal);
  c.fillPolygon([[28, 22], [36, 22], [36, 28], [28, 28]], p.light);
  if (rng() < 0.5) c.fillDiamond(32, 36, 6, 7, p.gem);
  else c.fillCircle(32, 36, 4, p.gem);
  c.fillCircle(26, 24, 1.5, p.metal);
  c.fillCircle(38, 24, 1.5, p.metal);
  c.fillPolygon([[20, 48], [44, 48], [44, 54], [20, 54]], p.accent);
}

function drawRobe(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[22, 16], [42, 16], [52, 30], [48, 60], [16, 60], [12, 30]], p.base);
  c.fillPolygon([[24, 18], [40, 18], [32, 30]], p.outline);
  c.fillPolygon([[26, 20], [38, 20], [32, 28]], p.dark);
  c.fillPolygon([[24, 20], [42, 20], [40, 26], [26, 26]], p.light);
  c.fillPolygon([[20, 38], [44, 38], [44, 44], [20, 44]], p.accent);
  c.fillPolygon([[16, 56], [48, 56], [48, 60], [16, 60]], p.accent);
  c.fillCircle(32, 30, 2.5, p.metal);
}

function drawCape(c: Canvas, p: Palette, rng: () => number): void {
  c.fillPolygon([[26, 10], [38, 10], [44, 22], [52, 34], [56, 54], [44, 60], [20, 60], [8, 54], [12, 34], [20, 22]], p.base);
  c.fillPolygon([[28, 14], [36, 14], [30, 32], [34, 48], [30, 58], [26, 58], [22, 46], [26, 30]], p.dark);
  c.fillPolygon([[27, 12], [37, 12], [37, 15], [27, 15]], p.light);
  if (rng() < 0.5) c.fillCircle(32, 12, 3, p.metal);
  else c.fillCircle(32, 12, 2.4, p.gem);
}

function drawGenericGem(c: Canvas, p: Palette): void {
  c.fillPolygon([[32, 10], [52, 32], [32, 54], [12, 32]], p.base);
  c.fillPolygon([[32, 10], [52, 32], [32, 32], [32, 10]], p.light);
  c.fillPolygon([[32, 32], [52, 32], [32, 54]], p.dark);
  c.fillDiamond(32, 32, 3, 3, p.gem);
}

function detectElement(input: ItemIconInput): string | null {
  const joined = [input.theme, input.material, input.color, input.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/(fire|fogo|flame|chama)/.test(joined)) return "fire";
  if (/(ice|gelo|frost|frio|cryo)/.test(joined)) return "ice";
  if (/(thunder|raio|storm|tempestade|eletric)/.test(joined)) return "thunder";
  if (/(nature|natureza|floresta|forest|leaf|folha|poison|veneno)/.test(joined)) return "nature";
  if (/(light|luz|sagrad|holy|divin)/.test(joined)) return "light";
  if (/(dark|sombra|shadow|obscur|void)/.test(joined)) return "dark";
  if (/(arcane|arcano|magi|magic|runa)/.test(joined)) return "arcane";
  if (/(earth|terra|rocha|stone|pedra|obsidian|miner)/.test(joined)) return "earth";
  if (/(water|agua|ocean|oceano|mar\b|rio)/.test(joined)) return "water";
  return null;
}

function drawFlames(c: Canvas, p: Palette, rng: () => number): void {
  const flame = ELEMENT_COLORS.fire;
  const core = lighten(flame, 0.45);
  const x = 32;
  const y = 12;
  c.fillTriangle([x - 2, y], [x + 2, y], [x, y - 6], core);
  c.fillTriangle([x - 4, y + 2], [x - 1, y + 2], [x - 2, y - 4], flame);
  c.fillTriangle([x + 1, y + 2], [x + 4, y + 2], [x + 2, y - 4], flame);
  if (rng() < 0.5) c.fillCircle(x, y - 7, 1, core);
}

function drawIceShards(c: Canvas, p: Palette, rng: () => number): void {
  const ice = ELEMENT_COLORS.ice;
  const light = lighten(ice, 0.5);
  c.fillTriangle([32, 6], [29, 14], [35, 14], ice);
  c.fillTriangle([32, 8], [30.5, 12], [33.5, 12], light);
  if (rng() < 0.6) {
    c.fillTriangle([24, 12], [22, 16], [26, 16], ice);
    c.fillTriangle([40, 12], [38, 16], [42, 16], ice);
  }
}

function drawThunder(c: Canvas, p: Palette, rng: () => number): void {
  const bolt = ELEMENT_COLORS.thunder;
  c.fillPolygon([[34, 8], [28, 22], [33, 22], [30, 32], [38, 18], [33, 18], [36, 8]], bolt);
  if (rng() < 0.5) c.fillCircle(24, 8, 1.5, bolt);
  if (rng() < 0.5) c.fillCircle(42, 10, 1.5, bolt);
}

function drawSparkles(c: Canvas, p: Palette, rng: () => number, count: number): void {
  const col = ELEMENT_COLORS.arcane;
  for (let i = 0; i < count; i++) {
    const x = 10 + rng() * 44;
    const y = 8 + rng() * 48;
    c.setPx(x, y, col);
    c.setPx(x, y + 1, col);
    c.setPx(x + 1, y, col);
    c.setPx(x - 1, y, col);
    c.setPx(x, y - 1, col);
  }
}

function applyElement(c: Canvas, p: Palette, input: ItemIconInput, rng: () => number): void {
  const el = detectElement(input);
  if (!el) return;
  if (el === "fire") drawFlames(c, p, rng);
  else if (el === "ice") drawIceShards(c, p, rng);
  else if (el === "thunder") drawThunder(c, p, rng);
  else drawSparkles(c, p, rng, el === "dark" ? 14 : 8);
}

function drawItem(c: Canvas, input: ItemIconInput, p: Palette, rng: () => number): void {
  const subtype = String(input.subtype || "").toLowerCase();
  const type = String(input.type || "").toLowerCase();
  const swordLike = subtype === "sword" || subtype === "espada" || (!subtype && type === "weapon");
  if (type === "weapon" || subtype === "weapon") {
    if (subtype === "dagger" || subtype === "adaga") drawDagger(c, p, rng);
    else if (subtype === "staff" || subtype === "cajado" || subtype === "stave") drawStaff(c, p, rng);
    else if (subtype === "axe" || subtype === "machado") drawAxe(c, p, rng);
    else if (subtype === "tome" || subtype === "grimorio") drawTome(c, p, rng);
    else if (subtype === "bow" || subtype === "arco") drawBow(c, p, rng);
    else if (swordLike) drawSword(c, p, rng, input);
    else {
      const shapes: ((c: Canvas, p: Palette, rng: () => number) => void)[] = [drawAxe, drawStaff, drawTome, drawDagger];
      shapes[Math.floor(rng() * shapes.length)](c, p, rng);
    }
    applyElement(c, p, input, rng);
    return;
  }
  if (type === "helm" || subtype === "helm") {
    if (subtype === "cap" || subtype === "gorro" || subtype === "chapeu") drawCap(c, p, rng);
    else if (subtype === "crown" || subtype === "coroa") drawCrown(c, p, rng);
    else if (subtype === "hood" || subtype === "capuz") drawHood(c, p, rng);
    else if (subtype === "helmet" || subtype === "elmo" || subtype === "capacete") drawHelmet(c, p, rng);
    else {
      const shapes: ((c: Canvas, p: Palette, rng: () => number) => void)[] = [drawHelmet, drawCap, drawCrown, drawHood];
      shapes[Math.floor(rng() * shapes.length)](c, p, rng);
    }
    applyElement(c, p, input, rng);
    return;
  }
  if (type === "armor" || subtype === "armor" || type === "armadura") {
    if (subtype === "light" || subtype === "leve" || subtype === "couro") drawLightArmor(c, p, rng);
    else if (subtype === "heavy" || subtype === "pesada" || subtype === "placa") drawHeavyArmor(c, p, rng);
    else if (subtype === "robe" || subtype === "veste" || subtype === "manto") drawRobe(c, p, rng);
    else {
      const shapes: ((c: Canvas, p: Palette, rng: () => number) => void)[] = [drawHeavyArmor, drawLightArmor, drawRobe];
      shapes[Math.floor(rng() * shapes.length)](c, p, rng);
    }
    applyElement(c, p, input, rng);
    return;
  }
  if (type === "cape" || subtype === "cape" || subtype === "capa") {
    drawCape(c, p, rng);
    applyElement(c, p, input, rng);
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

function drawMagicDust(c: Canvas, rarity: string | undefined, rng: () => number): void {
  const count = sparkleCount(rarity);
  if (count === 0) return;
  const dustColors: RGB[] = [
    [240, 244, 250],
    [240, 210, 96],
    [120, 160, 244],
    [220, 140, 244],
  ];
  for (let i = 0; i < count; i++) {
    const col = dustColors[Math.floor(rng() * dustColors.length)];
    const x = 6 + rng() * (SIZE - 12);
    const y = 6 + rng() * (SIZE - 12);
    c.setPx(x, y, col);
    if (rng() < 0.5) c.setPx(x + 1, y, col);
  }
}

// Fundo de masmorra: pedras escuras + moldura rústica com runas e brilho da raridade.
function dungeonBackdrop(p: Palette, rng: () => number): (x: number, y: number) => RGB | null {
  const frame = 4;
  const stoneBase: RGB = [52, 48, 62];
  const stoneLight = lighten(stoneBase, 0.12);
  const stoneDark = darken(stoneBase, 0.22);
  const stoneMid: RGB = [68, 62, 80];
  const mortar: RGB = [28, 26, 34];

  const brickWidth = 10;
  const brickHeight = 8;
  const bricks: number[] = [];
  const cols = Math.ceil(SIZE / brickWidth);
  const rows = Math.ceil(SIZE / brickHeight);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      bricks.push(rng() < 0.35 ? 1 : 0);
    }
  }

  const runeSpots: [number, number, number][] = [];
  const runeCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < runeCount; i++) {
    const spot: [number, number, number] = [frame + Math.floor(rng() * (SIZE - frame * 2)), frame + Math.floor(rng() * (SIZE - frame * 2)), Math.floor(rng() * 2)];
    runeSpots.push(spot);
  }
  const isFrame = (x: number, y: number): boolean => x < frame || y < frame || x >= SIZE - frame || y >= SIZE - frame;
  return (x: number, y: number): RGB | null => {
    if (isFrame(x, y)) {
      const onCorner = (x < 2 || x >= SIZE - 2) && (y < 2 || y >= SIZE - 2);
      if (onCorner) return stoneMid;
      const nearOuter = x < 1 || y < 1 || x >= SIZE - 1 || y >= SIZE - 1;
      return nearOuter ? stoneDark : stoneBase;
    }
    for (const [rx, ry, kind] of runeSpots) {
      if (kind === 0 && Math.abs(x - rx) <= 1 && Math.abs(y - ry) <= 1) return p.gem;
      if (kind === 1 && Math.abs(x - rx) <= 2 && y === ry) return p.gem;
    }
    const col = Math.floor(x / brickWidth);
    const row = Math.floor(y / brickHeight);
    const b = bricks[row * cols + col] ?? 0;
    return b === 1 ? stoneLight : stoneMid;
  };
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
  canvas.paintBackground(dungeonBackdrop(pal, rng));
  drawMagicDust(canvas, input.rarity, rng);
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
  canvas.paintBackground(dungeonBackdrop(pal, rng));
  canvas.sparkle(sparkleCount(input.rarity), lighten(pal.gem, 0.4), rng);
  return encode(canvas.buf);
}
