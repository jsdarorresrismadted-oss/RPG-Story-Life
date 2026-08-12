import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num, clamp } from "./monsterGenerator";

// ===== Gerador de mapas via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão dos demais geradores: Gemini primeiro, Groq como fallback.
// Cria apenas o MAPA (sem monstros): dados, tipo (normal/raid), stats de raid
// e o PINO no mapa mundi (pinLeft/pinTop) — o ponto onde o jogador se vê no
// mapa e clica para entrar.

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
  return `Você é um designer de mapas de um MMORPG de texto brasileiro. Gere UM mapa completo seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "map": {
    "name": "Nome pt-BR do mapa (curto e evocativo)",
    "slug": "slug unico em minusculas (ex: floresta-negra)",
    "description": "1-2 frases descrevendo o local e o clima.",
    "imageUrl": null,
    "region": "Nome da região pt-BR (ex: Floresta de Verdania)",
    "requiredLevel": 1,
    "sortOrder": 0,
    "type": "normal|raid",
    "raidResetHours": 24,
    "maxRaidAttempts": 3,
    "raidWaves": 10,
    "raidDifficulty": 2,
    "isPvPZone": false,
    "isActive": true,
    "pinLeft": 50,
    "pinTop": 50
  }
}

REGRAS:
- level 1 a 99. Se o mapa tiver monstros, o requiredLevel deve ser coerente com o nível deles.
- type "raid" = masmorra com ondas + chefe, tentativas limitadas e reset em horas (raidResetHours 12-48, maxRaidAttempts 1-5, raidWaves 5-15, raidDifficulty 1-5).
- type "normal" = zona comum: raidResetHours/maxRaidAttempts/raidWaves/raidDifficulty devem ser null.
- pinLeft e pinTop (0 a 100) são a posição EM PORCENTAGEM do ponto do mapa no mapa mundi — onde o jogador vai se ver e clicar para entrar. Posicione espalhado (não deixe tudo no centro).
- region pode ser "Walking Dead" se o pedido for de outro jogo.
- NÃO inclua monstros, NPCs nem itens no JSON.

PEDIDO DO USUÁRIO (atenda fielmente o tema, fantasia e mecânicas pedidos):
"${idea}"`;
}

function normalize(raw: any, errors: string[]): GeneratedMap {
  const m = raw?.map || raw;
  if (!m || !m.name) throw new Error("JSON inválido: campo map.name ausente");

  const type = VALID_TYPES.includes(m.type) ? m.type : "normal";
  const slug = slugify(m.slug || m.name);
  if (!slug) throw new Error("JSON inválido: slug inválido");

  const pinLeft = clamp(num(m.pinLeft, 50), 0, 100);
  const pinTop = clamp(num(m.pinTop, 50), 0, 100);
  if (type === "normal") errors.push("Mapa normal criado (sem raid)");

  return {
    map: {
      name: String(m.name).trim().slice(0, 60),
      slug: slug.slice(0, 50),
      description: String(m.description || "").trim().slice(0, 500),
      imageUrl: null,
      region: String(m.region || "Mundo").trim().slice(0, 60),
      requiredLevel: clamp(Math.round(num(m.requiredLevel, 1)), 1, 99),
      sortOrder: Math.max(0, Math.round(num(m.sortOrder, 0))),
      type,
      raidResetHours: type === "raid" ? clamp(Math.round(num(m.raidResetHours, 24)), 1, 168) : null,
      maxRaidAttempts: type === "raid" ? clamp(Math.round(num(m.maxRaidAttempts, 3)), 1, 10) : null,
      raidWaves: type === "raid" ? clamp(Math.round(num(m.raidWaves, 10)), 3, 30) : 10,
      raidDifficulty: type === "raid" ? clamp(num(m.raidDifficulty, 2), 1, 5) : 2,
      isPvPZone: !!m.isPvPZone,
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
  throw new AppError(502, `Falha ao gerar mapa (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

// Cria o mapa no banco (sem monstros). Warns caso o slug já exista (renomeia com sufixo).
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