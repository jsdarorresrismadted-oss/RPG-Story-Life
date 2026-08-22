import { prisma } from "../database";
import { callGemini, callGroq, extractJson } from "./monsterGenerator";

// ===== IA de ajuste/balanceamento e limpeza (itens, quests, mapas) =====
// Gera um PLANO (preview) de atualizações + deleções seguras, validado pelo backend
// antes de aplicar. Itens/quests/mapas só são marcados para deleção quando não têm
// referências (drops, lojas, crafts, progresso de jogador etc.), evitando quebrar o jogo.

export interface AdjustUpdate {
  id: string;
  reason: string;
  patch: Record<string, any>;
}
export interface AdjustDelete {
  id: string;
  reason: string;
}
export interface AdjustPlan {
  updates: AdjustUpdate[];
  deletes: AdjustDelete[];
  provider: string;
  note?: string;
}

export const ITEM_FIELDS = [
  "sellPrice", "buyPrice", "rarity", "level", "rank",
  "strength", "intellect", "endurance", "dexterity", "wisdom", "luck",
  "dps", "attackSpeedMs", "isActive",
];
export const QUEST_FIELDS = [
  "title", "description", "xpReward", "goldReward", "requiredLevel", "difficulty", "isActive",
];
export const MAP_FIELDS = ["name", "description", "requiredLevel", "region", "isActive"];

async function llmJson(prompt: string, providerLog: string[]): Promise<any> {
  const attempts = [
    { name: "Gemini", fn: callGemini, key: () => process.env.GEMINI_API_KEY },
    { name: "Groq", fn: callGroq, key: () => process.env.GROQ_API_KEY },
  ];
  let lastErr: any = null;
  for (const a of attempts) {
    if (!a.key()) continue;
    try {
      const text = await a.fn(prompt);
      providerLog.push(a.name);
      return extractJson(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Falha na IA (Gemini e Groq indisponíveis): ${(lastErr as Error)?.message?.slice(0, 200)}`);
}

async function groupCount(model: string, field: string): Promise<Map<string, number>> {
  const rows = await (prisma as any)[model].groupBy({ by: [field], _count: { _all: true } });
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = r[field];
    if (key == null) continue;
    m.set(String(key), (m.get(String(key)) || 0) + (r._count?._all ?? 1));
  }
  return m;
}

function totalUsage(u: Record<string, number>): number {
  return Object.values(u).reduce((a, b) => a + (b || 0), 0);
}

function toBig(v: any): any {
  if (v === null || v === undefined || v === "") return null;
  try {
    return BigInt(Math.round(Number(v)));
  } catch {
    return null;
  }
}

const fnum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

async function computeItemDeletable(): Promise<Set<string>> {
  const [inv, drops, shop, shopProd, craft, guildShop, eventShop, mail, market] = await Promise.all([
    groupCount("inventory", "itemId"),
    groupCount("dropItem", "itemId"),
    groupCount("shopItem", "itemId"),
    groupCount("shopProduct", "itemId"),
    groupCount("craftRecipe", "resultItemId"),
    groupCount("guildShopItem", "itemId"),
    groupCount("eventShopItem", "itemId"),
    groupCount("mailItem", "itemId"),
    groupCount("marketListing", "itemId"),
  ]);
  const ids = await prisma.item.findMany({ where: { isActive: true }, select: { id: true } });
  const del = new Set<string>();
  for (const { id } of ids) {
    const u = {
      inventory: inv.get(id) || 0,
      drops: drops.get(id) || 0,
      shop: shop.get(id) || 0,
      shopProduct: shopProd.get(id) || 0,
      craft: craft.get(id) || 0,
      guildShop: guildShop.get(id) || 0,
      eventShop: eventShop.get(id) || 0,
      mail: mail.get(id) || 0,
      market: market.get(id) || 0,
    };
    if (totalUsage(u) === 0) del.add(id);
  }
  return del;
}

async function computeQuestDeletable(): Promise<Set<string>> {
  const quests = await prisma.quest.findMany({
    where: { isActive: true },
    select: { id: true, giverNpcId: true, requiredQuestIds: true },
  });
  const progress = await groupCount("questProgress", "questId");
  const referenced = new Set<string>();
  for (const q of quests) {
    try {
      const arr = JSON.parse(q.requiredQuestIds || "[]");
      if (Array.isArray(arr)) arr.forEach((id: any) => referenced.add(String(id)));
    } catch { /* ignore */ }
  }
  const del = new Set<string>();
  for (const q of quests) {
    const players = progress.get(q.id) || 0;
    if (players === 0 && !referenced.has(q.id) && !q.giverNpcId) del.add(q.id);
  }
  return del;
}

async function computeMapDeletable(): Promise<Set<string>> {
  const [mm, mn, qm, cf, ct] = await Promise.all([
    groupCount("mapMonster", "mapId"),
    groupCount("mapNpc", "mapId"),
    groupCount("quest", "mapId"),
    groupCount("mapConnection", "fromMapId"),
    groupCount("mapConnection", "toMapId"),
  ]);
  const maps = await prisma.map.findMany({ where: { isActive: true }, select: { id: true } });
  const del = new Set<string>();
  for (const { id } of maps) {
    const refs = (mm.get(id) || 0) + (mn.get(id) || 0) + (qm.get(id) || 0) + (cf.get(id) || 0) + (ct.get(id) || 0);
    if (refs === 0) del.add(id);
  }
  return del;
}

export async function computeDeletable(domain: string): Promise<Set<string>> {
  if (domain === "items") return computeItemDeletable();
  if (domain === "quests") return computeQuestDeletable();
  if (domain === "maps") return computeMapDeletable();
  return new Set();
}

function sanitizeUpdates(updates: any[], fields: string[]): AdjustUpdate[] {
  if (!Array.isArray(updates)) return [];
  const out: AdjustUpdate[] = [];
  for (const u of updates) {
    if (!u || typeof u.id !== "string") continue;
    const patch: Record<string, any> = {};
    for (const f of fields) {
      if (u.patch && u.patch[f] !== undefined && u.patch[f] !== null && u.patch[f] !== "") patch[f] = u.patch[f];
    }
    if (Object.keys(patch).length === 0) continue;
    out.push({ id: u.id, reason: String(u.reason || ""), patch });
  }
  return out.slice(0, 200);
}

function sanitizeDeletes(deletes: any[], deletable: Set<string>): AdjustDelete[] {
  if (!Array.isArray(deletes)) return [];
  const out: AdjustDelete[] = [];
  const seen = new Set<string>();
  for (const d of deletes) {
    if (!d || typeof d.id !== "string") continue;
    if (!deletable.has(d.id)) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ id: d.id, reason: String(d.reason || "") });
  }
  return out.slice(0, 200);
}

// ---------------------------------------------------------------------------

export async function generateItemAdjustments(prompt: string, providerLog: string[]): Promise<AdjustPlan> {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, type: true, subtype: true, rarity: true, level: true, rank: true,
      sellPrice: true, buyPrice: true, strength: true, intellect: true, endurance: true,
      dexterity: true, wisdom: true, luck: true, dps: true, attackSpeedMs: true, isTemporary: true,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const deletable = await computeItemDeletable();
  const usage = await buildItemUsage();
  const compact = items.map((it) => ({
    id: it.id, name: it.name, type: it.type, subtype: it.subtype, rarity: it.rarity, level: it.level, rank: it.rank,
    sell: Number(it.sellPrice), buy: Number(it.buyPrice),
    stats: it.strength + it.intellect + it.endurance + it.dexterity + it.wisdom + it.luck,
    dps: it.dps, temp: it.isTemporary, refs: totalUsage(usage.get(it.id) || {}),
  }));

  const sys = `Voce e um designer de balanceamento de um MMORPG de texto. Ajuste precos, raridade, nivel e atributos para deixar o jogo coerente (itens de raridade/nivel maiores devem ser melhores e mais caros; remova precos absurdos ou atributos desproporcionais). Itens com refs=0 sao orfaos/sem uso — eles ESTAO em "deletableIds" e podem ser removidos se forem inuteis (duplicados, placeholder, lixo). NUNCA remova itens com refs>0.

Contrato (JSON puro, sem markdown):
{
  "updates": [ { "id": "ID", "reason": "resumo pt-BR", "patch": { "sellPrice": NUM, "buyPrice": NUM, "rarity": "common|uncommon|rare|epic|legendary|mythic", "level": NUM, "rank": NUM, "strength": NUM, "intellect": NUM, "endurance": NUM, "dexterity": NUM, "wisdom": NUM, "luck": NUM, "dps": NUM, "attackSpeedMs": NUM, "isActive": true } } ],
  "deletes": [ { "id": "ID", "reason": "resumo pt-BR" } ]
}
Regras: so coloque em "deletes" IDs que estejam em deletableIds. so patch campos listados. Se nada precisa mudar, retorne listas vazias.

deletableIds: ${JSON.stringify(Array.from(deletable))}

ITENS (refs = total de referencias no jogo):
${JSON.stringify(compact)}

Pedido do admin: ${prompt || "Balanceie o jogo e remova itens inuteis/orfas."}`;

  const raw = await llmJson(sys, providerLog);
  return {
    updates: sanitizeUpdates(raw?.updates, ITEM_FIELDS),
    deletes: sanitizeDeletes(raw?.deletes, deletable),
    provider: providerLog.join(","),
  };
}

export async function generateQuestAdjustments(prompt: string, providerLog: string[]): Promise<AdjustPlan> {
  const quests = await prisma.quest.findMany({
    where: { isActive: true },
    select: { id: true, title: true, type: true, difficulty: true, requiredLevel: true, xpReward: true, goldReward: true, giverNpcId: true, requiredQuestIds: true, isRepeatable: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const deletable = await computeQuestDeletable();
  const progress = await groupCount("questProgress", "questId");
  const referenced = new Set<string>();
  for (const q of quests) {
    try {
      const arr = JSON.parse(q.requiredQuestIds || "[]");
      if (Array.isArray(arr)) arr.forEach((id: any) => referenced.add(String(id)));
    } catch { /* ignore */ }
  }
  const compact = quests.map((q) => ({
    id: q.id, title: q.title, type: q.type, difficulty: q.difficulty, requiredLevel: q.requiredLevel,
    xp: Number(q.xpReward), gold: Number(q.goldReward), players: progress.get(q.id) || 0, hasGiver: !!q.giverNpcId, isRepeatable: q.isRepeatable,
  }));

  const sys = `Voce e um designer de quests de MMORPG. Ajuste recompensas (xp/gold) e dificuldade para coerencia (quests de nivel alto dao mais; eventos/side dao menos que main). Quests com players=0, hasGiver=false e que nao sao pre-requisito de nenhuma outra ESTAO em deletableIds e podem ser removidas se forem lixo/placeholder. NUNCA remova quests com players>0 ou que tem doador (hasGiver=true).

Contrato (JSON puro):
{
  "updates": [ { "id": "ID", "reason": "resumo pt-BR", "patch": { "title": "texto", "description": "texto", "xpReward": NUM, "goldReward": NUM, "requiredLevel": NUM, "difficulty": "easy|medium|hard|expert", "isActive": true } } ],
  "deletes": [ { "id": "ID", "reason": "resumo pt-BR" } ]
}
deletableIds: ${JSON.stringify(Array.from(deletable))}

QUESTS:
${JSON.stringify(compact)}

Pedido do admin: ${prompt || "Balanceie recompensas/dificuldade e remova quests inuteis."}`;

  const raw = await llmJson(sys, providerLog);
  return {
    updates: sanitizeUpdates(raw?.updates, QUEST_FIELDS),
    deletes: sanitizeDeletes(raw?.deletes, deletable),
    provider: providerLog.join(","),
  };
}

export async function generateMapAdjustments(prompt: string, providerLog: string[]): Promise<AdjustPlan> {
  const maps = await prisma.map.findMany({
    where: { isActive: true },
    select: { id: true, name: true, region: true, requiredLevel: true, type: true, description: true },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const [mm, mn, qm, cf, ct] = await Promise.all([
    groupCount("mapMonster", "mapId"),
    groupCount("mapNpc", "mapId"),
    groupCount("quest", "mapId"),
    groupCount("mapConnection", "fromMapId"),
    groupCount("mapConnection", "toMapId"),
  ]);
  const deletable = await computeMapDeletable();
  const compact = maps.map((m) => ({
    id: m.id, name: m.name, region: m.region, type: m.type, requiredLevel: m.requiredLevel,
    monsters: mm.get(m.id) || 0, npcs: mn.get(m.id) || 0, quests: qm.get(m.id) || 0,
    conns: (cf.get(m.id) || 0) + (ct.get(m.id) || 0),
  }));

  const sys = `Voce e um designer de mapas de MMORPG. Ajuste nome, regiao, nivel recomendado e descricao para coerencia. Mapas com monsters=0, npcs=0, quests=0 e conns=0 (vazios/desconectados) ESTAO em deletableIds e podem ser removidos. NUNCA remova mapas conectados ou com conteudo.

Contrato (JSON puro):
{
  "updates": [ { "id": "ID", "reason": "resumo pt-BR", "patch": { "name": "texto", "description": "texto", "requiredLevel": NUM, "region": "texto", "isActive": true } } ],
  "deletes": [ { "id": "ID", "reason": "resumo pt-BR" } ]
}
deletableIds: ${JSON.stringify(Array.from(deletable))}

MAPAS:
${JSON.stringify(compact)}

Pedido do admin: ${prompt || "Balanceie mapas e remova mapas vazios/desconectados."}`;

  const raw = await llmJson(sys, providerLog);
  return {
    updates: sanitizeUpdates(raw?.updates, MAP_FIELDS),
    deletes: sanitizeDeletes(raw?.deletes, deletable),
    provider: providerLog.join(","),
  };
}

async function buildItemUsage(): Promise<Map<string, Record<string, number>>> {
  const [inv, drops, shop, shopProd, craft, guildShop, eventShop, mail, market] = await Promise.all([
    groupCount("inventory", "itemId"),
    groupCount("dropItem", "itemId"),
    groupCount("shopItem", "itemId"),
    groupCount("shopProduct", "itemId"),
    groupCount("craftRecipe", "resultItemId"),
    groupCount("guildShopItem", "itemId"),
    groupCount("eventShopItem", "itemId"),
    groupCount("mailItem", "itemId"),
    groupCount("marketListing", "itemId"),
  ]);
  const m = new Map<string, Record<string, number>>();
  const ids = await prisma.item.findMany({ where: { isActive: true }, select: { id: true } });
  for (const { id } of ids) {
    m.set(id, {
      inventory: inv.get(id) || 0, drops: drops.get(id) || 0, shop: shop.get(id) || 0,
      shopProduct: shopProd.get(id) || 0, craft: craft.get(id) || 0, guildShop: guildShop.get(id) || 0,
      eventShop: eventShop.get(id) || 0, mail: mail.get(id) || 0, market: market.get(id) || 0,
    });
  }
  return m;
}

export async function applyAdjustments(domain: string, updates: AdjustUpdate[], deletes: AdjustDelete[]) {
  const updated: string[] = [];
  const deleted: string[] = [];
  const skipped: string[] = [];
  const fields = domain === "items" ? ITEM_FIELDS : domain === "quests" ? QUEST_FIELDS : MAP_FIELDS;
  const model = domain === "items" ? "item" : domain === "quests" ? "quest" : "map";
  const bigFields = ["sellPrice", "buyPrice", "xpReward", "goldReward"];

  const deletable = await computeDeletable(domain);
  const validUpdates = sanitizeUpdates(updates, fields);
  const validDeletes = sanitizeDeletes(deletes, deletable);

  await prisma.$transaction(async (tx) => {
    for (const u of validUpdates) {
      const data: Record<string, any> = {};
      for (const f of fields) {
        if (u.patch[f] === undefined) continue;
        if (bigFields.includes(f)) {
          const b = toBig(u.patch[f]);
          if (b !== null) data[f] = b;
        } else if (typeof u.patch[f] === "boolean") {
          data[f] = !!u.patch[f];
        } else {
          const n = fnum(u.patch[f]);
          if (n !== undefined) data[f] = n;
          else if (typeof u.patch[f] === "string") data[f] = u.patch[f];
        }
      }
      if (Object.keys(data).length === 0) { skipped.push(u.id); continue; }
      try {
        await (tx as any)[model].update({ where: { id: u.id }, data });
        updated.push(u.id);
      } catch {
        skipped.push(u.id);
      }
    }
    for (const d of validDeletes) {
      try {
        await (tx as any)[model].delete({ where: { id: d.id } });
        deleted.push(d.id);
      } catch {
        skipped.push(d.id);
      }
    }
  });

  return { updated, deleted, skipped };
}
