import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num } from "./monsterGenerator";

// ===== Gerador de Quests via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão do npcGenerator: gera quests (com objetivos de matar/coletar
// referenciando monstros/itens existentes por NOME) e salva no banco.

export const VALID_QUEST_TYPES = ["main", "side", "event"];
export const VALID_DIFFICULTIES = ["easy", "medium", "hard", "expert"];

const MAX_QUESTS = 8;

export interface GeneratedQuests {
  quests: any[];
  preview: Record<string, number>;
  errors?: string[];
}

function buildPrompt(idea: string, monstersHint: string, itemsHint: string, mapsHint: string, npcsHint: string): string {
  return `Você é um designer de quests de um MMORPG de texto. Gere UMA OU VÁRIAS quests (o usuário pode pedir uma quantidade, ex.: "5 quests") seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "quests": [
    {
      "title": "Título curto e épico da quest em pt-BR",
      "description": "1-2 frases explicando a missão (contexto, para quem é, o que fazer).",
      "type": "main|side|event",
      "difficulty": "easy|medium|hard|expert",
      "requiredLevel": NUMERO (1-99, coerente com a dificuldade e com os alvos)",
      "objectives": [
        { "type": "kill", "monsterName": "NOME EXATO de monstro existente", "amount": 3 },
        { "type": "collect", "itemName": "NOME EXATO de item existente", "amount": 5 }
      ],
      "xpReward": NUMERO,
      "goldReward": NUMERO,
      "itemRewards": [ { "itemName": "NOME EXATO de item existente", "quantity": 1 } ],
      "giverNpc": "Nome EXATO de um NPC da lista (quem entrega a quest) ou null",
      "map": "Nome EXATO de um mapa da lista (onde a quest acontece) ou null",
      "isRepeatable": false
    }
  ]
}

REGRAS:
- Objetivos: SOMENTE tipos "kill" (matar) e "collect" (coletar). MONSTROS e ITENS dos objetivos DEVEM ser nomes EXATOS das listas abaixo — o jogo casa o progresso pelo nome.
- 1 a 3 objetivos por quest. amounts coerentes com a dificuldade (easy: 3-10, medium: 10-20, hard: 20-35, expert: 35-50).
- xpReward e goldReward proporcionais ao requiredLevel e à dificuldade (quest de nível alto rende mais). xpReward entre 50 e 50000, goldReward entre 0 e 100000.
- itemRewards: no máximo 2 itens, só das listas abaixo. Pode ser vazio.
- isRepeatable: false para quests de história (main), true para side/event (opcional).
- Tema, títulos e descrições coerentes entre si (um arco de história curto).

MONSTROS EXISTENTES (use apenas estes nomes EXATOS): ${monstersHint || "(lista vazia — sem objetivos kill)"}
ITENS EXISTENTES (use apenas estes nomes EXATOS): ${itemsHint || "(lista vazia — sem coletar nem recompensas de item)"}
MAPAS EXISTENTES (use apenas estes nomes EXATOS): ${mapsHint || "(nenhum mapa conhecido)"}
NPCs EXISTENTES (use apenas estes nomes EXATOS em giverNpc): ${npcsHint || "(nenhum NPC conhecido)"}

PEDIDO DO USUÁRIO (atenda fielmente o tema e a quantidade pedidos):
"${idea}"`;
}

function normalizeOne(q: any, errors: string[], hints: { monsters: Set<string>; items: Set<string> }): any {
  if (!q || !q.title) throw new Error("JSON inválido: campo quest.title ausente");
  const type = VALID_QUEST_TYPES.includes(q.type) ? q.type : "side";
  const difficulty = VALID_DIFFICULTIES.includes(q.difficulty) ? q.difficulty : "easy";
  const objectives = Array.isArray(q.objectives)
    ? q.objectives
        .map((o: any) => {
          if (o?.type === "kill" && o?.monsterName) {
            const name = String(o.monsterName).slice(0, 80);
            if (hints.monsters.size > 0 && !hints.monsters.has(name.toLowerCase())) return null;
            return { type: "kill", monsterName: name, amount: Math.max(1, Math.round(num(o.amount, 1))) };
          }
          if (o?.type === "collect" && o?.itemName) {
            const name = String(o.itemName).slice(0, 80);
            if (hints.items.size > 0 && !hints.items.has(name.toLowerCase())) return null;
            return { type: "collect", itemName: name, amount: Math.max(1, Math.round(num(o.amount, 1))) };
          }
          return null;
        })
        .filter((o: any) => o !== null)
        .slice(0, 3)
    : [];
  const itemRewards = Array.isArray(q.itemRewards)
    ? q.itemRewards
        .map((r: any) => {
          const name = String(r?.itemName || "").trim().slice(0, 80);
          if (!name) return null;
          if (hints.items.size > 0 && !hints.items.has(name.toLowerCase())) return null;
          return { itemName: name, quantity: Math.max(1, Math.round(num(r?.quantity, 1))) };
        })
        .filter((r: any) => r !== null)
        .slice(0, 2)
    : [];
  return {
    title: String(q.title).slice(0, 120),
    description: String(q.description || "").slice(0, 500),
    type,
    difficulty,
    requiredLevel: Math.max(1, Math.min(99, Math.round(num(q.requiredLevel, 1)))),
    objectives,
    xpReward: Math.max(0, Math.min(50000, Math.round(num(q.xpReward, 0)))),
    goldReward: Math.max(0, Math.min(100000, Math.round(num(q.goldReward, 0)))),
    itemRewards,
    giverNpc: String(q.giverNpc || "").trim() || null,
    map: String(q.map || "").trim() || null,
    isRepeatable: !!q.isRepeatable,
  };
}

function normalize(raw: any, errors: string[], hints: { monsters: Set<string>; items: Set<string> }): GeneratedQuests {
  let arr: any[];
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.quests)) arr = raw.quests;
  else arr = [raw?.quest || raw];

  const quests: any[] = [];
  for (const item of arr.slice(0, MAX_QUESTS)) {
    try {
      quests.push(normalizeOne(item, errors, hints));
    } catch (err: any) {
      errors.push(err?.message?.includes("title ausente") ? "Quest sem título ignorada" : err.message);
    }
  }
  if (quests.length === 0) throw new Error("JSON inválido: campo quest.title ausente (nenhuma quest válida na resposta)");

  return {
    quests,
    preview: { count: quests.length },
    errors,
  };
}

export async function generateQuests(idea: string, providerLog: string[]): Promise<GeneratedQuests> {
  const [monsters, items, maps, npcs] = await Promise.all([
    prisma.monster.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.map.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.npc.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const monstersHint = monsters.map((m) => m.name).slice(0, 50).join(", ");
  const itemsHint = items.map((i) => i.name).slice(0, 80).join(", ");
  const mapsHint = maps.map((m) => m.name).slice(0, 30).join(", ");
  const npcsHint = npcs.map((n) => n.name).slice(0, 30).join(", ");
  const prompt = buildPrompt(idea, monstersHint, itemsHint, mapsHint, npcsHint);

  const hints = {
    monsters: new Set(monsters.map((m) => m.name.toLowerCase())),
    items: new Set(items.map((i) => i.name.toLowerCase())),
  };

  const attempts = [
    { name: "Gemini", fn: callGemini, key: () => process.env.GEMINI_API_KEY },
    { name: "Groq", fn: callGroq, key: () => process.env.GROQ_API_KEY },
  ];
  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    if (!attempt.key()) continue;
    for (let retry = 0; retry < 2; retry++) {
      try {
        const text = await attempt.fn(prompt);
        providerLog.push(`${attempt.name}${retry > 0 ? ` (após ${retry} retry)` : ""}`);
        const errors: string[] = [];
        const gen = normalize(extractJson(text), errors, hints);
        gen.errors = errors;
        return gen;
      } catch (err: any) {
        lastErr = err;
      }
    }
  }
  throw new AppError(502, `Falha ao gerar quests (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

// Cria as quests no banco (giver/mapa vinculados por nome; recompensas resolvidas por nome).
export async function persistGeneratedQuests(gen: GeneratedQuests): Promise<any> {
  const warnings: string[] = [];
  const quests: any[] = [];
  for (const q of gen.quests) {
    let giverNpcId: string | null = null;
    if (q.giverNpc) {
      const npc = await prisma.npc.findFirst({ where: { name: { equals: q.giverNpc, mode: "insensitive" } }, select: { id: true } });
      if (npc) giverNpcId = npc.id;
      else warnings.push(`NPC "${q.giverNpc}" não encontrado — quest "${q.title}" sem doador`);
    }
    let mapId: string | null = null;
    if (q.map) {
      const map = await prisma.map.findFirst({ where: { name: { equals: q.map, mode: "insensitive" } }, select: { id: true } });
      if (map) mapId = map.id;
      else warnings.push(`Mapa "${q.map}" não encontrado — quest "${q.title}" sem mapa`);
    }
    const itemRewards: any[] = [];
    for (const r of q.itemRewards || []) {
      const item = await prisma.item.findFirst({ where: { name: { equals: r.itemName, mode: "insensitive" } }, select: { id: true, name: true } });
      if (item) itemRewards.push({ itemId: item.id, itemName: item.name, quantity: r.quantity });
      else warnings.push(`Item "${r.itemName}" não encontrado — recompensa ignorada (${q.title})`);
    }
    const created = await prisma.quest.create({
      data: {
        title: q.title,
        description: q.description,
        type: q.type,
        difficulty: q.difficulty,
        requiredLevel: q.requiredLevel,
        requiredRank: 1,
        giverNpcId,
        mapId,
        isRepeatable: q.isRepeatable,
        isActive: true,
        sortOrder: 0,
        objectives: JSON.stringify(q.objectives),
        xpReward: q.xpReward,
        goldReward: q.goldReward,
        itemRewards: JSON.stringify(itemRewards),
      },
    });
    quests.push({ id: created.id, title: q.title, type: q.type, difficulty: q.difficulty });
  }
  return {
    quests,
    count: quests.length,
    warnings,
    errors: (gen as any).errors || [],
  };
}