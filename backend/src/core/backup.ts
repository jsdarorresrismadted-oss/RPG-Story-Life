// backup.ts — snapshot COMPLETO do banco em JSON, disparado automaticamente a
// cada alteração de conteúdo (extensão do Prisma). Em produção o diretório deve
// ser um volume persistente (BACKUP_DIR, padrão: ./backups a partir do WORKDIR).
import fs from "fs";
import path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || "25", 10));
const ENABLED = process.env.AUTO_BACKUP !== "0" && process.env.AUTO_BACKUP !== "false";
const EXCLUDE_TABLES = new Set(["prisma_migrations"]);
const DEBOUNCE_MS = 5000;

// Modelos de CONTEÚDO (editáveis pelo admin): alterações neles geram backup.
// Dados de jogadores (combate, chat, etc.) NÃO disparam backup, para não
// gerar snapshot a cada tick de batalha.
const CONTENT_MODELS = new Set([
  "GameClass",
  "CharacterClass",
  "StatModel",
  "Skill",
  "Passive",
  "Effect",
  "Item",
  "CraftRecipe",
  "Enchantment",
  "Booster",
  "GachaConfig",
  "Map",
  "MapConnection",
  "MapNpc",
  "MapMonster",
  "Monster",
  "Npc",
  "ShopItem",
  "Quest",
  "GuildShopItem",
  "GuildPerk",
  "Title",
  "GameEvent",
  "EventShopItem",
  "Season",
  "SeasonTier",
  "PatchNote",
  "SystemConfig",
  "RedeemCode",
  "ShopProduct",
]);

const MUTATION_ACTIONS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

function tsName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function serializeRow(row: unknown): string {
  return JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function pruneOld(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const dirs = fs
    .readdirSync(BACKUP_DIR)
    .filter((d) => /^\d{8}-\d{6}$/.test(d))
    .sort()
    .reverse();
  for (const d of dirs.slice(KEEP)) {
    fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
    console.log(`[auto-backup] removendo backup antigo: ${d}`);
  }
}

// Snapshot completo usando a DATABASE_URL do ambiente (em produção é a URL
// real do Railway; em dev é o túnel local). Devolve a pasta criada.
export async function runBackup(): Promise<string> {
  const prisma = new PrismaClient();
  const dest = path.join(BACKUP_DIR, tsName());
  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const names = (tables as { tablename: string }[]).map((t) => t.tablename).filter((t) => !EXCLUDE_TABLES.has(t));
    if (names.length === 0) throw new Error("nenhuma tabela encontrada");

    fs.mkdirSync(dest, { recursive: true });
    const summary: Record<string, number> = {};
    for (const table of names) {
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "public"."${table}"`);
      fs.writeFileSync(path.join(dest, `${table}.json`), serializeRow(rows), "utf8");
      summary[table] = (rows as unknown[]).length;
    }
    fs.writeFileSync(
      path.join(dest, "meta.json"),
      JSON.stringify({ createdAt: new Date().toISOString(), tables: summary }, null, 2),
      "utf8"
    );
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    pruneOld();
    console.log(`[auto-backup] OK — ${names.length} tabelas, ${total} registros em ${dest}`);
    return dest;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

// Debounce + coalescência: várias alterações em sequência viram UM backup.
let timer: NodeJS.Timeout | null = null;
let running = false;
let pending = false;

export function scheduleAutoBackup(): void {
  if (!ENABLED) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  timer = null;
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    await runBackup();
  } catch (err) {
    console.error(`[auto-backup] falhou: ${(err as Error).message || err}`);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      timer = setTimeout(flush, 0);
    }
  }
}

// Extensão do Prisma: dispara o backup após toda mutação em modelo de conteúdo.
// Registrada em core/database.ts, vale para TODAS as operações do app.
export const autoBackupExtension = Prisma.defineExtension({
  name: "auto-backup",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        if (CONTENT_MODELS.has(model) && MUTATION_ACTIONS.has(operation)) {
          scheduleAutoBackup();
        }
        return result;
      },
    },
  },
});