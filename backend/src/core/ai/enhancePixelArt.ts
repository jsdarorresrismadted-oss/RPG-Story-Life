// ===== Aperfeicoamento programatico de pixel art (nosso motor grafico) =====
// Pega o sprite do usuario e adiciona efeitos visuais por cima:
// - Glow/sombra suave ao redor do item
// - Particulas de tema (fogo, gelo, etc.)
// - Aumento de contraste e saturacao
// - Outline mais forte
// Tudo 100% local, sem API externa.

import sharp from "sharp";

interface EnhanceOptions {
  theme?: string;
  glow?: boolean;
  particles?: boolean;
  contrast?: number;   // 1.0 = normal, 1.3 = mais contraste
  saturation?: number;  // 1.0 = normal, 1.5 = mais saturado
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Adiciona glow suave ao redor dos pixels opacos
function addGlow(data: Buffer, w: number, h: number, intensity: number): void {
  // Copia original
  const src = Buffer.from(data);
  const radius = 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) continue; // so em volta de pixels opacos

      // Verifica se tem pixel opaco perto
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          if (src[ni + 3] > 0) found = true;
        }
      }

      if (found) {
        // Glow branco suave
        const fade = intensity * 0.3;
        data[i] = clamp(data[i] + 255 * fade, 0, 255);
        data[i + 1] = clamp(data[i + 1] + 255 * fade, 0, 255);
        data[i + 2] = clamp(data[i + 2] + 255 * fade, 0, 255);
        data[i + 3] = clamp(data[i + 3] + 80 * fade, 0, 255);
      }
    }
  }
}

// Adiciona particulas de tema ao redor do item
function addParticles(data: Buffer, w: number, h: number, theme: string, seed: number): void {
  const themeColors: Record<string, [number, number, number][]> = {
    fire: [[255, 120, 0], [255, 80, 0], [255, 200, 0], [255, 60, 0]],
    ice: [[100, 200, 255], [150, 220, 255], [200, 240, 255], [80, 180, 255]],
    lightning: [[255, 255, 100], [200, 200, 255], [255, 255, 200], [180, 180, 255]],
    shadow: [[120, 0, 180], [80, 0, 120], [160, 0, 200], [60, 0, 100]],
    nature: [[0, 200, 0], [50, 180, 50], [0, 160, 0], [80, 200, 80]],
    holy: [[255, 255, 150], [255, 230, 100], [255, 255, 200], [255, 220, 80]],
    dark: [[100, 0, 150], [60, 0, 100], [140, 0, 180], [40, 0, 80]],
    arcane: [[150, 0, 255], [100, 0, 200], [180, 50, 255], [80, 0, 160]],
  };
  const colors = themeColors[theme] || themeColors.fire;

  // Hash simples para seed
  let h2 = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h2 ^= String(seed).charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }

  // Encontra bounding box do item
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Cola particulas ao redor do item
  const numParticles = 8 + (h2 % 8);
  for (let p = 0; p < numParticles; p++) {
    h2 = Math.imul(h2 ^ (p * 31), 16777619) >>> 0;
    const color = colors[h2 % colors.length];
    const angle = (h2 / 0xFFFFFFFF) * Math.PI * 2;
    const dist = 2 + (h2 % 6);
    const px = Math.round((minX + maxX) / 2 + Math.cos(angle) * dist * 3);
    const py = Math.round((minY + maxY) / 2 + Math.sin(angle) * dist * 3);
    const size = 1 + (h2 % 2);

    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = (ny * w + nx) * 4;
        if (data[ni + 3] > 0) continue; // nao sobrepoe o item
        const fade = 1 - Math.sqrt(dx * dx + dy * dy) / (size + 1);
        if (fade <= 0) continue;
        data[ni] = clamp(color[0] * fade + data[ni] * (1 - fade), 0, 255);
        data[ni + 1] = clamp(color[1] * fade + data[ni + 1] * (1 - fade), 0, 255);
        data[ni + 2] = clamp(color[2] * fade + data[ni + 2] * (1 - fade), 0, 255);
        data[ni + 3] = clamp(Math.round(200 * fade), 0, 255);
      }
    }
  }
}

// Aumenta contraste e saturacao
function enhanceColors(data: Buffer, w: number, h: number, contrast: number, saturation: number): void {
  for (let i = 0; i < w * h * 4; i += 4) {
    if (data[i + 3] === 0) continue;

    // Contraste
    let r = (data[i] / 255 - 0.5) * contrast + 0.5;
    let g = (data[i + 1] / 255 - 0.5) * contrast + 0.5;
    let b = (data[i + 2] / 255 - 0.5) * contrast + 0.5;

    // Saturacao
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    data[i] = clamp(Math.round(r * 255), 0, 255);
    data[i + 1] = clamp(Math.round(g * 255), 0, 255);
    data[i + 2] = clamp(Math.round(b * 255), 0, 255);
  }
}

export async function enhancePixelArt(
  inputPng: Buffer,
  options: EnhanceOptions = {},
): Promise<Buffer> {
  const { theme, glow = true, particles = true, contrast = 1.2, saturation = 1.3 } = options;
  const seed = Date.now();

  const { data, info } = await sharp(inputPng)
    .ensureAlpha()
    .resize(64, 64, { kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);

  // 1) Aumenta contraste e saturacao
  enhanceColors(out, w, h, contrast, saturation);

  // 2) Glow ao redor do item
  if (glow) {
    addGlow(out, w, h, 0.8);
  }

  // 3) Particulas de tema
  if (particles && theme) {
    addParticles(out, w, h, theme, seed);
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}
