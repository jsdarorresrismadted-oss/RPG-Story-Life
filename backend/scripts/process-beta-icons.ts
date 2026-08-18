import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { openTunnel } from './db-tunnel';

const src = 'C:/Users/Dark/Desktop/Beta Tester.png';
const outDir = path.resolve(__dirname, '../../frontend/public/iconskill');
const names = [
  'beta-comando-basico',
  'beta-injecao-de-bug',
  'beta-overclock-de-sistema',
  'beta-exploit-de-vulnerabilidade',
  'beta-crash-de-realidade',
];

async function main() {
  const meta = await sharp(src).metadata();
  console.log(`Original: ${meta.width}x${meta.height}`);

  const cellW = Math.floor(meta.width! / 5);
  const cellH = meta.height!;
  const size = Math.min(cellW, cellH);

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < 5; i++) {
    const left = i * cellW + Math.floor((cellW - size) / 2);
    const top = Math.floor((cellH - size) / 2);

    const { data, info } = await sharp(src)
      .extract({ left, top, width: size, height: size })
      .resize(64, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    for (let p = 0; p < data.length; p += channels) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      if (r < 30 && g < 30 && b < 30) {
        data[p + 3] = 0;
      }
    }

    const png = await sharp(data, { raw: { width: 64, height: 64, channels } })
      .png()
      .toBuffer();

    const file = path.join(outDir, names[i] + '.png');
    fs.writeFileSync(file, png);
    console.log(`${names[i]}.png: ${png.length} bytes`);
  }

  const tunnel = await openTunnel();
  const p = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    const classes = await p.gameClass.findMany({ select: { id: true } });
    const classIds = classes.map(c => c.id);
    const result = await p.skill.updateMany({
      where: { classId: { in: classIds } },
      data: { iconSecondary: null },
    });
    console.log(`iconSecondary removido de ${result.count} skills`);
  } finally {
    await p.$disconnect().catch(() => {});
    tunnel.close();
  }

  console.log('OK');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
