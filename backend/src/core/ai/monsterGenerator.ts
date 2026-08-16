import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { getGameLimits } from "../gameLimits";

// ===== Gerador de monstros via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão do classGenerator: Gemini primeiro, Groq como fallback.
// Gera stats, skills (DSL do motor de batalha) e drops (por NOME de item + taxa).

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export interface GeneratedMonster {
  monster: any; // primeiro monstro (compatibilidade)
  monsters: any[]; // todos os monstros gerados
  drops: any[]; // drops do primeiro (compatibilidade)
  allDrops: any[][]; // drops de cada monstro
  preview: Record<string, number>;
  errors?: string[];
}

export const VALID_ELEMENTS = ["fire", "water", "nature", "light", "dark", "thunder", "ice", "earth", "arcane", "none"];
const VALID_DAMAGE_TYPES = ["physical", "magic", "true"];const VALID_TRIGGERS = ["auto", "active"];
const VALID_SKILL_KINDS = ["attack", "buff", "debuff", "heal", "utility"];
const VALID_ACTIONS = ["damage", "heal", "applyEffect", "mana"];

const MAX_MONSTERS = 12;

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function buildPrompt(idea: string, xpPerLevel: number): string {
  return `Você é um designer de monstros de um MMORPG de texto. Gere UM OU VÁRIOS monstros (o usuário pode pedir uma quantidade, ex.: "6 monstros") seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "monsters": [
    {
      "name": "Nome pt-BR do monstro",
      "description": "Uma frase curta.",
      "level": 1,
      "isElite": false,
      "isBoss": false,
      "faction": "ex: Floresta, Masmorra, Abismo, Vila, Deserto",
      "element": "fire|water|nature|light|dark|thunder|ice|earth|arcane|none",
      "hp": 50,
      "mana": 20,
      "attack": 10,
      "defense": 5,
      "magic": 5,
      "magicDefense": 5,
      "speed": 10,
      "criticalChance": 2,
      "criticalDamage": 150,
      "dodge": 1,
      "accuracy": 90,
      "attackSpeed": 2000,
      "xpReward": 10,
      "goldReward": 5,
      "behavior": "Frase curta sobre o comportamento do monstro em combate.",
      "skills": [ ... ],
      "drops": [ ... ]
    }
  ]
}

REGRAS DE QUANTIDADE:
- Se o usuário pedir uma quantidade (ex.: "6 monstros", "10 mobs"), gere EXATAMENTE essa quantidade (máximo 12).
- SEMPRE respeite o pedido de quantidade e de faixa de nível do usuário: ex. "10 mobs do level 1 ao level 6" → 10 monstros com níveis distribuídos de 1 a 6 (sem repetir nível se possível), e "os últimos 1 boss e 1 elite" → os 2 últimos monstros da lista devem ser isBoss: true e isElite: true.
- Se não pedir quantidade, gere 1 monstro.
- Nomes e temas coerentes entre si (um grupo do mesmo habitat/fantasia), variando nível quando o usuário pedir faixa (ex.: "nível 1 a 5" → distribua os níveis nessa faixa, um por nível se possível).

REGRAS DE STATS (por monstro):
- level 1 a 150. hp 30 a 500000 (bosses podem ter muito mais), attack 2 a 5000.
- defense e magicDefense entre 20% e 40% do attack (o sistema ainda adiciona +30% de defesa e +20% de dano).
- criticalChance 0 a 50 (%), criticalDamage 100 a 300 (%), dodge 0 a 30 (%), accuracy 70 a 100 (%).
- attackSpeed 1200 a 5000 (ms entre ataques).
- O sistema calcula xpReward/goldReward/classXpReward automaticamente pelo nível, SEMPRE alinhado ao custo real de subir de nível: o XP para subir do nível N é N × ${xpPerLevel} (base do jogo). Um mob comum dá 5% desse valor (elite 7,5%, boss 15%), ouro = 40% do XP e CXP = 50% do XP — o ganho nunca fica mais alto nem mais baixo que esse padrão. Você pode ignorar esses campos ou chutar valores (serão normalizados).

REGRAS DE SKILLS (1 a 4 skills por monstro):
- NOMES CRIATIVOS E ÚNICOS em pt-BR, coerentes com a criatura (ex.: "Corte Espectral", "Uivo da Maré", "Presas Sombrias", "Aura Pestilenta"). NUNCA "Ataque 1", "Skill 2", "Ataque Básico" genérico.
- A PRIMEIRA é o ataque automático: trigger "auto", kind "attack", cooldown 2000, actions: [{ action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: 0.8-1.2 }], damageType: "physical"|"magic" }].
- Demais: trigger "active", cooldown 3000-20000, actions válidas:
  • { action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: <0.5-2> }], damageType: "physical"|"magic" }
  • { action: "heal", amount: <n>, scaling: [{ stat: "magic", factor: <0.5-1> }] }
  • { action: "applyEffect", effect: "sangramento"|"chama-arcana"|"veneno-corrosivo"|"medo-abissal", target: "enemy"|"self", stacks: 1-3 }
  • { action: "mana", amount: <n>, restore: true }
- Cada skill: { name, description, kind, trigger, target: "enemy"|"self", cooldown, manaCost, rankRequired: 1, sortOrder, actions }.

REGRAS DE DROPS (2 a 5 itens por monstro) — RECURSOS TEMÁTICOS DA PRÓPRIA CRIATURA:
- Crie para cada monstro itens de DROP TEMÁTICO (matéria-prima/recursos do corpo ou essência da criatura, usados em craft). Exemplos:
  espectro da floresta → "Essência de Espectro da Floresta"; goblin → "Osso de Goblin"; lobo → "Presa de Lobo"; aranha → "Veno de Aranha"; dragao → "Escama de Dragao".
- Formato de drop NOVO (item será criado automaticamente): { "name": "Nome do recurso em pt-BR", "description": "1 frase (ex.: matéria-prima de craft)", "dropChance": <1-100%>, "minQuantity": 1, "maxQuantity": 2, "guaranteed": false }
- Recurso principal (mais comum): dropChance 40-70%. Recursos secundários: 15-35%. Recursos raros (essências, núcleos): 5-15%.
- (Opcional) NO MÁXIMO 1 drop de item JÁ EXISTENTE no jogo: { "itemName": "Nome EXATO de item existente (ex.: Poção de Vida)", "dropChance": 3-10%, "minQuantity": 1, "maxQuantity": 1, "guaranteed": false }.

PEDIDO DO USUÁRIO (atenda fielmente o tema, fantasia e mecânicas pedidos):
"${idea}"`;
}

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não definida");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini: resposta vazia");
  return text;
}

async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY não definida");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "Você gera JSON válido seguindo o contrato do usuário. Responda SOMENTE com o JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq: resposta vazia");
  return text;
}

export { callGemini, callGroq };

export function extractJson(text: string): any {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta não contém JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Recompensas determinísticas por nível, ALINHADAS ao custo de subir de nível:
// XP para upar no nível N = N × xpPerLevel (game limits). Mob comum dá 5% desse
// XP (elite 7,5%, boss 15%) — o ganho fica proporcional à barra, nem maior nem menor.
// Ouro = 40% do XP; CXP (XP de classe) = 50% do XP.
export function rewardsForLevel(level: number, isElite = false, isBoss = false, xpPerLevel = 1250): { xpReward: number; goldReward: number; classXpReward: number } {
  const mult = isBoss ? 3 : isElite ? 1.5 : 1;
  const xpToNext = Math.max(1, Math.floor(level * xpPerLevel));
  const xp = Math.max(1, Math.round(xpToNext * 0.05 * mult));
  return {
    xpReward: xp,
    goldReward: Math.round(xp * 0.4),
    classXpReward: Math.round(xp * 0.5),
  };
}

function normalizeOne(m: any, errors: string[], xpPerLevel = 1250): { monster: any; drops: any[] } {
  if (!m || !m.name) throw new Error("JSON inválido: campo monster.name ausente");

  const level = clamp(Math.round(num(m.level, 1)), 1, 150);
  const skills = Array.isArray(m.skills) ? m.skills : [];
  if (skills.length === 0) errors.push(`"${m.name}": nenhuma skill gerada`);
  if (!skills.some((s: any) => s.trigger === "auto")) errors.push(`"${m.name}": falta o ataque automático (trigger 'auto')`);

  const normalizedSkills = skills.map((s: any, i: number) => {
    const actions = (s.actions || []).map((a: any) => {
      const action = { ...a };
      if (!VALID_ACTIONS.includes(action.action)) errors.push(`Skill "${s.name}": ação inválida "${action.action}"`);
      if (action.action === "damage" && !VALID_DAMAGE_TYPES.includes(action.damageType)) action.damageType = "physical";
      if (Array.isArray(action.scaling)) {
        action.scaling = action.scaling.map((sc: any) => ({
          stat: ["attack", "magic"].includes(sc?.stat) ? sc.stat : "attack",
          factor: num(sc?.factor, 1),
        }));
      } else if (["damage", "heal"].includes(action.action)) {
        action.scaling = [{ stat: action.damageType === "magic" ? "magic" : "attack", factor: 1 }];
      }
      return action;
    });
    return {
      name: s.name,
      slug: slugify(s.slug || s.name),
      description: s.description || "",
      kind: VALID_SKILL_KINDS.includes(s.kind) ? s.kind : "attack",
      trigger: VALID_TRIGGERS.includes(s.trigger) ? s.trigger : "auto",
      target: s.target === "self" ? "self" : "enemy",
      cooldown: Math.max(200, Math.round(num(s.cooldown, 2000))),
      manaCost: Math.max(0, Math.round(num(s.manaCost, 0))),
      rankRequired: 1,
      sortOrder: Math.round(num(s.sortOrder, i + 1)),
      actions,
    };
  });

  // Drops: item NOVO temático (name/description) OU item existente (itemName).
  const drops = Array.isArray(m.drops)
    ? m.drops
        .map((d: any) => {
          const existing = String(d?.itemName || d?.item || "").trim();
          const newName = String(d?.name || "").trim();
          const name = existing || newName;
          if (!name) return null;
          return {
            itemName: existing || null,
            newName: existing ? null : newName,
            description: String(d?.description || "").slice(0, 200),
            dropChance: clamp(Math.round(num(d?.dropChance, 1)), 0, 100),
            minQuantity: Math.max(1, Math.round(num(d?.minQuantity, 1))),
            maxQuantity: Math.max(1, Math.round(num(d?.maxQuantity, 1))),
            minLevel: clamp(Math.round(num(d?.minLevel, 1)), 1, 150),
            maxLevel: clamp(Math.round(num(d?.maxLevel, 150)), 1, 150),
            guaranteed: !!d?.guaranteed,
          };
        })
        .filter((d: any) => d !== null)
    : [];

  const rewards = rewardsForLevel(level, !!m.isElite, !!m.isBoss, xpPerLevel);
  // "Pouco mais" de dano e defesa do que a IA sugere (pedido do dono):
  const attack = clamp(Math.round(num(m.attack, 10) * 1.2), 1, 50000);
  const defense = clamp(Math.round(num(m.defense, 5) * 1.3), 0, 50000);

  return {
    monster: {
      name: m.name,
      description: m.description || "",
      level,
      isElite: !!m.isElite,
      isBoss: !!m.isBoss,
      faction: m.faction || "",
      element: VALID_ELEMENTS.includes(m.element) ? m.element : "none",
      hp: clamp(Math.round(num(m.hp, 50)), 1, 5000000),
      mana: clamp(Math.round(num(m.mana, 20)), 0, 500000),
      attack,
      defense,
      magic: clamp(Math.round(num(m.magic, 5)), 0, 50000),
      magicDefense: clamp(Math.round(num(m.magicDefense, 5)), 0, 50000),
      speed: clamp(Math.round(num(m.speed, 10)), 1, 500),
      criticalChance: clamp(num(m.criticalChance, 2), 0, 50),
      criticalDamage: clamp(num(m.criticalDamage, 150), 100, 300),
      dodge: clamp(num(m.dodge, 1), 0, 30),
      accuracy: clamp(num(m.accuracy, 90), 70, 100),
      attackSpeed: clamp(Math.round(num(m.attackSpeed, 2000)), 1200, 5000),
      xpReward: rewards.xpReward,
      goldReward: rewards.goldReward,
      classXpReward: rewards.classXpReward,
      behavior: m.behavior || "",
      skills: normalizedSkills,
    },
    drops,
  };
}

function normalize(raw: any, errors: string[], xpPerLevel = 1250): GeneratedMonster {
  // Aceita: { "monsters": [...] }, { "monster": {...} }, objeto único ou array puro
  let arr: any[];
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.monsters)) arr = raw.monsters;
  else arr = [raw?.monster || raw];

  const entries: { monster: any; drops: any[] }[] = [];
  for (const item of arr.slice(0, MAX_MONSTERS)) {
    try {
      entries.push(normalizeOne(item, errors, xpPerLevel));
    } catch (err: any) {
      errors.push(err?.message?.includes("name ausente") ? "Monstro sem nome ignorado" : err.message);
    }
  }
  if (entries.length === 0) throw new Error("JSON inválido: campo monster.name ausente (nenhum monstro válido na resposta)");

  // Boss e elite vão para o FINAL da lista (pedido do dono: "os últimos 1 boss e 1 elite")
  const sorted = [...entries].sort((a, b) => {
    const rank = (m: any) => (m.isBoss ? 2 : m.isElite ? 1 : 0);
    return rank(a.monster) - rank(b.monster);
  });

  const first = sorted[0];

  return {
    monster: first.monster,
    monsters: sorted.map((e) => e.monster),
    drops: first.drops,
    allDrops: sorted.map((e) => e.drops),
    preview: {
      level: first.monster.level,
      hp: first.monster.hp,
      attack: first.monster.attack,
      defense: first.monster.defense,
      speed: first.monster.speed,
      drops: first.drops.length,
      count: sorted.length,
    },
    errors,
  };
}

export async function generateMonster(idea: string, providerLog: string[]): Promise<GeneratedMonster> {
  const limits = await getGameLimits();
  const prompt = buildPrompt(idea, limits.xpPerLevel);
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
        const gen = normalize(extractJson(text), errors, limits.xpPerLevel);
        gen.errors = errors;
        return gen;
      } catch (err: any) {
        lastErr = err;
      }
    }
  }
  throw new AppError(502, `Falha ao gerar monstro (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

export async function persistGeneratedMonster(gen: GeneratedMonster): Promise<any> {
  const warnings: string[] = [];
  const monsters: any[] = [];
  for (let i = 0; i < gen.monsters.length; i++) {
    const { id, warnings: w } = await persistMonsterData(gen.monsters[i], gen.allDrops[i] || []);
    warnings.push(...w);
    monsters.push({
      id,
      name: gen.monsters[i].name,
      level: gen.monsters[i].level,
      isBoss: gen.monsters[i].isBoss,
      isElite: gen.monsters[i].isElite,
      drops: (gen.allDrops[i] || []).length,
    });
  }
  if (monsters.length === 1) {
    return { ...monsters[0], warnings, errors: (gen as any).errors || [] };
  }
  return {
    monsters,
    count: monsters.length,
    warnings,
    errors: (gen as any).errors || [],
  };
}

// Cria um Monster + seus drops no banco. Reutilizado pelo gerador de raids
// (cada onda e o boss são monstros completos com drops próprios).
export async function persistMonsterData(monster: any, drops: any[]): Promise<{ id: string; warnings: string[] }> {
  const created = await prisma.monster.create({
    data: {
      name: monster.name,
      description: monster.description || "",
      level: monster.level,
      isElite: !!monster.isElite,
      isBoss: !!monster.isBoss,
      faction: monster.faction || null,
      element: monster.element || null,
      hp: monster.hp,
      mana: monster.mana,
      attack: monster.attack,
      defense: monster.defense,
      magic: monster.magic,
      magicDefense: monster.magicDefense,
      speed: monster.speed,
      criticalChance: monster.criticalChance,
      criticalDamage: monster.criticalDamage,
      dodge: monster.dodge,
      accuracy: monster.accuracy,
      attackSpeed: monster.attackSpeed,
      xpReward: monster.xpReward,
      classXpReward: monster.classXpReward ?? 0,
      goldReward: monster.goldReward,
      behavior: monster.behavior || null,
      skills: JSON.stringify(monster.skills || []),
      isActive: true,
    },
  });

  const warnings: string[] = [];
  for (const d of drops || []) {
    if (!d?.itemName && !d?.newName) continue;
    let itemId: string | null = null;

    if (d.newName) {
      // Drop temático novo: cria (ou reusa) um material de craft do monstro.
      const existing = await prisma.item.findFirst({
        where: { name: { equals: d.newName, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        itemId = existing.id;
      } else {
        const chance = clamp(Math.round(num(d.dropChance, 20)), 1, 100);
        const rarity = chance >= 40 ? "common" : chance >= 15 ? "uncommon" : chance >= 6 ? "rare" : "epic";
        const sellPrice = Math.max(2, Math.round(num(monster.xpReward, 10) * 0.08));
        const item = await prisma.item.create({
          data: {
            name: String(d.newName).slice(0, 60),
            description: String(d.description || `Matéria-prima de ${monster.name}. Usada em receitas de craft.`).slice(0, 300),
            type: "consumable",
            subtype: "material",
            rarity,
            level: monster.level,
            rank: monster.level,
            isStackable: true,
            maxStack: 99,
            buyPrice: sellPrice * 2,
            sellPrice,
            icon: "/materialicon/crystal.png",
          },
        });
        itemId = item.id;
        warnings.push(`Item criado: ${item.name}`);
      }
    } else if (d.itemName) {
      const item = await prisma.item.findFirst({ where: { name: { contains: d.itemName, mode: "insensitive" } } });
      if (!item) {
        warnings.push(`Item "${d.itemName}" não encontrado — drop ignorado`);
        continue;
      }
      itemId = item.id;
    }

    if (!itemId) continue;
    await prisma.dropItem.create({
      data: {
        monsterId: created.id,
        itemId,
        dropChance: d.dropChance,
        minQuantity: d.minQuantity,
        maxQuantity: d.maxQuantity,
        minLevel: d.minLevel,
        maxLevel: d.maxLevel,
        isGuaranteed: d.guaranteed,
      },
    });
  }
  return { id: created.id, warnings };
}
