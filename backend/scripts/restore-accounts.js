// restore-accounts.js — restaura contas deletadas acidentalmente (delete no admin)
// Origem: backup local backend/backups/20260813-174926 (último antes da exclusão).
// Idempotente: pode reexecutar sem duplicar (ON CONFLICT DO NOTHING).
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { openTunnel } = require("./db-tunnel");

const BACKUP = path.join(__dirname, "..", "backups", "20260813-174926");
const USER_IDS = ["3d40e8a7-f667-4d12-9f01-c7afbe2e96dc", "229ff250-99c4-4064-b1b7-019f882a4ed0"];
const GUILD_ID = "1aab0355-17ab-4b2e-8d37-06c8493fd3c4"; // "Comunismo" [CUT]

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(BACKUP, `${name}.json`), "utf8"));

const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Colunas do schema ATUAL que vieram de um campo renomeado no backup:
const COLUMN_RENAMES = { diamonds: "sfCoins" };

// JsonColumns recebem a string como JSON literal
const JSON_COLUMNS = new Set(["items", "effects", "stats", "metadata", "data"]);

async function getColumns(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = ${esc(table)}`
  );
  return new Set(rows.map((r) => r.column_name));
}

async function insertRows(prisma, table, rows, { columns } = {}) {
  if (!rows.length) return 0;
  const cols = columns || (await getColumns(prisma, table));
  let inserted = 0;
  for (const row of rows) {
    const colList = [];
    const valList = [];
    for (const [k, v] of Object.entries(row)) {
      const col = COLUMN_RENAMES[k] || k;
      if (!cols.has(col) || k === "eventId") continue; // campos antigos/inexistentes
      if (v === null || v === undefined) continue; // deixa o default do schema
      colList.push(`"${col}"`);
      if (typeof v === "boolean") valList.push(v ? "true" : "false");
      else if (JSON_COLUMNS.has(col) && (typeof v === "object" || /^[\[{]/.test(v))) {
        valList.push(`${esc(typeof v === "string" ? v : JSON.stringify(v))}::json`);
      } else valList.push(esc(v));
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" (${colList.join(",")}) VALUES (${valList.join(",")}) ON CONFLICT (id) DO NOTHING`
    );
    if (row.id && (await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE "id" = ${esc(row.id)}`)).length) {
      inserted++;
    }
  }
  return inserted;
}

async function main() {
  const tunnel = await openTunnel();
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    console.log("== 1) Booster (referenciados pelos anéis/colares) ==");
    const boosterCols = await getColumns(prisma, "Booster");
    const nBooster = await insertRows(prisma, "Booster", readJson("Booster"), { columns: boosterCols });
    console.log(`Booster inseridos: ${nBooster}/36`);

    console.log("== 2) Item (todos do backup; existentes são pulados) ==");
    const itemCols = await getColumns(prisma, "Item");
    const nItem = await insertRows(prisma, "Item", readJson("Item"), { columns: itemCols });
    console.log(`Item inseridos: ${nItem}/12`);

    console.log("== 3) User ==");
    const userCols = await getColumns(prisma, "User");
    if (!userCols.has("sfCoins")) throw new Error("coluna sfCoins não existe na tabela User");
    const users = readJson("User").filter((x) => USER_IDS.includes(x.id)).map((u) => ({
      ...u,
      isOnline: false,
      diamonds: Number(u.diamonds) || 0,
      pvpCoins: 0,
      gc: 0,
    }));
    const nUser = await insertRows(prisma, "User", users, { columns: userCols });
    console.log(`User inseridos: ${nUser}/2`);
    for (const u of users) {
      const ok = await prisma.$queryRawUnsafe(`SELECT 1 FROM "User" WHERE "id" = ${esc(u.id)}`);
      if (!ok.length) throw new Error(`User ${u.username} não foi inserido`);
    }

    console.log("== 4) Character ==");
    const characterCols = await getColumns(prisma, "Character");
    const nChar = await insertRows(
      prisma,
      "Character",
      readJson("Character").filter((c) => USER_IDS.includes(c.userId)),
      { columns: characterCols }
    );
    console.log(`Character inseridos: ${nChar}/2`);

    console.log("== 5) CharacterClass ==");
    const ccCols = await getColumns(prisma, "CharacterClass");
    const nCc = await insertRows(prisma, "CharacterClass", readJson("CharacterClass"), { columns: ccCols });
    console.log(`CharacterClass inseridos: ${nCc}/2`);

    console.log("== 6) Equipment ==");
    const eqCols = await getColumns(prisma, "Equipment");
    const nEq = await insertRows(prisma, "Equipment", readJson("Equipment"), { columns: eqCols });
    console.log(`Equipment inseridos: ${nEq}/2`);

    console.log("== 7) Inventory ==");
    const invCols = await getColumns(prisma, "Inventory");
    const nInv = await insertRows(prisma, "Inventory", readJson("Inventory"), { columns: invCols });
    console.log(`Inventory inseridos: ${nInv}/10`);

    console.log("== 8) RedeemCode ==");
    const rcCols = await getColumns(prisma, "RedeemCode");
    const codes = readJson("RedeemCode").map((r) => ({ ...r, diamonds: Number(r.diamonds) || 0 }));
    const nRc = await insertRows(prisma, "RedeemCode", codes, { columns: rcCols });
    console.log(`RedeemCode inseridos: ${nRc}/2`);

    console.log("== 9) Guilda Comunismo (líder + bank + ranking) ==");
    const member = await prisma.guildMember.findFirst({ where: { guildId: GUILD_ID } });
    if (!member) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "GuildMember" ("id","guildId","userId","role","rank","contribution","joinedAt")
         VALUES (gen_random_uuid()::text,${esc(GUILD_ID)},${esc(USER_IDS[0])},'leader',1,0,now()) ON CONFLICT DO NOTHING`
      );
      await prisma.$executeRawUnsafe(`UPDATE "Guild" SET "memberCount" = 1 WHERE "id" = ${esc(GUILD_ID)}`);
      console.log("GuildMember leader criado; memberCount=1");
    } else {
      console.log("GuildMember já existe");
    }
    if (!(await prisma.guildBank.findFirst({ where: { guildId: GUILD_ID } }))) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "GuildBank" ("id","guildId","gold","updatedAt") VALUES (gen_random_uuid()::text,${esc(GUILD_ID)},0,now()) ON CONFLICT DO NOTHING`
      );
      console.log("GuildBank criado");
    }
    if (!(await prisma.guildRanking.findFirst({ where: { guildId: GUILD_ID } }))) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "GuildRanking" ("id","guildId","rank","score","updatedAt") VALUES (gen_random_uuid()::text,${esc(GUILD_ID)},0,0,now()) ON CONFLICT DO NOTHING`
      );
      console.log("GuildRanking criado");
    }

    console.log("== 10) Verificação final ==");
    for (const t of ["User", "Character", "CharacterClass", "Equipment", "Inventory", "RedeemCode", "GuildMember", "GuildBank", "GuildRanking", "Booster", "Item"]) {
      const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      console.log(`TOTAL ${t} = ${cnt[0].c}`);
    }
    console.log("RESTAURAÇÃO CONCLUÍDA");
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

main().catch((err) => {
  console.error("FALHA:", err.message || err);
  process.exit(1);
});