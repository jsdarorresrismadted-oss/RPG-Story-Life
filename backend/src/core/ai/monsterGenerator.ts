import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";

// ===== Gerador de monstros via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão do classGenerator: Gemini primeiro, Groq como fallback.
// Gera stats, skills (DSL do motor de batalha) e drops (por NOME de item + taxa).

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export interface GeneratedMonster {
  monster: any;
  drops: any[];
  preview: Record<string, number>;
  errors?: string[];
}

export const VALID_ELEMENTS = ["fire", "water", "nature", "light", "dark", "thunder", "ice", "earth", "arcane", "none"];
const VALID_DAMAGE_TYPES = ["physical", "magic", "true"];const VALID_TRIGGERS = ["auto", "active"];
const VALID_SKILL_KINDS = ["attack", "buff", "debuff", "heal", "utility"];
const VALID_ACTIONS = ["damage", "heal", "applyEffect", "mana"];

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

function buildPrompt(idea: string): string {
  return `Você é um designer de monstros de um MMORPG de texto. Gere UM monstro completo seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "monster": {
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
}

REGRAS DE STATS:
- level 1 a 99. hp 30 a 500000 (bosses podem ter muito mais), attack 2 a 5000.
- criticalChance 0 a 50 (%), criticalDamage 100 a 300 (%), dodge 0 a 30 (%), accuracy 70 a 100 (%).
- attackSpeed 1200 a 5000 (ms entre ataques).

REGRAS DE SKILLS (1 a 4 skills):
- A PRIMEIRA é o ataque automático: trigger "auto", kind "attack", cooldown 2000, actions: [{ action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: 0.8-1.2 }], damageType: "physical"|"magic" }].
- Demais: trigger "active", cooldown 3000-20000, actions válidas:
  • { action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: <0.5-2> }], damageType: "physical"|"magic" }
  • { action: "heal", amount: <n>, scaling: [{ stat: "magic", factor: <0.5-1> }] }
  • { action: "applyEffect", effect: "sangramento"|"chama-arcana"|"veneno-corrosivo"|"medo-abissal", target: "enemy"|"self", stacks: 1-3 }
  • { action: "mana", amount: <n>, restore: true }
- Cada skill: { name, description, kind, trigger, target: "enemy"|"self", cooldown, manaCost, rankRequired: 1, sortOrder, actions }.

REGRAS DE DROPS (2 a 5 itens):
- drops: [{ "itemName": "Nome EXATO do item existente no jogo (ex: Espada de Ferro, Poção de Vida, Fragmento do Abismo)", "dropChance": <1-100 %>, "minQuantity": 1, "maxQuantity": 1, "minLevel": 1, "maxLevel": 99, "guaranteed": false }]
- Distribua dropChance de forma coerente: itens fracos mais comuns (30-70%), raros mais raros (1-10%).

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

function normalize(raw: any, errors: string[]): GeneratedMonster {
  const m = raw?.monster || raw;
  if (!m || !m.name) throw new Error("JSON inválido: campo monster.name ausente");

  const level = clamp(Math.round(num(m.level, 1)), 1, 99);
  const skills = Array.isArray(m.skills) ? m.skills : [];
  if (skills.length === 0) errors.push("Nenhuma skill gerada");
  if (!skills.some((s: any) => s.trigger === "auto")) errors.push("Falta o ataque automático (trigger 'auto')");

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

  const drops = Array.isArray(m.drops)
    ? m.drops
        .map((d: any) => ({
          itemName: String(d?.itemName || d?.item || "").trim(),
          dropChance: clamp(Math.round(num(d?.dropChance, 1)), 0, 100),
          minQuantity: Math.max(1, Math.round(num(d?.minQuantity, 1))),
          maxQuantity: Math.max(1, Math.round(num(d?.maxQuantity, 1))),
          minLevel: clamp(Math.round(num(d?.minLevel, 1)), 1, 99),
          maxLevel: clamp(Math.round(num(d?.maxLevel, 99)), 1, 99),
          guaranteed: !!d?.guaranteed,
        }))
        .filter((d: any) => d.itemName)
    : [];

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
      attack: clamp(Math.round(num(m.attack, 10)), 1, 50000),
      defense: clamp(Math.round(num(m.defense, 5)), 0, 50000),
      magic: clamp(Math.round(num(m.magic, 5)), 0, 50000),
      magicDefense: clamp(Math.round(num(m.magicDefense, 5)), 0, 50000),
      speed: clamp(Math.round(num(m.speed, 10)), 1, 500),
      criticalChance: clamp(num(m.criticalChance, 2), 0, 50),
      criticalDamage: clamp(num(m.criticalDamage, 150), 100, 300),
      dodge: clamp(num(m.dodge, 1), 0, 30),
      accuracy: clamp(num(m.accuracy, 90), 70, 100),
      attackSpeed: clamp(Math.round(num(m.attackSpeed, 2000)), 1200, 5000),
      xpReward: Math.max(0, Math.round(num(m.xpReward, 10))),
      goldReward: Math.max(0, Math.round(num(m.goldReward, 5))),
      behavior: m.behavior || "",
      skills: normalizedSkills,
    },
    drops,
    preview: {
      level,
      hp: clamp(Math.round(num(m.hp, 50)), 1, 5000000),
      attack: clamp(Math.round(num(m.attack, 10)), 1, 50000),
      defense: clamp(Math.round(num(m.defense, 5)), 0, 50000),
      speed: clamp(Math.round(num(m.speed, 10)), 1, 500),
      drops: drops.length,
    },
    errors,
  };
}

export async function generateMonster(idea: string, providerLog: string[]): Promise<GeneratedMonster> {
  const prompt = buildPrompt(idea);
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
        const gen = normalize(extractJson(text), errors);
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
  const { id, warnings } = await persistMonsterData(gen.monster, gen.drops);
  return {
    id,
    name: gen.monster.name,
    level: gen.monster.level,
    isBoss: gen.monster.isBoss,
    isElite: gen.monster.isElite,
    drops: gen.drops.length,
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
      goldReward: monster.goldReward,
      behavior: monster.behavior || null,
      skills: JSON.stringify(monster.skills || []),
      isActive: true,
    },
  });

  const warnings: string[] = [];
  for (const d of drops || []) {
    if (!d?.itemName) continue;
    const item = await prisma.item.findFirst({ where: { name: { contains: d.itemName, mode: "insensitive" } } });
    if (!item) {
      warnings.push(`Item "${d.itemName}" não encontrado — drop ignorado`);
      continue;
    }
    await prisma.dropItem.create({
      data: {
        monsterId: created.id,
        itemId: item.id,
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
