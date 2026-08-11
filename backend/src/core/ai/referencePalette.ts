import sharp from "sharp";
import { AppError } from "../middleware/errorHandler";
import type { Palette } from "./pixelArt";

export type { Palette } from "./pixelArt";

const lum = (c: number[]): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Decodifica um buffer PNG (ou .piskel JSON com PNG base64) e devolve os pixels opacos.
async function opaquePixels(buf: Buffer): Promise<[number, number, number][]> {
  let png: Buffer;
  if (buf.length > 0 && buf[0] === 0x7b) {
    // começa com '{' -> provavelmente .piskel
    const src = JSON.parse(buf.toString("utf8"));
    const layer = JSON.parse(src.piskel.layers[0]);
    const b64 = layer.chunks[0].base64PNG.replace(/^data:image\/png;base64,/, "");
    png = Buffer.from(b64, "base64");
  } else {
    png = buf;
  }
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const opaque: [number, number, number][] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] > 30) {
        opaque.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }
  return opaque;
}

// Extrai uma paleta de 6 tons a partir de um sprite de referencia:
// outline, dark, base, light, metal, gem. Ordena por luminancia em 5 faixas
// e escolhe a gema como o tom mais saturado (ignorando pretos).
export async function extractReferencePalette(buf: Buffer): Promise<Palette> {
  const opaque = await opaquePixels(buf);
  if (opaque.length < 20) throw new AppError(400, "Referencia invalida: sprite muito pequeno ou transparente");

  const sorted = [...opaque].sort((a, b) => lum(a) - lum(b));
  const buckets = 5;
  const n = sorted.length;
  const sliceAvg = (start: number, end: number): RGB => {
    const s = sorted.slice(start, Math.min(end, n));
    if (s.length === 0) return [0, 0, 0];
    return [
      Math.round(s.reduce((acc, c) => acc + c[0], 0) / s.length),
      Math.round(s.reduce((acc, c) => acc + c[1], 0) / s.length),
      Math.round(s.reduce((acc, c) => acc + c[2], 0) / s.length),
    ];
  };
  const [o0, o1] = [0, Math.floor(n / buckets)];
  const [d0, d1] = [Math.floor(n / buckets), Math.floor((2 * n) / buckets)];
  const [b0, b1] = [Math.floor((2 * n) / buckets), Math.floor((3 * n) / buckets)];
  const [m0, m1] = [Math.floor((3 * n) / buckets), Math.floor((4 * n) / buckets)];
  const [l0, l1] = [Math.floor((4 * n) / buckets), n];

  const saturation = (c: number[]): number => {
    const max = Math.max(...c);
    const min = Math.min(...c);
    return max === 0 ? 0 : (max - min) / max;
  };
  let gem: RGB = sorted[Math.floor(n / 2)].map(Math.round) as RGB;
  let bestSat = -1;
  for (const c of sorted) {
    if (c[0] < 90 && c[1] < 90 && c[2] < 90) continue;
    const s = saturation(c);
    if (s > bestSat) { bestSat = s; gem = c.map(Math.round) as RGB; }
  }

  const base = sliceAvg(b0, b1);
  return {
    outline: sliceAvg(o0, o1),
    dark: sliceAvg(d0, d1),
    base,
    light: sliceAvg(l0, l1),
    metal: sliceAvg(m0, m1),
    gem,
    accent: gem,
    wood: [122, 82, 52],
  };
}

type RGB = [number, number, number];