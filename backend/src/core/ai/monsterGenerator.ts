import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { getGameLimits } from "../gameLimits";

// ===== Gerador de monstros via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão do classGenerator: Gemini primeiro, Groq como fallback.
// Gera stats, skills (DSL do motor de batalha) e drops (por NOME de item + taxa).

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

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

// Variações de nome para não repetir mobs (ex.: "Lobo", "Lobo Ancião", "Lobo das Sombras").
const NAME_VARIANTS = [
  " Sombrio", " Ancião", " Selvagem", " Gigante", " das Feras", " do Norte", " Ancestral",
  " do Abismo", " Real", " das Sombras", " Bravo", " Alfa", " da Matilha", " do Bosque",
  " Sinistro", " do Vale", " do Pântano", " das Ruínas", " do Gelo", " de Ferro",
];

export function uniqueMonsterName(base: string, used: Set<string>): string {
  const original = String(base || "").trim();
  if (!original) return original;
  if (!used.has(original)) {
    used.add(original);
    return original;
  }
  for (const v of NAME_VARIANTS) {
    const candidate = `${original}${v}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  let i = 2;
  while (used.has(`${original} ${i}`)) i++;
  const final = `${original} ${i}`;
  used.add(final);
  return final;
}

function buildPrompt(idea: string, xpPerLevel: number): string {
  return `Crie ${idea ? 'monstros de MMORPG para o pedido: "' + idea + '".' : "monstros de MMORPG."} Responda SOMENTE com JSON: {"monsters":[MONSTRO, ...]}.

FORMATO DE CADA MONSTRO (array "monsters"):
{
 "name":"nome pt-BR unico", "description":"1 frase", "level":1, "isElite":false, "isBoss":false,
 "faction":"Floresta|Masmorra|Abismo|Vila|Deserto", "element":"fire|water|nature|light|dark|thunder|ice|earth|arcane|none",
 "hp":50, "mana":20, "attack":10, "defense":5, "magic":5, "magicDefense":5, "speed":10,
 "criticalChance":2, "criticalDamage":150, "dodge":1, "accuracy":90, "attackSpeed":2000,
 "xpReward":10, "goldReward":5, "behavior":"1 frase de comportamento em combate",
 "skills":[SKILL...], "drops":[DROP...]
}

SKILL (1-3 por monstro; a 1a eh o auto: trigger auto, kind attack, cooldown 2000):
{"name":"nome criativo pt-BR","description":"1 frase","kind":"attack|buff|debuff|heal|utility","trigger":"auto|active","target":"enemy|self","cooldown":3000,"manaCost":10,"rankRequired":1,"sortOrder":1,"actions":[...]}
ACTION:
- ataque: {"action":"damage","amount":20,"scaling":[{"stat":"attack|magic","factor":0.8}],"damageType":"physical|magic"}
- cura: {"action":"heal","amount":20,"scaling":[{"stat":"magic","factor":0.7}]}
- efeito: {"action":"applyEffect","effect":"sangramento|chama-arcana|veneno-corrosivo|medo-abissal","target":"enemy|self","stacks":1}
- mana: {"action":"mana","amount":20,"restore":true}

DROP (2-3 por monstro, recursos tematicos da criatura: lobo->Presa de Lobo, aranha->Veno de Aranha, goblin->Osso de Goblin):
{"name":"Recurso pt-BR","description":"materia-prima de craft","dropChance":50,"minQuantity":1,"maxQuantity":2,"guaranteed":false}
(opicional max 1 drop de item existente: {"itemName":"Pocao de Vida","dropChance":5,"minQuantity":1,"maxQuantity":1,"guaranteed":false})

REGRAS:
- Quantidade: respeite o pedido do usuario (max 12). Sem pedido, gere 1.
- Faixa de nivel: distribua os niveis na faixa pedida (ex: 1 a 5 -> niveis 1,2,3,4,5).
- Boss/elite: se pedir "1 boss" ou "1 elite", coloque-os nos ULTIMOS itens da lista (isBoss/isElite true).
- level 1-150, hp 30-500000, attack 2-5000, attackSpeed 1200-5000, crit 0-50%, critDmg 100-300%, dodge 0-30%, accuracy 70-100%.
- defense/magicDefense ~20-40% do attack.
- xp/gold/classXp serao calculados pelo sistema (pode chutar).
- NOMES: cada monstro com nome unico e criativo. Se forem da mesma especie (ex 5 lobos), varie: "Lobo", "Lobo Anciao", "Lobo das Sombras". Nunca repita nomes.
- Skills com nomes criativos ("Corte Espectral", "Uivo da Mare"). Nunca "Ataque 1".
`;
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
  const call = async (withJsonMode: boolean) => {
    const body: any = {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "Você gera JSON válido seguindo o contrato do usuário. Responda SOMENTE com o JSON, sem markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    };
    if (withJsonMode) body.response_format = { type: "json_object" };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        if (res.status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Groq HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
      }
      const data = JSON.parse(bodyText) as any;
      const msg = data?.choices?.[0]?.message;
      // gpt-oss (OpenAI) do Groq devolve o texto no campo "reasoning" e content vazio
      const text = msg?.content?.trim() || msg?.reasoning?.trim();
      if (!text) throw new Error("Groq: resposta vazia");
      return text;
    }
    throw new Error("Groq: rate limit persistente (429)");
  };
  try {
    return await call(true);
  } catch (err: any) {
    if (String(err.message).includes("json_validate_failed") || String(err.message).includes("resposta vazia")) {
      return await call(false);
    }
    throw err;
  }
}

export { callGemini, callGroq, buildPrompt };

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

  // Não repetir nomes dentro do lote gerado (ex.: "5 lobos" → Lobo, Lobo Ancião, Lobo das Sombras...)
  const usedNames = new Set<string>();
  const deduped = sorted.map((e) => {
    const oldName = e.monster.name;
    const newName = uniqueMonsterName(oldName, usedNames);
    if (newName !== oldName) errors.push(`Nome "${oldName}" repetido — renomeado para "${newName}"`);
    return { ...e, monster: { ...e.monster, name: newName } };
  });

  const first = deduped[0];

  return {
    monster: first.monster,
    monsters: deduped.map((e) => e.monster),
    drops: first.drops,
    allDrops: deduped.map((e) => e.drops),
    preview: {
      level: first.monster.level,
      hp: first.monster.hp,
      attack: first.monster.attack,
      defense: first.monster.defense,
      speed: first.monster.speed,
      drops: first.drops.length,
      count: deduped.length,
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
  // Não repetir nome de monstro já existente no banco (renomeia com variação pt-BR)
  const warnings: string[] = [];
  const existing = await prisma.monster.findFirst({
    where: { name: { equals: monster.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    const used = new Set<string>([monster.name]);
    const allNames = await prisma.monster.findMany({ select: { name: true } });
    for (const n of allNames) used.add(n.name);
    const finalName = uniqueMonsterName(monster.name, used);
    warnings.push(`Nome "${monster.name}" já existia — renomeado para "${finalName}"`);
    monster = { ...monster, name: finalName };
  }

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

// ===== Ajuste em massa de monstros existentes via IA =====
// O dono pede algo como "aumente em 10% o HP dos mobs level 11 ao 20" e a IA
// devolve os novos valores apenas dos campos que devem mudar.

const ADJUSTABLE_FIELDS: { name: string; label: string; min: number; max: number }[] = [
  { name: "hp", label: "HP", min: 1, max: 5000000 },
  { name: "mana", label: "Mana", min: 0, max: 500000 },
  { name: "attack", label: "Ataque", min: 1, max: 50000 },
  { name: "defense", label: "Defesa", min: 0, max: 50000 },
  { name: "magic", label: "Magia", min: 0, max: 50000 },
  { name: "magicDefense", label: "Res. Mágica", min: 0, max: 50000 },
  { name: "speed", label: "Velocidade", min: 1, max: 500 },
  { name: "criticalChance", label: "Crit. Chance (%)", min: 0, max: 50 },
  { name: "criticalDamage", label: "Crit. Dano (%)", min: 100, max: 300 },
  { name: "dodge", label: "Esquiva (%)", min: 0, max: 30 },
  { name: "accuracy", label: "Precisão (%)", min: 70, max: 100 },
  { name: "attackSpeed", label: "Vel. Ataque (ms)", min: 1200, max: 5000 },
];

export interface AdjustResult {
  adjusted: number;
  changes: number;
  skipped: number;
  updated: { id: string; name: string; changes: string[] }[];
  warnings: string[];
  preview: { count: number; changes: number };
}

// Detecta faixa de nível no pedido ("level 11 ao 20", "lvl 1 a 6", "nível 3 até 5", "entre 4 e 8").
export function detectLevelRange(idea: string): { min: number; max: number } | null {
  const t = String(idea || "").toLowerCase();
  const re =
    /(?:level|lvl|n[ií]vel)\.?\s*(\d+)\s*(?:a|ao|at[eé]|at[ée]|até|~|-|–|e|entre)\s*(\d+)/i;
  const m = t.match(re);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const m2 = t.match(/entre\s+(\d+)\s+e\s+(\d+)/i);
  if (m2) {
    const a = parseInt(m2[1], 10);
    const b = parseInt(m2[2], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const m3 = t.match(/(?:level|lvl|n[ií]vel)\.?\s*(\d+)\b/i);
  if (m3) {
    const v = parseInt(m3[1], 10);
    return { min: v, max: v };
  }
  return null;
}

function buildAdjustPrompt(idea: string, monsters: any[]): string {
  const lines = monsters
    .map(
      (m) =>
        `${m.id}|${m.name}|lv ${m.level}|hp ${m.hp}|mana ${m.mana}|atk ${m.attack}|def ${m.defense}|mag ${m.magic}|rmag ${m.magicDefense}|spd ${m.speed}|crit ${m.criticalChance}%|critdmg ${m.criticalDamage}%|dodge ${m.dodge}%|acc ${m.accuracy}%|as ${m.attackSpeed}ms`
    )
    .join("\n");
  return `Você ajusta monstros de um MMORPG de texto. O dono pediu: "${idea}".

MONSTROS ATUAIS (formato: id|nome|lv hp|mana|atk|def|mag|rmag|spd|crit|critdmg|dodge|acc|as):
${lines}

RESPONDA SOMENTE com JSON: {"adjustments":[{"id":"<id do monstro>","<campo>":<novo valor>}, ...]}

REGRAS:
- Ajuste SOMENTE os monstros mencionados no pedido (faixa de nivel, nome, tipo, regiao, etc.).
- Inclua no JSON apenas os CAMPOS que devem mudar, com o VALOR FINAL calculado (ex.: "aumente em 10% o hp" -> hp * 1.10 arredondado).
- Percentual de "aumente/diminua em X%" ou multiplicador ("dobre", "triplique") = multiplique o valor atual.
- "aumente em 50" (sem %) = some 50. "reduza/diminua em 50" = subtraia 50.
- Campos validos: ${ADJUSTABLE_FIELDS.map((f) => f.name).join(", ")}.
- Limites: hp 1-5000000, mana 0-500000, attack/defense/magic/magicDefense 0-50000, speed 1-500, crit 0-50, critdmg 100-300, dodge 0-30, acc 70-100, attackSpeed 1200-5000 ms.
- NUNCA envie campos que não devem mudar. Nunca invente ids. Se nenhum monstro deve mudar, retorne {"adjustments":[]}.`;
}

export async function adjustMonsters(idea: string, providerLog: string[]): Promise<AdjustResult> {
  const where: any = { isActive: true };
  const range = detectLevelRange(idea);
  if (range) where.level = { gte: range.min, lte: range.max };

  const monsters = await prisma.monster.findMany({
    where,
    select: {
      id: true,
      name: true,
      level: true,
      hp: true,
      mana: true,
      attack: true,
      defense: true,
      magic: true,
      magicDefense: true,
      speed: true,
      criticalChance: true,
      criticalDamage: true,
      dodge: true,
      accuracy: true,
      attackSpeed: true,
    },
    orderBy: { level: "asc" },
    take: 200,
  });

  if (monsters.length === 0) {
    throw new AppError(404, range ? `Nenhum monstro ativo no nível ${range.min} a ${range.max}.` : "Nenhum monstro ativo encontrado.");
  }

  const prompt = buildAdjustPrompt(idea, monsters);
  const attempts = [
    { name: "Gemini", fn: callGemini, key: () => process.env.GEMINI_API_KEY },
    { name: "Groq", fn: callGroq, key: () => process.env.GROQ_API_KEY },
  ];
  let lastErr: Error | null = null;
  let raw: any = null;
  for (const attempt of attempts) {
    if (!attempt.key()) continue;
    for (let retry = 0; retry < 2; retry++) {
      try {
        const text = await attempt.fn(prompt);
        providerLog.push(`${attempt.name}${retry > 0 ? ` (após ${retry} retry)` : ""}`);
        raw = extractJson(text);
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }
    if (raw) break;
  }
  if (!raw) {
    throw new AppError(502, `Falha ao ajustar monstros (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
  }

  const adjustments = Array.isArray(raw.adjustments) ? raw.adjustments : [];
  const byId = new Map<string, any>(monsters.map((m) => [m.id, m]));
  const updated: AdjustResult["updated"] = [];
  let changes = 0;
  let skipped = 0;

  for (const adj of adjustments) {
    const cur = byId.get(String(adj?.id || ""));
    if (!cur) {
      skipped++;
      continue;
    }
    const diff: string[] = [];
    const data: Record<string, any> = {};
    for (const f of ADJUSTABLE_FIELDS) {
      if (adj[f.name] === undefined || adj[f.name] === null) continue;
      const val = clamp(Math.round(num(adj[f.name], cur[f.name])), f.min, f.max);
      if (val !== cur[f.name]) {
        data[f.name] = val;
        diff.push(`${f.label}: ${cur[f.name]} → ${val}`);
      }
    }
    if (diff.length === 0) {
      skipped++;
      continue;
    }
    await prisma.monster.update({ where: { id: cur.id }, data });
    changes += diff.length;
    updated.push({ id: cur.id, name: cur.name, changes: diff });
  }

  const warnings: string[] = [];
  if (range && monsters.length >= 200) warnings.push("Limite de 200 monstros por ajuste atingido — refine a faixa de nível para ajustar o restante.");

  return {
    adjusted: updated.length,
    changes,
    skipped,
    updated,
    warnings,
    preview: { count: updated.length, changes },
  };
}
