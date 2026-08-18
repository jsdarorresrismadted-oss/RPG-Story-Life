import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num, clamp, persistMonsterData, VALID_ELEMENTS } from "./monsterGenerator";

// ===== Gerador de raids via IA =====
// Gera um mapa de raid completo: config do mapa + ondas (monstros comuns) + boss,
// cada um com stats, skills e drops. O motor de raid (RaidService) monta as ondas
// agregadas a partir dos monstros vinculados ao mapa (MapMonster).

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

export interface GeneratedRaid {
  raid: any;
  waves: any[];
  boss: any | null;
  warnings?: string[];
  errors?: string[];
}

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPrompt(idea: string): string {
  return `Você é um designer de raids de um MMORPG de texto. Gere UM raid completo seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "raid": {
    "name": "Nome pt-BR do raid",
    "description": "Uma frase curta.",
    "region": "Região do mapa (ex: Montanhas Negras)",
    "requiredLevel": 20,
    "raidResetHours": 24,
    "maxRaidAttempts": 3,
    "raidWaves": 10,
    "raidDifficulty": 2.0,
    "waves": [ <monstro da onda>, ... 2 a 5 monstros ],
    "boss": <monstro do boss>
  }
}

REGRAS DO MAPA:
- requiredLevel 1-99. raidWaves 5-20 (nº de ondas de horda antes do boss). raidDifficulty 1-5 (multiplicador de força).
- maxRaidAttempts 1-10. raidResetHours 8-72.

FORMATO DE CADA MONSTRO (onda ou boss):
{
  "name": "Nome pt-BR",
  "description": "Frase curta.",
  "level": N,
  "isElite": false,
  "isBoss": false,
  "faction": "ex: Horda Negra, Culto do Abismo",
  "element": "fire|water|nature|light|dark|thunder|ice|earth|arcane|none",
  "hp": N, "mana": N, "attack": N, "defense": N, "magic": N, "magicDefense": N, "speed": N,
  "criticalChance": N, "criticalDamage": N, "dodge": N, "accuracy": N,
  "attackSpeed": N,
  "xpReward": N, "goldReward": N,
  "behavior": "Frase curta.",
  "skills": [ ... 1 a 4 skills (DSL do motor: { name, description, kind: attack|buff|debuff|heal, trigger: auto|active, target: enemy|self, cooldown, manaCost, actions: [{ action: damage|heal|applyEffect|mana, ... }] }) ],
  "drops": [ { "itemName": "Nome de item existente", "dropChance": <1-100>, "minQuantity": 1, "maxQuantity": 1, "minLevel": 1, "maxLevel": 99, "guaranteed": false } ]
}

REGRAS DE DIFICULDADE:
- O boss deve ser BEM mais forte que as ondas (hp 10-50x, attack 3-10x) e deve dropar itens raros com dropChance baixa (1-15%).
- Ondas progressivamente mais fortes: level e stats crescentes entre as ondas.
- Boss: "isBoss": true. Ondas: "isBoss": false.

PEDIDO DO USUÁRIO (atenda fielmente o tema, a fantasia e as mecânicas pedidas):
"${idea}"`;
}

function normalizeMonsterShape(m: any, errors: string[], isBoss: boolean): any {
  const skills = Array.isArray(m.skills) ? m.skills : [];
  if (skills.length === 0) errors.push(`Monstro "${m.name}": nenhuma skill gerada`);
  if (!skills.some((s: any) => s.trigger === "auto")) errors.push(`Monstro "${m.name}": falta ataque automático`);

  const normalizedSkills = skills.map((s: any, i: number) => ({
    name: s.name,
    slug: slugify(s.slug || s.name),
    description: s.description || "",
    kind: ["attack", "buff", "debuff", "heal", "utility"].includes(s.kind) ? s.kind : "attack",
    trigger: s.trigger === "active" ? "active" : "auto",
    target: s.target === "self" ? "self" : "enemy",
    cooldown: Math.max(200, Math.round(num(s.cooldown, 2000))),
    manaCost: Math.max(0, Math.round(num(s.manaCost, 0))),
    rankRequired: 1,
    sortOrder: Math.round(num(s.sortOrder, i + 1)),
    actions: (s.actions || []).map((a: any) => {
      const action = { ...a };
      if (action.action === "damage" && !["physical", "magic", "true"].includes(action.damageType)) action.damageType = "physical";
      if (Array.isArray(action.scaling)) {
        action.scaling = action.scaling.map((sc: any) => ({ stat: ["attack", "magic"].includes(sc?.stat) ? sc.stat : "attack", factor: num(sc?.factor, 1) }));
      } else if (["damage", "heal"].includes(action.action)) {
        action.scaling = [{ stat: action.damageType === "magic" ? "magic" : "attack", factor: 1 }];
      }
      return action;
    }),
  }));

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
    name: m.name,
    description: m.description || "",
    level: clamp(Math.round(num(m.level, 1)), 1, 99),
    isElite: !!m.isElite,
    isBoss,
    faction: m.faction || "",
    element: VALID_ELEMENTS.includes(m.element) ? m.element : "none",
    hp: clamp(Math.round(num(m.hp, isBoss ? 5000 : 200)), 1, 50000000),
    mana: clamp(Math.round(num(m.mana, isBoss ? 500 : 50)), 0, 5000000),
    attack: clamp(Math.round(num(m.attack, isBoss ? 200 : 30)), 1, 100000),
    defense: clamp(Math.round(num(m.defense, isBoss ? 100 : 20)), 0, 50000),
    magic: clamp(Math.round(num(m.magic, isBoss ? 150 : 20)), 0, 100000),
    magicDefense: clamp(Math.round(num(m.magicDefense, isBoss ? 100 : 20)), 0, 50000),
    speed: clamp(Math.round(num(m.speed, 10)), 1, 500),
    criticalChance: clamp(num(m.criticalChance, isBoss ? 10 : 3), 0, 50),
    criticalDamage: clamp(num(m.criticalDamage, isBoss ? 180 : 150), 100, 300),
    dodge: clamp(num(m.dodge, 1), 0, 30),
    accuracy: clamp(num(m.accuracy, 90), 70, 100),
    attackSpeed: clamp(Math.round(num(m.attackSpeed, 2000)), 1200, 5000),
    xpReward: Math.max(0, Math.round(num(m.xpReward, 10))),
    goldReward: Math.max(0, Math.round(num(m.goldReward, 5))),
    behavior: m.behavior || "",
    skills: normalizedSkills,
    drops,
  };
}

function normalize(raw: any, errors: string[]): GeneratedRaid {
  const raid = raw?.raid || raw;
  if (!raid || !raid.name) throw new Error("JSON inválido: campo raid.name ausente");

  const waves = Array.isArray(raid.waves) ? raid.waves.map((w: any, i: number) => normalizeMonsterShape(w, errors, false)) : [];
  const bossRaw = raid.boss || raid.bossMonster;
  const boss = bossRaw ? normalizeMonsterShape(bossRaw, errors, true) : null;
  if (waves.length < 2) errors.push(`Esperado pelo menos 2 monstros de onda, veio ${waves.length}`);
  if (!boss) errors.push("Boss ausente");

  return {
    raid: {
      name: raid.name,
      description: raid.description || "",
      region: raid.region || "Região Desconhecida",
      requiredLevel: clamp(Math.round(num(raid.requiredLevel, 1)), 1, 99),
      raidResetHours: clamp(Math.round(num(raid.raidResetHours, 24)), 8, 72),
      maxRaidAttempts: clamp(Math.round(num(raid.maxRaidAttempts, 3)), 1, 10),
      raidWaves: clamp(Math.round(num(raid.raidWaves, 10)), 5, 20),
      raidDifficulty: clamp(num(raid.raidDifficulty, 2), 1, 5),
    },
    waves,
    boss,
    errors,
  };
}

export async function generateRaid(idea: string, providerLog: string[]): Promise<GeneratedRaid> {
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
  throw new AppError(502, `Falha ao gerar raid (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

export async function persistGeneratedRaid(gen: GeneratedRaid): Promise<any> {
  const r = gen.raid;
  const slugBase = slugify(r.name);
  let slug = slugBase;
  let suffix = 1;
  while (await prisma.map.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${suffix++}`;
  }

  const map = await prisma.map.create({
    data: {
      name: r.name,
      description: r.description || "",
      slug,
      region: r.region || "Região Desconhecida",
      requiredLevel: r.requiredLevel,
      isPvPZone: false,
      type: "raid",
      raidResetHours: r.raidResetHours,
      maxRaidAttempts: r.maxRaidAttempts,
      raidWaves: r.raidWaves,
      raidDifficulty: r.raidDifficulty,
      isActive: true,
      sortOrder: 100,
    },
  });

  const warnings: string[] = [];
  let spawnRate = 1;
  for (const wave of gen.waves) {
    const { id, warnings: w } = await persistMonsterData(wave, wave.drops);
    warnings.push(...w);
    await prisma.mapMonster.create({
      data: {
        mapId: map.id,
        monsterId: id,
        spawnRate: spawnRate++,
        minLevel: Math.max(1, wave.level - 3),
        maxLevel: wave.level + 5,
        maxInstances: 6,
        respawnTime: 15000,
      },
    });
  }

  if (gen.boss) {
    const { id, warnings: w } = await persistMonsterData(gen.boss, gen.boss.drops);
    warnings.push(...w);
    await prisma.mapMonster.create({
      data: {
        mapId: map.id,
        monsterId: id,
        spawnRate: 999,
        minLevel: Math.max(1, gen.boss.level - 3),
        maxLevel: gen.boss.level + 5,
        maxInstances: 1,
        respawnTime: 15000,
      },
    });
  }

  return {
    id: map.id,
    name: map.name,
    slug: map.slug,
    region: map.region,
    requiredLevel: map.requiredLevel,
    raidWaves: map.raidWaves,
    raidDifficulty: map.raidDifficulty,
    waves: gen.waves.length,
    boss: gen.boss?.name || null,
    warnings,
    errors: (gen as any).errors || [],
  };
}
