import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num, clamp } from "./monsterGenerator";

// ===== Gerador de mapas via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Versão simplificada: gera apenas os dados essenciais do mapa.
// Monstros, NPCs e conexões são adicionados manualmente no admin.

const VALID_TYPES = ["normal", "raid"];

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface GeneratedMap {
  map: any;
  preview: Record<string, any>;
  errors?: string[];
}

function buildPrompt(idea: string): string {
  return `Gere UM mapa de MMORPG de texto brasileiro. Responda APENAS com JSON válido.

CONTRATO:
{
  "name": "Nome curto em pt-BR",
  "slug": "slug-minusculo-sem-acentos",
  "description": "1 frase descrevendo o local",
  "region": "Nome da região",
  "requiredLevel": 1,
  "type": "normal",
  "pinLeft": 50,
  "pinTop": 50
}

REGRAS:
- requiredLevel: 1-99 (nível mínimo para entrar)
- type: "normal" (zona comum) ou "raid" (masmorra)
- pinLeft/pinTop: posição no mapa mundi (0-100, em %)
- Para raid, adicione: raidResetHours (12-48), maxRaidAttempts (1-5), raidWaves (5-15), raidDifficulty (1-5)
- NÃO inclua monstros, NPCs ou itens

PEDIDO: "${idea}"`;
}

function normalize(raw: any, errors: string[]): GeneratedMap {
  const m = raw?.map || raw;
  if (!m || !m.name) throw new Error("JSON inválido: campo name ausente");

  const type = VALID_TYPES.includes(m.type) ? m.type : "normal";
  const slug = slugify(m.slug || m.name);
  if (!slug) throw new Error("JSON inválido: slug inválido");

  const pinLeft = clamp(num(m.pinLeft, 50), 0, 100);
  const pinTop = clamp(num(m.pinTop, 50), 0, 100);

  return {
    map: {
      name: String(m.name).trim().slice(0, 60),
      slug: slug.slice(0, 50),
      description: String(m.description || "").trim().slice(0, 500),
      imageUrl: null,
      region: String(m.region || "Mundo").trim().slice(0, 60),
      requiredLevel: clamp(Math.round(num(m.requiredLevel, 1)), 1, 99),
      sortOrder: 0,
      type,
      raidResetHours: type === "raid" ? clamp(Math.round(num(m.raidResetHours, 24)), 12, 48) : null,
      maxRaidAttempts: type === "raid" ? clamp(Math.round(num(m.maxRaidAttempts, 3)), 1, 5) : null,
      raidWaves: type === "raid" ? clamp(Math.round(num(m.raidWaves, 10)), 5, 15) : 10,
      raidDifficulty: type === "raid" ? clamp(num(m.raidDifficulty, 2), 1, 5) : 2,
      isPvPZone: false,
      isActive: true,
      pinLeft,
      pinTop,
    },
    preview: {
      name: String(m.name).trim().slice(0, 60),
      slug: slug.slice(0, 50),
      type,
      region: String(m.region || "Mundo").trim().slice(0, 60),
      requiredLevel: clamp(Math.round(num(m.requiredLevel, 1)), 1, 99),
      pinLeft,
      pinTop,
    },
    errors,
  };
}

export async function generateMap(idea: string, providerLog: string[]): Promise<GeneratedMap> {
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
  throw new AppError(502, `Falha ao gerar mapa: ${lastErr?.message?.slice(0, 200)}`);
}

export async function persistGeneratedMap(gen: GeneratedMap): Promise<any> {
  const warnings: string[] = [];
  let slug = gen.map.slug;
  const existing = await prisma.map.findUnique({ where: { slug } });
  if (existing) {
    const suffix = `-${Math.random().toString(36).slice(2, 6)}`;
    slug = `${slug.slice(0, 44)}${suffix}`;
    warnings.push(`Slug "${gen.map.slug}" já existia — criado como "${slug}"`);
  }

  const created = await prisma.map.create({
    data: { ...gen.map, slug },
  });

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    type: created.type,
    region: created.region,
    requiredLevel: created.requiredLevel,
    pinLeft: created.pinLeft,
    pinTop: created.pinTop,
    warnings,
    errors: (gen as any).errors || [],
  };
}
