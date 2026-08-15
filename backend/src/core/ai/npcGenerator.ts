import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { callGemini, callGroq, extractJson, num } from "./monsterGenerator";

// ===== Gerador de NPCs via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Mesmo padrão do monsterGenerator: gera npcs (com diálogo, mapa e ofertas de
// loja referenciando itens/encantamentos existentes por NOME) e salva no banco.

export const VALID_NPC_TYPES = [
  "vendor",
  "shop",
  "enchantments",
  "classes",
  "quest_giver",
  "quest",
  "gacha",
  "blacksmith",
  "trainer",
  "lore",
  "guard",
  "other",
];

const MAX_NPCS = 6;

export interface GeneratedNpcs {
  npcs: any[];
  preview: Record<string, number>;
  errors?: string[];
}

function buildPrompt(idea: string, mapsHint: string, itemsHint: string, enchantmentsHint: string): string {
  return `Você é um designer de NPCs de um MMORPG de texto. Gere UM OU VÁRIOS NPCs (o usuário pode pedir uma quantidade, ex.: "5 npcs") seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "npcs": [
    {
      "name": "Nome pt-BR do NPC",
      "type": "vendor|shop|enchantments|classes|quest_giver|quest|gacha|blacksmith|trainer|lore|guard|other",
      "description": "Uma frase curta sobre quem ele é.",
      "dialogue": "1-2 frases de diálogo de saudação (voz do NPC).",
      "imageUrl": null,
      "map": "Nome do mapa onde ele aparece (use um dos mapas existentes) ou null",
      "shop": [
        { "itemName": "Nome EXATO de item existente", "price": 0, "currency": "gold|sf_coins", "requiredLevel": 0, "requiredVip": false },
        { "enchantmentName": "Nome EXATO de encantamento existente", "price": 0, "currency": "gold|sf_coins", "requiredLevel": 0, "requiredVip": false }
      ]
    }
  ]
}

REGRAS:
- Nomes e temas coerentes (um grupo do mesmo habitat/cidade).
- Type: use o tipo coerente com o papel — vendedor comum = "vendor", loja especial = "shop", vendedor de encantamentos = "enchantments", vendedor de classes = "classes", quem dá missões = "quest_giver", gacha = "gacha", ferreiro = "blacksmith", etc.
- MAPAS EXISTENTES: ${mapsHint || "(nenhum mapa conhecido)"}
- ITENS EXISTENTES (use apenas estes nomes EXATOS no shop): ${itemsHint || "(lista vazia — deixe shop vazio)"}
- ENCANTAMENTOS EXISTENTES (use apenas estes nomes EXATOS): ${enchantmentsHint || "(lista vazia)"}
- Shop: no máximo 8 ofertas por NPC, somente itens/encantamentos da lista. price em ouro (0 = preço sugerido pelo sistema). Para vendedor de encantamentos (type "enchantments"), as ofertas devem ser encantamentos. Para type "classes", deixe shop vazio (classes são configuradas manualmente).

PEDIDO DO USUÁRIO (atenda fielmente o tema e papéis pedidos):
"${idea}"`;
}

function normalizeOne(n: any, errors: string[]): any {
  if (!n || !n.name) throw new Error("JSON inválido: campo npc.name ausente");
  const type = VALID_NPC_TYPES.includes(n.type) ? n.type : "vendor";
  const shop = Array.isArray(n.shop)
    ? n.shop
        .map((o: any) => {
          const itemName = String(o?.itemName || "").trim();
          const enchantmentName = String(o?.enchantmentName || "").trim();
          if (!itemName && !enchantmentName) return null;
          return {
            itemName: itemName || null,
            enchantmentName: enchantmentName || null,
            price: Math.max(0, Math.round(num(o?.price, 0))),
            currency: o?.currency === "sf_coins" ? "sf_coins" : "gold",
            requiredLevel: Math.max(0, Math.round(num(o?.requiredLevel, 0))),
            requiredVip: !!o?.requiredVip,
          };
        })
        .filter((o: any) => o !== null)
        .slice(0, 8)
    : [];
  return {
    name: String(n.name).slice(0, 60),
    type,
    description: String(n.description || "").slice(0, 300),
    dialogue: String(n.dialogue || "").slice(0, 500),
    imageUrl: n.imageUrl && typeof n.imageUrl === "string" && n.imageUrl.startsWith("http") ? n.imageUrl.slice(0, 500) : null,
    map: String(n.map || "").trim() || null,
    shop,
  };
}

function normalize(raw: any, errors: string[]): GeneratedNpcs {
  let arr: any[];
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.npcs)) arr = raw.npcs;
  else arr = [raw?.npc || raw];

  const npcs: any[] = [];
  for (const item of arr.slice(0, MAX_NPCS)) {
    try {
      npcs.push(normalizeOne(item, errors));
    } catch (err: any) {
      errors.push(err?.message?.includes("name ausente") ? "NPC sem nome ignorado" : err.message);
    }
  }
  if (npcs.length === 0) throw new Error("JSON inválido: campo npc.name ausente (nenhum NPC válido na resposta)");

  return {
    npcs,
    preview: { count: npcs.length },
    errors,
  };
}

export async function generateNpcs(idea: string, providerLog: string[]): Promise<GeneratedNpcs> {
  const [maps, items, enchantments] = await Promise.all([
    prisma.map.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.enchantment.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const mapsHint = maps.map((m) => m.name).slice(0, 40).join(", ");
  const itemsHint = items.map((i) => i.name).slice(0, 60).join(", ");
  const enchantmentsHint = enchantments.map((e) => e.name).slice(0, 40).join(", ");
  const prompt = buildPrompt(idea, mapsHint, itemsHint, enchantmentsHint);

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
  throw new AppError(502, `Falha ao gerar NPC (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

// Cria os NPCs no banco (com posição no mapa e ofertas de loja vinculadas por nome).
export async function persistGeneratedNpcs(gen: GeneratedNpcs, opts: { mapId?: string } = {}): Promise<any> {
  const warnings: string[] = [];
  const npcs: any[] = [];
  for (const n of gen.npcs) {
    const created = await prisma.npc.create({
      data: {
        name: n.name,
        description: n.description,
        imageUrl: n.imageUrl,
        type: n.type,
        dialogue: n.dialogue,
        isActive: true,
      },
    });

    // Posiciona no mapa: mapa forçado pelo admin OU sugerido pela IA (por nome)
    let mapName: string | null = null;
    if (opts.mapId) {
      const map = await prisma.map.findUnique({ where: { id: opts.mapId }, select: { id: true, name: true } });
      if (map) {
        await prisma.mapNpc.create({ data: { mapId: map.id, npcId: created.id, positionX: 50, positionY: 50 } });
        mapName = map.name;
      }
    } else if (n.map) {
      const map = await prisma.map.findFirst({ where: { name: { equals: n.map, mode: "insensitive" } }, select: { id: true, name: true } });
      if (map) {
        await prisma.mapNpc.create({ data: { mapId: map.id, npcId: created.id, positionX: 50, positionY: 50 } });
        mapName = map.name;
      } else {
        warnings.push(`Mapa "${n.map}" não encontrado — ${n.name} ficou sem mapa (adicione manualmente)`);
      }
    }

    // Ofertas de loja: vincula itens/encantamentos existentes por NOME
    let shopCount = 0;
    for (const o of n.shop || []) {
      if (o.itemName) {
        const item = await prisma.item.findFirst({ where: { name: { equals: o.itemName, mode: "insensitive" } } });
        if (!item) {
          warnings.push(`Item "${o.itemName}" não encontrado — oferta ignorada (${n.name})`);
          continue;
        }
        await prisma.shopItem.create({
          data: {
            npcId: created.id,
            itemId: item.id,
            price: o.price > 0 ? o.price : Math.max(1, Number(item.sellPrice) * 3),
            currency: o.currency,
            stock: -1,
            requiredLevel: o.requiredLevel,
            requiredVip: o.requiredVip,
          },
        });
        shopCount++;
      } else if (o.enchantmentName) {
        const enchantment = await prisma.enchantment.findFirst({ where: { name: { equals: o.enchantmentName, mode: "insensitive" } } });
        if (!enchantment) {
          warnings.push(`Encantamento "${o.enchantmentName}" não encontrado — oferta ignorada (${n.name})`);
          continue;
        }
        await prisma.shopItem.create({
          data: {
            npcId: created.id,
            enchantmentId: enchantment.id,
            price: o.price > 0 ? o.price : Math.max(1, Number(enchantment.price)),
            currency: o.currency,
            stock: -1,
            requiredLevel: o.requiredLevel,
            requiredVip: o.requiredVip,
          },
        });
        shopCount++;
      }
    }

    npcs.push({ id: created.id, name: n.name, type: n.type, mapName, shopCount });
  }
  return {
    npcs,
    count: npcs.length,
    warnings,
    errors: (gen as any).errors || [],
  };
}