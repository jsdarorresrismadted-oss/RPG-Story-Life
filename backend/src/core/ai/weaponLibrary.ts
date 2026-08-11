// ===== Biblioteca de armas de referencia =====
// Extrai armas individuais de um sprite sheet de referencia.
// A IA usa essas armas como base para criar novas armas,
// modificando cores e adicionando efeitos.

import sharp from "sharp";
import fs from "fs";
import path from "path";

const REFERENCE_DIR = path.resolve(__dirname, "../../../../Icons/references");
const CACHE_DIR = path.join(REFERENCE_DIR, "cache");

export interface WeaponSprite {
  data: Buffer;
  width: number;
  height: number;
  index: number;
}

// Garante que os diretorios existem
function ensureDirs(): void {
  fs.mkdirSync(REFERENCE_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Extrai armas individuais de um sprite sheet (grid de armas)
export async function extractWeaponsFromSheet(
  sheetPng: Buffer,
  cellSize: number = 16,
): Promise<WeaponSprite[]> {
  ensureDirs();

  const { data, info } = await sharp(sheetPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const cols = Math.floor(w / cellSize);
  const rows = Math.floor(h / cellSize);
  const weapons: WeaponSprite[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Extrai a celula
      const cellData = Buffer.alloc(cellSize * cellSize * 4);
      let hasContent = false;

      for (let y = 0; y < cellSize; y++) {
        for (let x = 0; x < cellSize; x++) {
          const srcX = col * cellSize + x;
          const srcY = row * cellSize + y;
          const srcI = (srcY * w + srcX) * 4;
          const dstI = (y * cellSize + x) * 4;

          cellData[dstI] = data[srcI];
          cellData[dstI + 1] = data[srcI + 1];
          cellData[dstI + 2] = data[srcI + 2];
          cellData[dstI + 3] = data[srcI + 3];

          if (data[srcI + 3] > 0) hasContent = true;
        }
      }

      // So adiciona se tiver conteudo (pixels opacos)
      if (hasContent) {
        weapons.push({
          data: cellData,
          width: cellSize,
          height: cellSize,
          index: row * cols + col,
        });
      }
    }
  }

  return weapons;
}

// Salva armas extraidas no cache
export async function saveWeaponCache(
  weapons: WeaponSprite[],
  packName: string,
): Promise<void> {
  ensureDirs();
  const packDir = path.join(CACHE_DIR, packName);
  fs.mkdirSync(packDir, { recursive: true });

  for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    const png = await sharp(w.data, {
      raw: { width: w.width, height: w.height, channels: 4 },
    })
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(packDir, `${i}.png`), png);
  }

  // Salva metadata
  fs.writeFileSync(
    path.join(packDir, "meta.json"),
    JSON.stringify({ count: weapons.length, cellSize: weapons[0]?.width || 16 }),
  );
}

// Carrega armas do cache
export async function loadWeaponCache(packName: string): Promise<WeaponSprite[]> {
  ensureDirs();
  const packDir = path.join(CACHE_DIR, packName);
  const metaPath = path.join(packDir, "meta.json");

  if (!fs.existsSync(metaPath)) return [];

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const weapons: WeaponSprite[] = [];

  for (let i = 0; i < meta.count; i++) {
    const filePath = path.join(packDir, `${i}.png`);
    if (!fs.existsSync(filePath)) continue;

    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    weapons.push({
      data: Buffer.from(data),
      width: info.width,
      height: info.height,
      index: i,
    });
  }

  return weapons;
}

// Seleciona uma arma aleatoria do cache
export function pickRandomWeapon(weapons: WeaponSprite[], seed: number): WeaponSprite {
  const idx = Math.abs(seed) % weapons.length;
  return weapons[idx];
}

// Muda as cores de uma arma (recolor)
export function recolorWeapon(
  weapon: WeaponSprite,
  newColors: { [old: string]: [number, number, number] },
): WeaponSprite {
  const out = Buffer.from(weapon.data);
  const tolerance = 30;

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;

    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];

    for (const [oldHex, newRgb] of Object.entries(newColors)) {
      const oldR = parseInt(oldHex.slice(0, 2), 16);
      const oldG = parseInt(oldHex.slice(2, 4), 16);
      const oldB = parseInt(oldHex.slice(4, 6), 16);

      const dist = Math.sqrt(
        (r - oldR) ** 2 + (g - oldG) ** 2 + (b - oldB) ** 2,
      );

      if (dist < tolerance) {
        const t = 0.7;
        out[i] = Math.round(oldR + (newRgb[0] - oldR) * t);
        out[i + 1] = Math.round(oldG + (newRgb[1] - oldG) * t);
        out[i + 2] = Math.round(oldB + (newRgb[2] - oldB) * t);
      }
    }
  }

  return { ...weapon, data: out };
}

// Redimensiona uma arma para 64x64
export async function resizeWeapon(weapon: WeaponSprite): Promise<Buffer> {
  return sharp(weapon.data, {
    raw: { width: weapon.width, height: weapon.height, channels: 4 },
  })
    .resize(64, 64, { kernel: "nearest" })
    .png()
    .toBuffer();
}

// Paletas de tema para recolor
export const THEME_PALETTES: Record<string, Record<string, [number, number, number]>> = {
  fire: {
    "808080": [200, 80, 0],   // cinza -> laranja
    "a0a0a0": [255, 120, 0],  // claro -> laranja claro
    "606060": [160, 40, 0],   // escuro -> vermelho escuro
    "c0c0c0": [255, 180, 0],  // branco -> dourado
  },
  ice: {
    "808080": [80, 160, 220],  // cinza -> azul gelo
    "a0a0a0": [150, 210, 255], // claro -> azul claro
    "606060": [40, 100, 160],  // escuro -> azul escuro
    "c0c0c0": [200, 230, 255], // branco -> branco gelo
  },
  lightning: {
    "808080": [200, 200, 80],  // cinza -> amarelo
    "a0a0a0": [255, 255, 150], // claro -> amarelo claro
    "606060": [160, 160, 40],  // escuro -> amarelo escuro
    "c0c0c0": [255, 255, 200], // branco -> branco amarelado
  },
  shadow: {
    "808080": [80, 0, 120],    // cinza -> roxo
    "a0a0a0": [120, 40, 160],  // claro -> roxo claro
    "606060": [40, 0, 80],     // escuro -> roxo escuro
    "c0c0c0": [160, 80, 200],  // branco -> roxo claro
  },
  nature: {
    "808080": [60, 140, 40],   // cinza -> verde
    "a0a0a0": [100, 180, 80],  // claro -> verde claro
    "606060": [30, 100, 20],   // escuro -> verde escuro
    "c0c0c0": [150, 220, 120], // branco -> verde claro
  },
  holy: {
    "808080": [200, 180, 100], // cinza -> dourado
    "a0a0a0": [255, 230, 150], // claro -> dourado claro
    "606060": [160, 140, 60],  // escuro -> dourado escuro
    "c0c0c0": [255, 250, 200], // branco -> branco dourado
  },
  dark: {
    "808080": [60, 0, 80],     // cinza -> roxo escuro
    "a0a0a0": [100, 20, 120],  // claro -> roxo medio
    "606060": [30, 0, 50],     // escuro -> preto roxo
    "c0c0c0": [140, 60, 180],  // branco -> roxo claro
  },
  arcane: {
    "808080": [120, 0, 200],   // cinza -> magenta
    "a0a0a0": [180, 60, 255],  // claro -> magenta claro
    "606060": [80, 0, 140],    // escuro -> magenta escuro
    "c0c0c0": [220, 120, 255], // branco -> magenta claro
  },
};
