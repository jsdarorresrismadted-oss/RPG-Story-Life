import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { computeStats } from "../classEngine/stat-calculator";

// ===== Gerador de classes via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Chaves: GEMINI_API_KEY e GROQ_API_KEY (variáveis de ambiente).
// Gemini é tentado primeiro; se falhar, Groq é o fallback.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function aiProvidersAvailable() {
  return {
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  };
}

export interface GeneratedClass {
  cls: any;
  sm: any;
  skills: any[];
  passives: any[];
  effects: any[];
  preview: Record<string, number>;
  errors?: string[];
}

// Templates de statModel (base/scaling/conversions são LEGADO — engine usa só coreStats)
const CATEGORY_TEMPLATES: Record<string, any> = {
  tank: {
    base: { hp: 140, mana: 60, magic: 4, speed: 5, attack: 14, defense: 16, magicDefense: 12 },
    scaling: { aggroPerHit: 30, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 25, manaRegenPerTick: 4, critChancePerSpeed: 0.5, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.5 },
      { stat: "endurance", target: "hp", factor: 12 },
      { stat: "endurance", target: "defense", factor: 0.8 },
      { stat: "dexterity", target: "hitChance", factor: 0.3 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 2, critMultiplier: 150, evasion: 1, cooldownReduction: 0 },
    bonuses: { damageResistance: 10, physicalResistance: 15, magicalResistance: 10, threatPerAttack: 25 },
  },
  caster: {
    base: { hp: 90, mana: 130, magic: 20, speed: 6, attack: 6, defense: 8, magicDefense: 12 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 10, manaRegenPerTick: 12, critChancePerSpeed: 0.5, healthRegenPerTick: 1, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "intellect", target: "spellPower", factor: 1.5 },
      { stat: "wisdom", target: "mana", factor: 8 },
      { stat: "wisdom", target: "magicDefense", factor: 0.6 },
      { stat: "luck", target: "critChance", factor: 0.1 },
    ],
    combatStatsBase: { hitChance: 95, critChance: 5, critMultiplier: 160, evasion: 1, cooldownReduction: 5 },
    bonuses: { magicalBoost: 10 },
  },
  melee: {
    base: { hp: 110, mana: 70, magic: 6, speed: 12, attack: 20, defense: 10, magicDefense: 8 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.8, critDamageBase: 180, threatPerAttack: 15, manaRegenPerTick: 6, critChancePerSpeed: 1.2, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.3 },
      { stat: "dexterity", target: "hitChance", factor: 0.5 },
      { stat: "luck", target: "critChance", factor: 0.15 },
      { stat: "luck", target: "critDamage", factor: 1.2 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 8, critMultiplier: 180, evasion: 4, cooldownReduction: 3 },
    bonuses: { physicalBoost: 8, penetration: 5 },
  },
  support: {
    base: { hp: 100, mana: 120, magic: 16, speed: 6, attack: 8, defense: 10, magicDefense: 12 },
    scaling: { aggroPerHit: 10, dodgePerSpeed: 0.25, critDamageBase: 150, threatPerAttack: 10, manaRegenPerTick: 10, critChancePerSpeed: 0.5, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "intellect", target: "spellPower", factor: 1.2 },
      { stat: "wisdom", target: "mana", factor: 10 },
      { stat: "wisdom", target: "manaRegenPerTick", factor: 0.4 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 3, critMultiplier: 150, evasion: 2, cooldownReduction: 8 },
    bonuses: { healingBoost: 15, damageResistance: 5 },
  },
  hybrid: {
    base: { hp: 100, mana: 100, magic: 12, speed: 7, attack: 12, defense: 10, magicDefense: 10 },
    scaling: { aggroPerHit: 12, dodgePerSpeed: 0.3, critDamageBase: 155, threatPerAttack: 12, manaRegenPerTick: 8, critChancePerSpeed: 0.6, healthRegenPerTick: 2, spellPowerPerMagic: 1, attackPowerPerAttack: 1 },
    conversions: [
      { stat: "strength", target: "attackPower", factor: 1.1 },
      { stat: "intellect", target: "spellPower", factor: 1.1 },
      { stat: "luck", target: "critChance", factor: 0.1 },
    ],
    combatStatsBase: { hitChance: 100, critChance: 5, critMultiplier: 155, evasion: 2, cooldownReduction: 4 },
    bonuses: { damageBoost: 4, healingBoost: 4 },
  },
};

const CORE_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];
const VALID_ROLES = ["tank", "mage", "dps", "assassin", "support", "hybrid"];
const VALID_CATEGORIES = Object.keys(CATEGORY_TEMPLATES);
const VALID_KINDS = ["attack", "buff", "debuff", "heal", "shield", "utility"];
const VALID_TRIGGERS = ["auto", "active", "ultimate"];
const VALID_TARGETS = ["enemy", "self", "ally"];
const VALID_DAMAGE_TYPES = ["physical", "magic", "true"];
const VALID_ACTIONS = ["damage", "heal", "applyEffect", "mana"];
const DEFAULT_SKILL_ICONS: Record<string, string> = {
  attack: "Swords",
  buff: "ShieldCheck",
  debuff: "Skull",
  heal: "Heart",
  shield: "Shield",
  utility: "Zap",
};
const VALID_EFFECT_KINDS = ["buff", "debuff", "hot", "dot", "shield", "reflect", "hitkill", "silence", "stun", "nuke"];
const VALID_SCALE_STATS = ["attack", "magic", "defense", "hp", "mana"];
const FLAT_PASSIVE_KEYS = ["attack", "defense", "magic", "magicDefense", "hp", "mana", "speed", "critChance", "critDamage", "dodge", "hitChance", "manaRegenPerTick", "healthRegenPerTick", "cooldownReduction", "attackPower", "spellPower", "physicalResistance", "magicalResistance", "damageResistance", "penetration"];
const PERCENT_PASSIVE_KEYS = ["hp", "mana", "attack", "defense", "magic", "magicDefense", "speed", "critChance", "critDamage", "dodge", "hitChance", "cooldownReduction", "manaCostReduction", "damagePercent", "physicalDamagePercent", "magicDamagePercent", "healingPercent", "dotPercent", "overhealPercent"];

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildPrompt(idea: string): string {
  return `Você é um designer de classes de um MMORPG de texto. Gere UMA classe completa seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "class": {
    "name": "Nome pt-BR da classe",
    "slug": "slug-unico-kebab-case",
    "description": "Uma frase curta.",
    "lore": "2-3 frases de história.",
    "icon": "Nome de ícone lucide (ex: Sword, Wand2, Shield, Skull, HeartPulse)",
    "element": "fire|water|nature|light|dark|thunder|ice|earth|arcane",
    "rarity": "common|uncommon|rare|epic|legendary|mythic",
    "difficulty": "easy|medium|hard",
    "role": "tank|mage|dps|assassin|support|hybrid",
    "combatType": "melee|ranged",
    "statModelSlug": "sm-NOMEDACLASSE-kebab-case (NUNCA reutilize: tank, caster, dps, support, hybrid)",
    "requiredLevel": 1,
    "price": 0,
    "sortOrder": 99
  },
  "statModel": {
    "name": "Nome do stat model",
    "slug": "igual a statModelSlug da classe",
    "description": "Frase curta.",
    "category": "tank|caster|melee|support|hybrid",
    "coreStats": { "strength": 0, "intellect": 0, "endurance": 0, "dexterity": 0, "wisdom": 0, "luck": 0 }
  },
  "skills": [ ... ],
  "passives": [ ... ],
  "effects": [ ... ]
}

REGRAS DE CORE STATS (${CORE_KEYS.join(", ")}):
- Valores inteiros de 0 a 999999 (pontos altos são permitidos: cada ponto converte pouco, então classes fortes precisam de pontos altos — ex.: 200+ pontos para chance de crítico relevante).
- SOMA TOTAL livre (sem limite máximo). Distribua de acordo com a fantasy da classe (tank = endurance/strength; mage = intellect; assassino = dexterity/luck; suporte = wisdom/intellect).

REGRAS DE SKILLS (2 a 5 skills):
- A PRIMEIRA skill é o ataque automático: trigger "auto", kind "attack", target "enemy", cooldown 2000, manaCost 0, rankRequired 1, sortOrder 1, actions: [{ action: "damage", amount: 6-10, scaling: [{ stat: "attack"|"magic", factor: 0.8-1.2 }], damageType: "physical"|"magic" }].
- Demais skills: trigger "active" (rankRequired 1, 3 ou 5) ou "ultimate" (rankRequired 8), cooldown 3000-30000, manaCost 5-35, sortOrder crescente.
- Ações válidas (actions):
  • { action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: <0.5-2> }], damageType: "physical"|"magic" }
  • { action: "heal", amount: <n>, scaling: [{ stat: "magic", factor: <0.5-1.5> }] }
  • { action: "applyEffect", effect: "<slug-do-efeito>", target: "self"|"enemy", stacks: <1-3> }
- Toda skill que usar applyEffect DEVE referenciar um efeito existente em "effects" (você gera) ou um já existente no jogo (furia-do-guerreiro, armadura-arcana, passo-das-sombras, foco-arcano, bencao-da-luz, sangramento, chama-arcana, veneno-corrosivo).

REGRAS DE PASSIVAS (exatamente 3):
- rankRequired: 1, 4 e 7. sortOrder: 1, 2, 3.
- statModifiers: { flat: { <chave>: <n> }, percent: { <chave>: <n> } } — use um ou ambos.
- Chaves flat válidas: ${FLAT_PASSIVE_KEYS.join(", ")}.
- Chaves percent válidas: ${PERCENT_PASSIVE_KEYS.join(", ")} (valores em %).

REGRAS DE EFFECTS (somente se alguma skill precisar de efeito novo):
- kind: ${VALID_EFFECT_KINDS.join("|")}
- Efeito de REFLETIR dano (kind "reflect"): { name, slug, description, kind: "reflect", category: "defense", duration: 8000-15000, maxStacks: 1, refreshBehavior: "refresh", reflect: { percent: 15-40 } }.
- Buff/Debuff de stat: { name, slug, description, kind: "buff"|"debuff", category: "stat", duration: 10000-20000, maxStacks: 1-3, refreshBehavior: "stack", statModifiers: { flat: { <chave>: <n> } } }.
- DOT/HOT: { kind: "dot"|"hot", category: "damage"|"healing", duration: 8000-12000, tickInterval: 2000, tickDamage: { base: <n>, scaling: [{ stat: "attack"|"magic", factor: 0.3-0.5 }], damageType: "physical"|"magic" } ou tickHealing: { base: <n>, scaling: [{ stat: "magic", factor: 0.5 }] } }.

PEDIDO DO USUÁRIO (atenda fielmente, incluindo tema, fantasia, elementos e mecânicas pedidos):
"${idea}"

Exemplo de skill com reflect (se o pedido for reflect):
- effect: { name: "Armadura Espinhosa", slug: "armadura-espinhosa", description: "Espinhos mágicos refletem dano ao atacante.", kind: "reflect", category: "defense", duration: 10000, maxStacks: 1, refreshBehavior: "refresh", reflect: { percent: 30 } }
- skill: { name: "Espinhos Arcanos", slug: "espinhos-arcanos", description: "Envolve-se em espinhos que refletem dano.", kind: "buff", trigger: "active", target: "self", cooldown: 12000, manaCost: 15, rankRequired: 3, sortOrder: 2, actions: [{ action: "applyEffect", effect: "armadura-espinhosa", target: "self", stacks: 1 }] }`;
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

function extractJson(text: string): any {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta não contém JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalize(raw: any, errors: string[]): GeneratedClass {
  if (!raw || typeof raw !== "object") throw new Error("JSON inválido: objeto raiz ausente");
  const cls = raw.class || raw.gameClass;
  if (!cls || !cls.name) throw new Error("JSON inválido: campo class.name ausente");

  const sm = raw.statModel || {};
  const stats: Record<string, number> = {};
  let total = 0;
  for (const k of CORE_KEYS) {
    const v = Math.max(0, Math.min(999999, Math.round(num(sm.coreStats?.[k], 0))));
    stats[k] = v;
    total += v;
  }
  if (total < 6) errors.push(`Soma de coreStats (${total}) muito baixa — a classe ficará fraca`);

  const role = VALID_ROLES.includes(cls.role) ? cls.role : "hybrid";
  const category = VALID_CATEGORIES.includes(sm.category) ? sm.category : "hybrid";
  const classSlug = slugify(cls.name);
  const smSlug = `sm-${classSlug}`;

  const skills = Array.isArray(raw.skills) && raw.skills.length > 0 ? raw.skills : [];
  if (skills.length === 0) errors.push("Nenhuma skill gerada");
  if (!skills.some((s: any) => s.trigger === "auto")) errors.push("Falta o ataque automático (trigger 'auto')");

  const passives = Array.isArray(raw.passives) ? raw.passives : [];
  if (passives.length !== 3) errors.push(`Esperado 3 passivas, veio ${passives.length}`);

  const effects = Array.isArray(raw.effects) ? raw.effects : [];

  const existingEffects = new Set([
    "furia-do-guerreiro", "armadura-arcana", "passo-das-sombras", "foco-arcano",
    "bencao-da-luz", "sangramento", "chama-arcana", "veneno-corrosivo",
    ...effects.map((e: any) => slugify(e.slug || e.name)),
  ]);
  for (const skill of skills) {
    for (const action of skill.actions || []) {
      if (action.action === "applyEffect" && !existingEffects.has(slugify(action.effect))) {
        errors.push(`Skill "${skill.name}" referencia efeito inexistente: ${action.effect}`);
      }
    }
  }

  const normalizedSkills = skills.map((s: any, i: number) => {
    const actions = (s.actions || []).map((a: any) => {
      const action = { ...a };
      if (!VALID_ACTIONS.includes(action.action)) errors.push(`Skill "${s.name}": ação inválida "${action.action}"`);
      if (action.action === "damage" && !VALID_DAMAGE_TYPES.includes(action.damageType)) action.damageType = "physical";
      if (Array.isArray(action.scaling)) {
        action.scaling = action.scaling.map((sc: any) => ({
          stat: VALID_SCALE_STATS.includes(sc?.stat) ? sc.stat : "attack",
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
      icon: s.icon || DEFAULT_SKILL_ICONS[s.kind] || "Zap",
      kind: VALID_KINDS.includes(s.kind) ? s.kind : "attack",
      trigger: VALID_TRIGGERS.includes(s.trigger) ? s.trigger : "active",
      target: VALID_TARGETS.includes(s.target) ? s.target : "enemy",
      cooldown: Math.max(0, Math.round(num(s.cooldown, 0))),
      manaCost: Math.max(0, Math.round(num(s.manaCost, 0))),
      rankRequired: [1, 3, 5, 8].includes(num(s.rankRequired, 1)) ? num(s.rankRequired, 1) : i === 0 ? 1 : 3,
      sortOrder: Math.round(num(s.sortOrder, i + 1)),
      actions,
    };
  });

  const normalizedPassives = passives.map((p: any, i: number) => {
    const flat: Record<string, number> = {};
    const percent: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.statModifiers?.flat || {})) {
      if (FLAT_PASSIVE_KEYS.includes(k)) flat[k] = num(v, 0);
      else errors.push(`Passiva "${p.name}": chave flat inválida "${k}"`);
    }
    for (const [k, v] of Object.entries(p.statModifiers?.percent || {})) {
      if (PERCENT_PASSIVE_KEYS.includes(k)) percent[k] = num(v, 0);
      else if (FLAT_PASSIVE_KEYS.includes(k)) {
        flat[k] = num(v, 0);
        errors.push(`Passiva "${p.name}": "${k}" em percent — movida para flat`);
      } else {
        errors.push(`Passiva "${p.name}": chave percent inválida "${k}"`);
      }
    }
    if (Object.keys(flat).length === 0 && Object.keys(percent).length === 0) {
      flat.defense = 5;
      errors.push(`Passiva "${p.name}": sem modificadores válidos — aplicado flat defense +5 como padrão`);
    }
    return {
      name: p.name,
      slug: slugify(p.slug || p.name),
      description: p.description || "",
      rankRequired: [1, 4, 7][i] || num(p.rankRequired, [1, 4, 7][i] || 1),
      sortOrder: i + 1,
      statModifiers: { flat, percent },
    };
  });

  const normalizedEffects = effects.map((e: any) => {
    const eff: any = {
      name: e.name,
      slug: slugify(e.slug || e.name),
      description: e.description || "",
      kind: VALID_EFFECT_KINDS.includes(e.kind) ? e.kind : "buff",
      category: e.category || "utility",
      duration: Math.round(num(e.duration, 0)),
      maxStacks: Math.round(num(e.maxStacks, 1)),
      refreshBehavior: e.refreshBehavior || "refresh",
    };
    if (eff.kind === "reflect") {
      eff.reflect = { percent: Math.min(60, Math.max(5, Math.round(num(e.reflect?.percent, 30)))) };
    } else if (eff.kind === "dot") {
      eff.tickInterval = Math.round(num(e.tickInterval, 2000));
      eff.tickDamage = e.tickDamage || {};
    } else if (eff.kind === "hot") {
      eff.tickInterval = Math.round(num(e.tickInterval, 2000));
      eff.tickHealing = e.tickHealing || {};
    } else {
      eff.statModifiers = e.statModifiers || {};
    }
    return eff;
  });

  return {
    cls: {
      name: cls.name,
      slug: classSlug,
      description: cls.description || "",
      lore: cls.lore || "",
      icon: cls.icon || "Swords",
      element: cls.element || "arcane",
      rarity: cls.rarity || "uncommon",
      difficulty: cls.difficulty || "medium",
      role,
      combatType: cls.combatType === "ranged" ? "ranged" : "melee",
      statModel: smSlug,
      requiredLevel: Math.max(1, Math.round(num(cls.requiredLevel, 1))),
      price: Math.max(0, Math.round(num(cls.price, 0))),
      sortOrder: Math.round(num(cls.sortOrder, 99)),
    },
    sm: {
      name: sm.name || `${cls.name} Stats`,
      slug: smSlug,
      description: sm.description || "",
      category,
      coreStats: stats,
    },
    skills: normalizedSkills,
    passives: normalizedPassives,
    effects: normalizedEffects,
    preview: {},
  };
}

function computePreview(gen: GeneratedClass): Record<string, number> {
  const stats = computeStats({
    level: 1,
    statModel: { coreStats: gen.sm.coreStats },
    resource: {},
    passives: gen.passives.map((p) => ({ ...p, statModifiers: p.statModifiers || {} })),
  });
  return {
    hp: stats.hp,
    mana: stats.mana,
    attackPower: stats.attackPower,
    spellPower: stats.spellPower,
    hitChance: stats.hitChance,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    dodge: stats.dodge,
    manaRegenPerTick: stats.manaRegenPerTick,
    cooldownReduction: stats.cooldownReduction,
    physicalDamagePercent: stats.physicalDamagePercent,
    magicalDamagePercent: stats.magicalDamagePercent,
  };
}

export async function generateClass(idea: string, providerLog: string[]): Promise<GeneratedClass> {
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
        const raw = extractJson(text);
        const errors: string[] = [];
        const gen = normalize(raw, errors);
        gen.preview = computePreview(gen);
        gen.errors = errors;
        return gen;      } catch (err: any) {
        lastErr = err;
      }
    }
  }
  throw new AppError(502, `Falha ao gerar classe (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

export async function persistGeneratedClass(gen: GeneratedClass): Promise<any> {
  // 1) Effects (upsert por slug)
  const effectMap = new Map<string, string>();
  for (const e of gen.effects) {
    const existing = await prisma.effect.findFirst({ where: { OR: [{ slug: e.slug }, { name: e.name }] } });
    const data = {
      name: e.name,
      slug: e.slug,
      description: e.description || "",
      kind: e.kind,
      category: e.category || "utility",
      maxStacks: e.maxStacks ?? 1,
      duration: e.duration ?? 0,
      refreshBehavior: e.refreshBehavior || "refresh",
      stackLoss: {},
      priority: 0,
      tickInterval: e.tickInterval ?? 0,
      tickDamage: e.tickDamage || {},
      tickHealing: e.tickHealing || {},
      statModifiers: e.statModifiers || {},
      shield: {},
      reflect: e.reflect || {},
      onMaxStacks: [],
      onExpire: [],
      onTick: [],
      isActive: true,
    };
    const saved = existing
      ? await prisma.effect.update({ where: { id: existing.id }, data })
      : await prisma.effect.create({ data });
    effectMap.set(e.slug, saved.id);
  }

  // 2) StatModel (upsert por slug)
  const tpl = CATEGORY_TEMPLATES[gen.sm.category] || CATEGORY_TEMPLATES.hybrid;
  const smExisting = await prisma.statModel.findUnique({ where: { slug: gen.sm.slug } });
  const smNameConflict = await prisma.statModel.findFirst({ where: { name: gen.sm.name, slug: { not: gen.sm.slug } } });
  if (smNameConflict) throw new AppError(409, `Já existe um Stat Model com nome "${gen.sm.name}"`);
  const statModel = smExisting
    ? await prisma.statModel.update({
        where: { id: smExisting.id },
        data: { name: gen.sm.name, description: gen.sm.description, category: gen.sm.category, coreStats: gen.sm.coreStats, bonuses: tpl.bonuses },
      })
    : await prisma.statModel.create({
        data: {
          name: gen.sm.name,
          slug: gen.sm.slug,
          description: gen.sm.description || "",
          category: gen.sm.category,
          base: tpl.base,
          perLevel: {},
          scaling: tpl.scaling,
          coreStats: gen.sm.coreStats,
          coreStatsPerLevel: {},
          conversions: tpl.conversions,
          combatStatsBase: tpl.combatStatsBase,
          bonuses: tpl.bonuses,
          isActive: true,
        },
      });

  // 3) GameClass (rascunho — isActive: false)
  const cls = gen.cls;
  const clsConflict = await prisma.gameClass.findFirst({ where: { OR: [{ slug: cls.slug }, { name: cls.name }] } });
  if (clsConflict) throw new AppError(409, `Já existe uma classe com slug "${cls.slug}" ou nome "${cls.name}"`);
  const gameClass = await prisma.gameClass.create({
    data: {
      name: cls.name,
      slug: cls.slug,
      description: cls.description || "",
      icon: cls.icon || null,
      role: cls.role,
      combatType: cls.combatType,
      rankMax: 10,
      requiredLevel: cls.requiredLevel,
      requiredVip: false,
      price: cls.price,
      statModelId: statModel.id,
      resource: {},
      isStarter: false,
      isActive: false,
      sortOrder: cls.sortOrder,
    },
  });

  // 4) Skills + passivas
  for (const s of gen.skills) {
    const icon: string | null = s.icon || null;
    await prisma.skill.create({
      data: {
        name: s.name,
        slug: s.slug,
        description: s.description || "",
        icon,
        kind: s.kind,
        trigger: s.trigger,
        target: s.target,
        cooldown: s.cooldown,
        manaCost: s.manaCost,
        castTime: 0,
        channelMs: 0,
        rankRequired: s.rankRequired,
        sortOrder: s.sortOrder,
        scaling: [],
        actions: s.actions,
        conditions: [],
        onConditionMet: [],
        events: [],
        isActive: true,
        classId: gameClass.id,
      },
    });
  }
  for (const p of gen.passives) {
    const icon: string | null = null;
    await prisma.passive.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description || "",
        icon,
        rankRequired: p.rankRequired,
        sortOrder: p.sortOrder,
        statModifiers: p.statModifiers,
        skillModifiers: [],
        effectModifiers: [],
        conditions: [],
        events: [],
        isActive: true,
        classId: gameClass.id,
      },
    });
  }

  return {
    id: gameClass.id,
    name: gameClass.name,
    slug: gameClass.slug,
    role: gameClass.role,
    combatType: gameClass.combatType,
    requiredLevel: gameClass.requiredLevel,
    price: gameClass.price,
    isActive: gameClass.isActive,
    skills: gen.skills.length,
    passives: gen.passives.length,
    effects: gen.effects.map((e: any) => e.slug),
    coreStats: gen.sm.coreStats,
    preview: gen.preview,
    warnings: (gen as any).errors || [],
  };
}
