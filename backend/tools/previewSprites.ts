// ===== VISUALIZADOR DE SPRITES =====
// Gera grids de comparação de sprites gerados pelo pixelArt.ts.
// Uso: npx tsx tools/previewSprites.ts [tema1,tema2,...] [subtipo1,...]
// Ex: npx tsx tools/previewSprites.ts steel,fire dagger,sword,axe,staff,bow

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { renderItemIcon } from "../src/core/ai/pixelArt";

const OUT_DIR = path.resolve(__dirname, "../previews");

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const themes = (process.argv[2] || "steel,fire,ice,shadow,nature").split(",").filter(Boolean);
  const subtypes = (process.argv[3] || "dagger,sword,axe,staff,bow").split(",").filter(Boolean);

  const size = 64;
  const pad = 8;
  const header = 40;
  const W = size * subtypes.length + pad * (subtypes.length + 1);
  const H = header + size * themes.length + pad * (themes.length + 1);

  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 25, g: 25, b: 35, alpha: 1 } },
  }).png().toBuffer();

  const comps: sharp.OverlayOptions[] = [];
  for (let row = 0; row < themes.length; row++) {
    for (let col = 0; col < subtypes.length; col++) {
      const buf = await renderItemIcon({ type: "weapon", subtype: subtypes[col], theme: themes[row], seed: 42 });
      comps.push({ input: buf, left: pad + col * (size + pad), top: header + pad + row * (size + pad) });
    }
  }

  const filename = `grid-${themes.join("-")}-${subtypes.join("-")}.png`;
  await sharp(base).composite(comps).png().toFile(path.join(OUT_DIR, filename));
  console.log(`Grid salvo em previews/${filename}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
