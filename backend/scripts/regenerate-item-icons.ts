// Regenera os ícones dos itens referenciados (seed + banco, se DATABASE_URL
// existir) usando o estilo "sem aura" do itemGenerator. Salva o mapa de
// overrides em backend/prisma/generated-icons.json para o seed manter os novos
// ícones nos deploys seguintes.
//
// Uso:
//   cd backend
//   npx tsx scripts/regenerate-item-icons.ts
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { generateItemIcon } from "../src/core/ai/itemGenerator";
import seedContent from "../prisma/seed-content";

const EQUIP_TYPES = ["weapon", "helm", "armor", "cape", "ring", "necklace"];
const OVERRIDE_FILE = path.resolve(__dirname, "../prisma/generated-icons.json");

function slugHash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

interface Target {
  name: string;
  type: string;
  rarity: string;
  description?: string;
}

async function main() {
  const overrides: Record<string, string> = {};
  try {
    Object.assign(overrides, JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8")));
  } catch {
    // arquivo ainda não existe — começa vazio
  }

  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const item of seedContent.items) {
    if (!EQUIP_TYPES.includes(item.type)) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ name: item.name, type: item.type, rarity: item.rarity || "common", description: item.description });
  }

  let prisma: PrismaClient | null = null;
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
    const dbItems = await prisma.item.findMany({
      where: { type: { in: EQUIP_TYPES }, isActive: true },
      select: { name: true, type: true, rarity: true, description: true },
    });
    for (const it of dbItems) {
      const key = it.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ name: it.name, type: it.type, rarity: it.rarity || "common", description: it.description || undefined });
    }
  }

  console.log("Alvos para regeneração:", targets.length);

  const failures: string[] = [];
  let done = 0;
  for (const t of targets) {
    try {
      const log: string[] = [];
      const { icon } = await generateItemIcon(
        {
          name: t.name,
          type: t.type,
          rarity: t.rarity,
          description: t.description,
          seed: 100000 + (slugHash(t.name) % 900000),
        },
        log
      );
      overrides[t.name] = icon;
      if (prisma) {
        await prisma.item.updateMany({ where: { name: t.name }, data: { icon } });
      }
      done++;
      console.log(`  [${done}/${targets.length}] ${t.name} -> ${icon} (${log.join("; ")})`);
    } catch (err: any) {
      failures.push(`${t.name}: ${String(err?.message || err).slice(0, 120)}`);
      console.error("  FALHOU:", t.name, String(err?.message || err).slice(0, 120));
    }
  }

  fs.mkdirSync(path.dirname(OVERRIDE_FILE), { recursive: true });
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(overrides, null, 2));
  console.log("Overrides salvos em", OVERRIDE_FILE);

  if (prisma) await prisma.$disconnect();

  console.log("Resumo: gerados", done, "| falhas", failures.length);
  if (failures.length > 0) {
    console.log("Falhas:");
    for (const f of failures) console.log("  -", f);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
