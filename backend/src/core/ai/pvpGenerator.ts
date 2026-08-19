import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num, clamp } from "./monsterGenerator";

// ===== Gerador de configuração de PvP (arena) via IA =====
// O PvP é um sistema (não conteúdo estático): o gerador cria/atualiza a
// configuração da arena em SystemConfig (key "pvp_arena"). Inclui regras de
// entrada, recompensas, matchmaking e temporada.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

export const PVP_CONFIG_KEY = "pvp_arena";

export interface GeneratedPvpConfig {
  config: any;
  errors?: string[];
}

function buildPrompt(idea: string): string {
  return `Você é um designer de PvP de um MMORPG de texto. Gere a configuração da ARENA seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "config": {
    "title": "Nome da arena/temporada",
    "description": "Frase curta sobre o evento de PvP.",
    "minLevel": 1,
    "entryCooldownMs": 30000,
    "challengeTtlMs": 30000,
    "ratingK": 32,
    "poolSize": 15,
    "ratingStart": 1200,
    "rewards": {
      "win": { "gold": 100, "xp": 50, "rating": 20 },
      "loss": { "gold": 20, "xp": 10, "rating": -15 },
      "draw": { "gold": 50, "xp": 25, "rating": 0 },
      "streak": [
        { "streak": 3, "gold": 200, "xp": 100, "title": "Nome do título de sequência" },
        { "streak": 5, "gold": 500, "xp": 250, "title": "Nome do título de sequência" },
        { "streak": 10, "gold": 1200, "xp": 600, "title": "Nome do título de sequência" }
      ]
    },
    "rules": {
      "maxDpsHpRatio": 0.5,
      "maxLevelDiff": 10,
      "allowDraw": true,
      "fleePenalty": { "rating": -30, "goldPenalty": 50 }
    }
  }
}

REGRAS:
- minLevel 1-99. entryCooldownMs 10000-120000. ratingK 16-64. poolSize 5-30.
- Recompensas coerentes: win > draw > loss em ouro/XP. rating delta moderado.
- Flee (fuga) penaliza mais que perder.

PEDIDO DO USUÁRIO (atenda fielmente o tema, a temporada e as mecânicas pedidas):
"${idea}"`;
}

function normalize(raw: any, errors: string[]): GeneratedPvpConfig {
  const c = raw?.config || raw;
  if (!c) throw new Error("JSON inválido: campo config ausente");

  const r = c.rewards || {};
  const streak = Array.isArray(r.streak)
    ? r.streak.map((s: any) => ({
        streak: clamp(Math.round(num(s?.streak, 1)), 1, 100),
        gold: Math.max(0, Math.round(num(s?.gold, 0))),
        xp: Math.max(0, Math.round(num(s?.xp, 0))),
        title: s?.title || "",
      }))
    : [];

  return {
    config: {
      title: c.title || "Arena",
      description: c.description || "",
      minLevel: clamp(Math.round(num(c.minLevel, 1)), 1, 99),
      entryCooldownMs: clamp(Math.round(num(c.entryCooldownMs, 30000)), 10000, 120000),
      challengeTtlMs: clamp(Math.round(num(c.challengeTtlMs, 30000)), 10000, 60000),
      ratingK: clamp(Math.round(num(c.ratingK, 32)), 16, 64),
      poolSize: clamp(Math.round(num(c.poolSize, 15)), 5, 30),
      ratingStart: clamp(Math.round(num(c.ratingStart, 1200)), 800, 3000),
      rewards: {
        win: {
          gold: Math.max(0, Math.round(num(r.win?.gold, 100))),
          xp: Math.max(0, Math.round(num(r.win?.xp, 50))),
          rating: Math.round(num(r.win?.rating, 20)),
        },
        loss: {
          gold: Math.max(0, Math.round(num(r.loss?.gold, 20))),
          xp: Math.max(0, Math.round(num(r.loss?.xp, 10))),
          rating: Math.round(num(r.loss?.rating, -15)),
        },
        draw: {
          gold: Math.max(0, Math.round(num(r.draw?.gold, 50))),
          xp: Math.max(0, Math.round(num(r.draw?.xp, 25))),
          rating: Math.round(num(r.draw?.rating, 0)),
        },
        streak,
      },
      rules: {
        maxDpsHpRatio: clamp(num(c.rules?.maxDpsHpRatio, 0.5), 0.1, 1),
        maxLevelDiff: clamp(Math.round(num(c.rules?.maxLevelDiff, 10)), 1, 99),
        allowDraw: c.rules?.allowDraw !== false,
        fleePenalty: {
          rating: Math.round(num(c.rules?.fleePenalty?.rating, -30)),
          goldPenalty: Math.max(0, Math.round(num(c.rules?.fleePenalty?.goldPenalty, 50))),
        },
      },
    },
    errors,
  };
}

export async function generatePvpConfig(idea: string, providerLog: string[]): Promise<GeneratedPvpConfig> {
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
  throw new AppError(502, `Falha ao gerar configuração de PvP (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

export async function persistGeneratedPvp(gen: GeneratedPvpConfig): Promise<any> {
  const existing = await prisma.systemConfig.findUnique({ where: { key: PVP_CONFIG_KEY } });
  const data = { value: gen.config };
  if (existing) {
    await prisma.systemConfig.update({ where: { key: PVP_CONFIG_KEY }, data });
  } else {
    await prisma.systemConfig.create({ data: { key: PVP_CONFIG_KEY, ...data } });
  }
  return {
    key: PVP_CONFIG_KEY,
    config: gen.config,
    errors: (gen as any).errors || [],
  };
}
