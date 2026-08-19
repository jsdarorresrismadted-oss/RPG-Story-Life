import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const base = path.resolve(__dirname, '../../frontend/public');
const BG = '#1a1a2e';
const GOLD = '#d4a017';
const GOLD2 = '#b8860b';
const SILVER = '#a8a8a8';
const DARK = '#2d2d44';
const RED = '#8b0000';

const icons: Record<string, { dir: string; svg: string }> = {
  armor: {
    dir: 'armoricon',
    svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="${BG}" rx="8"/>
      <path d="M20 18 L32 14 L44 18 L46 22 L44 50 L20 50 L18 22 Z" fill="${SILVER}" stroke="#888" stroke-width="1"/>
      <path d="M24 20 L32 17 L40 20 L41 23 L39 48 L25 48 L23 23 Z" fill="${DARK}" stroke="#666" stroke-width="0.5"/>
      <path d="M28 22 L36 22 L36 30 L28 30 Z" fill="${GOLD}" opacity="0.6"/>
      <line x1="32" y1="30" x2="32" y2="48" stroke="#666" stroke-width="0.5"/>
      <path d="M18 20 L14 28 L18 30" fill="none" stroke="${SILVER}" stroke-width="2"/>
      <path d="M46 20 L50 28 L46 30" fill="none" stroke="${SILVER}" stroke-width="2"/>
    </svg>`,
  },
  cape: {
    dir: 'cloakicon',
    svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="${BG}" rx="8"/>
      <path d="M22 12 L42 12 L44 16 L46 52 L38 58 L32 56 L26 58 L18 52 L20 16 Z" fill="${RED}" stroke="#5a0000" stroke-width="1"/>
      <path d="M24 14 L40 14 L42 17 L44 50 L37 55 L32 53 L27 55 L20 50 L22 17 Z" fill="#a02020"/>
      <path d="M28 12 L36 12 L36 16 L28 16 Z" fill="${GOLD}"/>
      <circle cx="32" cy="14" r="2" fill="${GOLD2}"/>
      <path d="M22 30 Q32 35 42 30" fill="none" stroke="#5a0000" stroke-width="1" opacity="0.5"/>
      <path d="M20 40 Q32 45 44 40" fill="none" stroke="#5a0000" stroke-width="1" opacity="0.5"/>
    </svg>`,
  },
  helm: {
    dir: 'helmeticon',
    svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="${BG}" rx="8"/>
      <path d="M18 34 L32 12 L46 34 L44 44 L20 44 Z" fill="${SILVER}" stroke="#888" stroke-width="1"/>
      <path d="M20 33 L32 14 L44 33 L42 42 L22 42 Z" fill="${DARK}"/>
      <path d="M22 32 L42 32 L41 38 L23 38 Z" fill="#111" stroke="#444" stroke-width="0.5"/>
      <line x1="28" y1="32" x2="28" y2="38" stroke="#444" stroke-width="1"/>
      <line x1="32" y1="32" x2="32" y2="38" stroke="#444" stroke-width="1"/>
      <line x1="36" y1="32" x2="36" y2="38" stroke="#444" stroke-width="1"/>
      <path d="M32 12 L32 8 L34 8 L34 12" fill="${GOLD}"/>
      <path d="M18 34 L14 40 L20 44" fill="${SILVER}" stroke="#888" stroke-width="1"/>
      <path d="M46 34 L50 40 L44 44" fill="${SILVER}" stroke="#888" stroke-width="1"/>
    </svg>`,
  },
  mace: {
    dir: 'weaponicon',
    svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="${BG}" rx="8"/>
      <rect x="30" y="24" width="4" height="32" fill="#8B4513" rx="1"/>
      <rect x="29" y="22" width="6" height="4" fill="#654321"/>
      <path d="M16 14 L48 14 L50 22 L14 22 Z" fill="${SILVER}" stroke="#888" stroke-width="1"/>
      <path d="M18 15 L46 15 L48 21 L16 21 Z" fill="#777"/>
      <rect x="14" y="14" width="4" height="8" fill="${GOLD}" rx="1"/>
      <rect x="46" y="14" width="4" height="8" fill="${GOLD}" rx="1"/>
      <circle cx="32" cy="18" r="2" fill="${GOLD2}"/>
      <rect x="28" y="52" width="8" height="3" fill="#654321" rx="1"/>
    </svg>`,
  },
  longsword: {
    dir: 'weaponicon',
    svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="${BG}" rx="8"/>
      <rect x="30" y="8" width="4" height="36" fill="${SILVER}" rx="1"/>
      <rect x="29" y="8" width="6" height="2" fill="#ccc"/>
      <path d="M32 8 L34 6 L32 4 L30 6 Z" fill="${SILVER}"/>
      <rect x="24" y="42" width="16" height="4" fill="${GOLD}" rx="2"/>
      <rect x="22" y="44" width="20" height="3" fill="${GOLD2}" rx="1"/>
      <rect x="30" y="47" width="4" height="10" fill="#8B4513" rx="1"/>
      <circle cx="32" cy="58" r="2" fill="${GOLD}"/>
      <line x1="32" y1="10" x2="32" y2="40" stroke="#ddd" stroke-width="0.5" opacity="0.5"/>
    </svg>`,
  },
};

async function main() {
  for (const [name, { dir, svg }] of Object.entries(icons)) {
    const outDir = path.join(base, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${name}.png`);
    const buf = Buffer.from(svg);
    await sharp(buf).resize(64, 64).png().toFile(file);
    console.log(`${name}.png: ${fs.statSync(file).size} bytes`);
  }
  console.log('OK');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
