// ===== MAP GENERATOR =====

export interface GeneratedMap {
  map: any;
  errors: string[];
}

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPrompt(idea: string): string {
  return `Você é o designer de mapas de um MMORPG brasileiro. Crie um mapa baseado na ideia: "${idea}"

Responda APENAS com JSON válido:

{
  "map": {
    "name": "Nome do mapa (curto, único)",
    "slug": "slug-unico-em-minusculas",
    "description": "1-2 frases do cenário",
    "region": "Nome da região (ex: Vale do Crepúsculo)",
    "requiredLevel": 1,
    "type": "normal|raid|dungeon|arena|city|guild_hall|event|secret",
    "pinLeft": 50,
    "pinTop": 50,
    "isActive": true
  }
}

REGRAS:
- slug único, minúsculo, apenas letras, números e hífen
- name curto e marcante
- description 1-2 frases
- type: normal (padrão), raid, dungeon, arena, city, guild_hall, event, secret
- requiredLevel apropriado ao tema
- pinLeft/pinTop entre 0-100 (posição no mapa mundi)`;
}

export function normalize(raw: any): GeneratedMap {
  const map = raw?.map || {};
  const errors: string[] = [];

  if (!map.name) errors.push("map.name ausente");
  const slug = slugify(map.slug || map.name);
  if (!slug) errors.push("slug inválido");

  return {
    map: {
      name: map.name || "Mapa Sem Nome",
      slug,
      description: map.description || "",
      region: map.region || "Desconhecida",
      requiredLevel: Math.max(1, Math.min(100, Math.round(map.requiredLevel || 1))),
      type: ["normal", "raid", "dungeon", "arena", "city", "guild_hall", "event", "secret"].includes(map.type) ? map.type : "normal",
      pinLeft: Math.max(0, Math.min(100, map.pinLeft ?? 50)),
      pinTop: Math.max(0, Math.min(100, map.pinTop ?? 50)),
      isActive: true,
    },
    errors,
  };
}

export async function persistGeneratedMap(gen: GeneratedMap, prisma: any) {
  const existing = await prisma.map.findUnique({ where: { slug: gen.map.slug } });
  if (existing) {
    return await prisma.map.update({
      where: { slug: gen.map.slug },
      data: gen.map,
    });
  }

  return await prisma.map.create({ data: gen.map });
}

export async function generateMap(idea: string, providerLog: string[]) {
  const { callHFProviders } = await import("./hfProviders");

  const prompt = buildPrompt(idea);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON válido.`;

  const response = await callHFProviders(fullPrompt);

  providerLog.push(`Mapa gerado via IA`);
  return JSON.parse(response);
}
