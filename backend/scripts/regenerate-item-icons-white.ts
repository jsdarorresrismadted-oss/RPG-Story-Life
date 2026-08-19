import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const base = path.resolve(__dirname, '../../frontend/public');
const W = '#ffffff';

const icons: Record<string, { dir: string; svg: string }> = {
  armor: {
    dir: 'armoricon',
    svg: `<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 18 L32 14 L44 18 L46 22 L44 50 L20 50 L18 22 Z" fill="none" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M24 20 L32 17 L40 20 L41 23 L39 48 L25 48 L23 23 Z" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>
      <path d="M28 22 L36 22 L36 30 L28 30 Z" fill="none" stroke="${W}" stroke-width="2"/>
      <line x1="32" y1="30" x2="32" y2="48" stroke="${W}" stroke-width="2" opacity="0.7"/>
      <path d="M18 20 L14 28 L18 30" fill="none" stroke="${W}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M46 20 L50 28 L46 30" fill="none" stroke="${W}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="32" y1="10" x2="32" y2="14" stroke="${W}" stroke-width="2" opacity="0.5"/>
      <line x1="24" y1="12" x2="26" y2="16" stroke="${W}" stroke-width="2" opacity="0.5"/>
      <line x1="40" y1="12" x2="38" y2="16" stroke="${W}" stroke-width="2" opacity="0.5"/>
    </svg>`,
  },
  cape: {
    dir: 'cloakicon',
    svg: `<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 12 L42 12 L44 16 L46 52 L38 58 L32 56 L26 58 L18 52 L20 16 Z" fill="none" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M24 14 L40 14 L42 17 L44 50 L37 55 L32 53 L27 55 L20 50 L22 17 Z" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>
      <line x1="32" y1="12" x2="32" y2="17" stroke="${W}" stroke-width="2" opacity="0.8"/>
      <circle cx="32" cy="14" r="2.5" fill="${W}"/>
      <path d="M22 30 Q32 35 42 30" fill="none" stroke="${W}" stroke-width="2" opacity="0.5"/>
      <path d="M20 40 Q32 45 44 40" fill="none" stroke="${W}" stroke-width="2" opacity="0.5"/>
      <line x1="32" y1="6" x2="32" y2="10" stroke="${W}" stroke-width="2" opacity="0.5"/>
    </svg>`,
  },
  helm: {
    dir: 'helmeticon',
    svg: `<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 34 L32 12 L46 34 L44 44 L20 44 Z" fill="none" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M20 33 L32 14 L44 33 L42 42 L22 42 Z" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>
      <path d="M22 32 L42 32 L41 38 L23 38 Z" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round"/>
      <line x1="28" y1="32" x2="28" y2="38" stroke="${W}" stroke-width="2" opacity="0.7"/>
      <line x1="32" y1="32" x2="32" y2="38" stroke="${W}" stroke-width="2" opacity="0.7"/>
      <line x1="36" y1="32" x2="36" y2="38" stroke="${W}" stroke-width="2" opacity="0.7"/>
      <line x1="32" y1="12" x2="32" y2="6" stroke="${W}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M18 34 L14 40 L20 44" fill="none" stroke="${W}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M46 34 L50 40 L44 44" fill="none" stroke="${W}" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>`,
  },
  mace: {
    dir: 'weaponicon',
    svg: `<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <line x1="32" y1="26" x2="32" y2="52" stroke="${W}" stroke-width="4" stroke-linecap="round"/>
      <path d="M16 14 L48 14 L50 24 L14 24 Z" fill="none" stroke="${W}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M18 16 L46 16 L48 22 L16 22 Z" fill="none" stroke="${W}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>
      <line x1="14" y1="14" x2="14" y2="24" stroke="${W}" stroke-width="2.5" opacity="0.8"/>
      <line x1="50" y1="14" x2="50" y2="24" stroke="${W}" stroke-width="2.5" opacity="0.8"/>
      <circle cx="32" cy="19" r="2.5" fill="${W}"/>
      <line x1="28" y1="54" x2="36" y2="54" stroke="${W}" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="6" x2="32" y2="12" stroke="${W}" stroke-width="2" opacity="0.5"/>
    </svg>`,
  },
  longsword: {
    dir: 'weaponicon',
    svg: `<svg width="512" height="512" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <line x1="32" y1="8" x2="32" y2="42" stroke="${W}" stroke-width="4" stroke-linecap="round"/>
      <path d="M32 8 L35 5 L32 2 L29 5 Z" fill="${W}"/>
      <line x1="24" y1="42" x2="40" y2="42" stroke="${W}" stroke-width="3" stroke-linecap="round"/>
      <line x1="22" y1="45" x2="42" y2="45" stroke="${W}" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
      <line x1="32" y1="47" x2="32" y2="56" stroke="${W}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="32" cy="59" r="2.5" fill="${W}"/>
      <line x1="32" y1="10" x2="32" y2="40" stroke="${W}" stroke-width="1" opacity="0.4"/>
    </svg>`,
  },
};

async function main() {
  for (const [name, { dir, svg }] of Object.entries(icons)) {
    const outDir = path.join(base, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${name}.png`);
    const buf = Buffer.from(svg);
    await sharp(buf).png().toFile(file);
    console.log(`${dir}/${name}.png: ${fs.statSync(file).size} bytes`);
  }
  console.log('OK');
}

main().catch((e) => { console.error(e.message); process.exit(1); });