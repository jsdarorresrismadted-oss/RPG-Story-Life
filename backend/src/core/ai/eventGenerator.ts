import { prisma } from "../database";
import { AppError } from "../middleware/errorHandler";
import { markCollectItemsTemporary } from "../questItems";
import { callGemini, callGroq, extractJson, num, clamp } from "./monsterGenerator";

// ===== Gerador de EVENTOS via IA (Gemini 2.5 Flash / Groq Llama 3.3 70B) =====
// Um evento é um pacote COMPLETO fora da história do jogo:
// - raid (mapa tipo raid com monstros + boss, ondas/tentativas)
// - quests próprias (kill de monstros do evento)
// - shop próprio (EventShopItem: itens do evento à venda por ouro)
// - itens próprios (normais E de craft; alguns podem vir COM boost — arma/armadura
//   com boostType/boostValue, NÃO todos os itens)
// - receitas de craft (itens E CLASSES craftáveis — a IA NÃO cria classes,
//   apenas referencia classes EXISTENTES para serem obtidas por craft)
// Tudo fica vinculado ao evento (eventId) e é exibido em sub-abas no admin.

const ITEM_TYPES = ["weapon", "class", "helm", "armor", "cape", "ring", "necklace", "consumable"];
const RARITIES = ["common", "uncommon", "rare", "epic", "mythic"];
const BOOST_TYPES = ["defense", "damage", "dropChance", "xp", "gold", "classXp"];
const CORE_STATS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];

function slugify(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function s(v: any, max = 120): string {
  return String(v || "").trim().slice(0, max);
}

export interface GeneratedEvent {
  event: any;
  items: any[];
  monsters: any[];
  quests: any[];
  crafts: any[];
  shop: any[];
  withBoost: string[];
  craftableClasses: string[];
  errors: string[];
}

function buildPrompt(idea: string): string {
  return `Você é o designer-chefe de eventos de um MMORPG de texto brasileiro (estilo AQW/DragonFable). O usuário vai te pedir um EVENTO — um pacote TEMPORÁRIO fora da história do mundo. Responda APENAS com JSON válido seguindo EXATAMENTE o contrato abaixo (sem markdown, sem comentários).

CONTRATO:
{
  "event": {
    "name": "Nome pt-BR do evento (curto e marcante)",
    "slug": "slug unico em minusculas",
    "description": "2-3 frases da lore/mecânica do evento",
    "type": "raid",
    "levelMin": 1,
    "levelMax": null,
    "xpBonus": 0,
    "goldBonus": 0,
    "dropBonus": 0,
    "durationDays": 7
  },
  "raid": {
    "mapName": "Nome do mapa do raid",
    "mapSlug": "slug unico",
    "mapDescription": "1 frase do cenário",
    "region": "Nome da região (ex: Vale do Crepúsculo)",
    "requiredLevel": 1,
    "raidWaves": 10,
    "raidDifficulty": 2,
    "maxRaidAttempts": 3,
    "raidResetHours": 24,
    "pinLeft": 50,
    "pinTop": 50
  },
  "monsters": [
    {
      "name": "...", "description": "...", "level": 1, "isBoss": false,
      "element": "físico", "faction": "evento",
      "hp": 50, "mana": 20, "attack": 10, "defense": 5, "magic": 5, "magicDefense": 5,
      "speed": 10, "criticalChance": 2, "criticalDamage": 150, "dodge": 1, "accuracy": 90,
      "attackSpeed": 2000, "xpReward": 0, "goldReward": 0,
      "skills": [ { "name": "...", "kind": "attack", "trigger": "active", "target": "enemy", "cooldown": 8000, "manaCost": 0, "actions": [ { "action": "damage", "amount": 15 } ] } ]
    }
  ],
  "items": [
    {
      "name": "...", "description": "...", "type": "weapon", "subtype": "sword",
      "rarity": "rare", "level": 5, "icon": null,
      "strength": 10, "intellect": 0, "endurance": 0, "dexterity": 0, "wisdom": 0, "luck": 0,
      "boostType": null, "boostValue": 0,
      "attackSpeedMs": 1800, "dps": 15,
      "effects": null, "buyPrice": 500, "sellPrice": 100
    }
  ],
  "crafts": [
    {
      "name": "Receita da Espada do Evento",
      "resultItem": "NOME do item (da lista items OU item já existente no jogo)",
      "resultClass": null,
      "resultQuantity": 1,
      "ingredients": [ { "itemName": "Nome do material", "quantity": 3 } ],
      "goldCost": 1000,
      "requiredLevel": 1
    }
  ],
  "quests": [
    {
      "title": "...", "description": "...", "difficulty": "medium", "requiredLevel": 1,
      "objectives": [ { "type": "kill", "monsterName": "NOME do monstro do evento", "amount": 10 } ],
      "xpReward": 200, "goldReward": 100,
      "itemRewards": [ { "itemName": "NOME do item", "quantity": 1 } ]
    }
  ],
  "shop": [
    { "itemName": "NOME do item", "price": 300, "stock": -1, "requiredLevel": 1 }
  ],
  "classesToCraft": [
    { "className": "NOME DE UMA CLASSE JÁ EXISTENTE no jogo", "ingredients": [ { "itemName": "Material", "quantity": 5 } ], "goldCost": 5000 }
  ]
}

REGRAS:
- NUNCA crie classes novas: classesToCraft só referencia classes EXISTENTES do jogo (ex: Guerreiro, Mago, Assassino, Paladino, Arqueiro, Bruxo, Clérigo, Bardo, Ninja, Caçador...). Máximo 3.
- Monstros: 4 a 8, com EXATAMENTE 1 boss (isBoss: true, HP/attack ~2x maior). skills: 0 a 3 por monstro, só actions de dano/applyEffect/heal básicas.
- Itens: 4 a 12. Variar tipos (arma, armadura, elmo, anel, colar, consumível). Cores: common/uncommon/rare/epic/mythic.
- Boost: só ALGUNS itens (no máximo 2 — tipicamente 1 arma e 1 armadura) vêm com boostType e boostValue (5 a 30). Os demais itens ficam boostType: null, boostValue: 0.
- levelMin/levelMax do evento e requiredLevel: 1 a 99.
- xpBonus/goldBonus/dropBonus: 0 a 100 (porcentagem de bônus durante o evento).
- Crafts: ingredientes por NOME (podem ser materiais novos OU itens existentes do jogo). Máximo 8 receitas. resultClass null EXCETO quando a receita desbloqueia uma classe (então resultItem null e resultClass preenchido).
- Quests: 1 a 5, objetivos só tipo "kill" de monstros DO EVENTO (da lista monsters). itemRewards referenciam itens do evento.
- Shop: 3 a 10 ofertas, preços em ouro coerentes com raridade.
- Tudo em pt-BR, nomes coesos com o tema do pedido. Não invente itens no itemRewards/shop/crafts que não estejam na lista items (pode usar itens existentes do jogo, ex: Poção de Cura, Ossos, Madeira, Ferro).

PEDIDO DO USUÁRIO (atenda fielmente tema, fantasia e mecânicas pedidos):
"${idea}"`;
}

function normalize(raw: any): GeneratedEvent {
  const ev = raw?.event || {};
  if (!ev.name) throw new Error("JSON inválido: campo event.name ausente");
  const slug = slugify(ev.slug || ev.name);
  if (!slug) throw new Error("JSON inválido: slug do evento inválido");
  if (!raw?.raid?.mapName) throw new Error("JSON inválido: raid.mapName ausente");

  const errors: string[] = [];
  const raid = raw.raid || {};

  const items: any[] = (Array.isArray(raw.items) ? raw.items : []).slice(0, 12).map((it: any) => {
    const type = ITEM_TYPES.includes(it?.type) ? it.type : "consumable";
    const rarity = RARITIES.includes(it?.rarity) ? it.rarity : "common";
    const withBoost = !!(it?.boostType && it.boostType !== "none" && it.boostType !== "" && num(it?.boostValue, 0) > 0);
    const core: Record<string, number> = {};
    for (const st of CORE_STATS) core[st] = Math.max(0, Math.round(num(it?.[st], 0)));
    return {
      name: s(it?.name, 60) || `Item ${slug}`,
      description: s(it?.description, 300),
      icon: null,
      type,
      subtype: s(it?.subtype, 30) || null,
      rarity,
      level: clamp(Math.round(num(it?.level, 1)), 1, 99),
      attackSpeedMs: type === "weapon" ? clamp(Math.round(num(it?.attackSpeedMs, 1800)), 500, 4000) : 0,
      dps: type === "weapon" ? clamp(num(it?.dps, 10), 1, 500) : 0,
      ...core,
      boostType: withBoost ? (BOOST_TYPES.includes(it.boostType) ? it.boostType : "damage") : null,
      boostValue: withBoost ? clamp(Math.round(num(it.boostValue, 10)), 5, 30) : 0,
      effects: type === "consumable" && it?.effects ? JSON.stringify(it.effects) : null,
      buyPrice: Math.max(0, Math.round(num(it?.buyPrice, 0))),
      sellPrice: Math.max(0, Math.round(num(it?.sellPrice, 0))),
      withBoost,
    };
  });
  if (items.length === 0) errors.push("Nenhum item criado");

  const byName = new Map<string, any>();
  for (const it of items) byName.set(String(it.name).toLowerCase(), it);

  const monsters: any[] = (Array.isArray(raw.monsters) ? raw.monsters : []).slice(0, 8).map((m: any, i: number) => {
    const isBoss = !!m?.isBoss || i === 0;
    return {
      name: s(m?.name, 50) || `Monstro ${i + 1}`,
      description: s(m?.description, 200),
      imageUrl: null,
      level: clamp(Math.round(num(m?.level, 1)), 1, 99),
      isBoss: i === 0 ? true : !!m?.isBoss,
      isElite: !!m?.isElite || num(m?.level, 1) >= Math.round(num(raw?.raid?.requiredLevel, 1)) + 8,
      faction: s(m?.faction, 30) || "evento",
      element: s(m?.element, 30) || "físico",
      hp: Math.max(1, Math.round(num(m?.hp, 50))),
      mana: Math.max(0, Math.round(num(m?.mana, 20))),
      attack: Math.max(1, Math.round(num(m?.attack, 10))),
      defense: Math.max(0, Math.round(num(m?.defense, 5))),
      magic: Math.max(0, Math.round(num(m?.magic, 5))),
      magicDefense: Math.max(0, Math.round(num(m?.magicDefense, 5))),
      speed: clamp(Math.round(num(m?.speed, 10)), 1, 100),
      criticalChance: clamp(num(m?.criticalChance, 2), 0, 100),
      criticalDamage: clamp(num(m?.criticalDamage, 150), 100, 400),
      dodge: clamp(num(m?.dodge, 1), 0, 50),
      accuracy: clamp(num(m?.accuracy, 90), 0, 100),
      attackSpeed: clamp(Math.round(num(m?.attackSpeed, 2000)), 800, 5000),
      skills: JSON.stringify(Array.isArray(m?.skills) ? m.skills.slice(0, 3) : []),
      behavior: null,
      xpReward: 0n,
      goldReward: 0n,
      isBossCount: isBoss ? 1 : 0,
    };
  });
  if (monsters.length === 0) errors.push("Nenhum monstro — raid sem inimigos");
  if (!monsters.some((m) => m.isBoss)) errors.push("Nenhum boss definido — primeiro monstro vira o boss");

  const quests: any[] = (Array.isArray(raw.quests) ? raw.quests : []).slice(0, 5).map((q: any) => ({
    title: s(q?.title, 80) || "Missão do evento",
    description: s(q?.description, 400),
    type: "event",
    difficulty: s(q?.difficulty, 12) || "medium",
    requiredLevel: clamp(Math.round(num(q?.requiredLevel, 1)), 1, 99),
    objectives: JSON.stringify((Array.isArray(q?.objectives) ? q.objectives : []).slice(0, 3).map((o: any) => ({
      type: o?.type === "collect" ? "collect" : "kill",
      monsterName: s(o?.monsterName, 60),
      amount: clamp(Math.round(num(o?.amount, 10)), 1, 999),
    }))),
    xpReward: BigInt(Math.max(0, Math.round(num(q?.xpReward, 100)))),
    goldReward: BigInt(Math.max(0, Math.round(num(q?.goldReward, 50)))),
    itemRewards: JSON.stringify((Array.isArray(q?.itemRewards) ? q.itemRewards : []).slice(0, 3).map((r: any) => ({
      itemName: s(r?.itemName, 60),
      quantity: clamp(Math.round(num(r?.quantity, 1)), 1, 99),
    }))),
  }));
  if (quests.length === 0) errors.push("Nenhuma quest criada");

  const crafts: any[] = (Array.isArray(raw.crafts) ? raw.crafts : []).slice(0, 8).map((c: any) => ({
    name: s(c?.name, 80) || "Receita do evento",
    description: s(c?.description, 200) || "",
    resultItemName: c?.resultItem ? s(c.resultItem, 60) : null,
    resultClassName: c?.resultClass ? s(c.resultClass, 60) : null,
    resultQuantity: clamp(Math.round(num(c?.resultQuantity, 1)), 1, 99),
    ingredients: (Array.isArray(c?.ingredients) ? c.ingredients : []).slice(0, 6).map((ing: any) => ({
      itemName: s(ing?.itemName, 60),
      quantity: clamp(Math.round(num(ing?.quantity, 1)), 1, 99),
    })),
    goldCost: Math.max(0, Math.round(num(c?.goldCost, 0))),
    requiredLevel: clamp(Math.round(num(c?.requiredLevel, 1)), 1, 99),
  }));
  if (crafts.length === 0) errors.push("Nenhuma receita de craft criada");

  const shop: any[] = (Array.isArray(raw.shop) ? raw.shop : []).slice(0, 10).map((o: any) => ({
    itemName: s(o?.itemName, 60),
    price: Math.max(0, Math.round(num(o?.price, 100))),
    stock: o?.stock === undefined ? -1 : Math.max(-1, Math.round(num(o.stock, -1))),
    requiredLevel: clamp(Math.round(num(o?.requiredLevel, 1)), 1, 99),
  }));
  if (shop.length === 0) errors.push("Nenhuma oferta de shop criada");

  const craftableClasses: string[] = ((Array.isArray(raw.classesToCraft) ? raw.classesToCraft : []).slice(0, 3)).map((c: any) => s(c?.className, 60));
  if (craftableClasses.length > 0) errors.push(`${craftableClasses.length} classe(s) marcadas como craftáveis (referência apenas)`);

  return {
    event: {
      name: s(ev.name, 60),
      slug: slug.slice(0, 50),
      description: s(ev.description, 500),
      type: s(ev.type, 20) || "raid",
      levelMin: clamp(Math.round(num(ev.levelMin, 1)), 1, 99),
      levelMax: ev.levelMax ? clamp(Math.round(num(ev.levelMax, 99)), 1, 99) : null,
      xpBonus: clamp(Math.round(num(ev.xpBonus, 0)), 0, 100),
      goldBonus: clamp(Math.round(num(ev.goldBonus, 0)), 0, 100),
      dropBonus: clamp(Math.round(num(ev.dropBonus, 0)), 0, 100),
      durationDays: clamp(Math.round(num(ev.durationDays, 7)), 1, 30),
      mapName: s(raid.mapName, 60),
      mapSlug: slugify(raid.mapSlug || raid.mapName),
      mapDescription: s(raid.mapDescription, 300),
      region: s(raid.region, 60) || "Terra do Evento",
      requiredLevel: clamp(Math.round(num(raid.requiredLevel, 1)), 1, 99),
      raidWaves: clamp(Math.round(num(raid.raidWaves, 10)), 3, 30),
      raidDifficulty: clamp(num(raid.raidDifficulty, 2), 1, 5),
      maxRaidAttempts: clamp(Math.round(num(raid.maxRaidAttempts, 3)), 1, 10),
      raidResetHours: clamp(Math.round(num(raid.raidResetHours, 24)), 1, 168),
      pinLeft: clamp(num(raid.pinLeft, 50), 0, 100),
      pinTop: clamp(num(raid.pinTop, 50), 0, 100),
    },
    items,
    monsters,
    quests,
    crafts,
    shop,
    withBoost: items.filter((i) => i.withBoost).map((i) => i.name),
    craftableClasses,
    errors,
  };
}

export async function generateEvent(idea: string, providerLog: string[]): Promise<GeneratedEvent> {
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
        return normalize(extractJson(text));
      } catch (err: any) {
        lastErr = err;
      }
    }
  }
  throw new AppError(502, `Falha ao gerar evento (Gemini e Groq indisponíveis): ${lastErr?.message?.slice(0, 200)}`);
}

// Cria TUDO do evento no banco: evento + raid (mapa+monstros) + itens + crafts +
// quests + shop + classes craftáveis. Itens referenciados por nome são resolvidos
// (criados se forem do evento, buscados se já existirem, materiais criados se faltarem).
export async function persistGeneratedEvent(gen: GeneratedEvent): Promise<any> {
  const warnings: string[] = [];
  const errors = [...gen.errors];

  // 1. Evento
  let slug = gen.event.slug;
  const existingEvent = await prisma.gameEvent.findUnique({ where: { slug } });
  if (existingEvent) {
    slug = `${slug.slice(0, 44)}-${Math.random().toString(36).slice(2, 6)}`;
    warnings.push(`Slug do evento já existia — criado como "${slug}"`);
  }
  const now = new Date();
  const event = await prisma.gameEvent.create({
    data: {
      slug,
      name: gen.event.name,
      description: gen.event.description,
      type: gen.event.type,
      levelMin: gen.event.levelMin,
      levelMax: gen.event.levelMax,
      xpBonus: gen.event.xpBonus,
      goldBonus: gen.event.goldBonus,
      dropBonus: gen.event.dropBonus,
      startsAt: now,
      endsAt: new Date(now.getTime() + gen.event.durationDays * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  // 2. Itens do evento (upsert por nome para receitas/shop/quests referenciarem)
  const itemByName = new Map<string, string>();
  const createItem = async (field: any): Promise<string> => {
    const key = String(field.name).toLowerCase().trim();
    if (itemByName.has(key)) return itemByName.get(key)!;
    const existing = await prisma.item.findFirst({ where: { name: { equals: field.name, mode: "insensitive" } } });
    if (existing) {
      itemByName.set(key, existing.id);
      return existing.id;
    }
    const created = await prisma.item.create({
      data: {
        name: field.name,
        description: field.description || "",
        icon: null,
        type: field.type || "consumable",
        subtype: field.subtype || null,
        rarity: field.rarity || "common",
        level: field.level ?? 1,
        attackSpeedMs: field.attackSpeedMs ?? 0,
        dps: field.dps || 0,
        strength: field.strength || 0,
        intellect: field.intellect || 0,
        endurance: field.endurance || 0,
        dexterity: field.dexterity || 0,
        wisdom: field.wisdom || 0,
        luck: field.luck || 0,
        boostType: field.boostType || null,
        boostValue: field.boostValue || 0,
        effects: field.effects || null,
        buyPrice: BigInt(field.buyPrice || 0),
        sellPrice: BigInt(field.sellPrice || 0),
        isActive: true,
        eventId: event.id,
      },
    });
    itemByName.set(key, created.id);
    return created.id;
  };

  const createdItems: any[] = [];
  for (const it of gen.items) {
    const id = await createItem(it);
    createdItems.push({ id, name: it.name, rarity: it.rarity, boostType: it.boostType, boostValue: it.boostValue });
  }

  // 3. Monstros + mapa raid do evento
  const createdMonsters = await Promise.all(
    gen.monsters.map((m) =>
      prisma.monster.create({
        data: {
          name: m.name,
          description: m.description,
          imageUrl: null,
          level: m.level,
          isBoss: m.isBoss,
          isElite: m.isElite,
          faction: m.faction,
          element: m.element,
          hp: m.hp,
          mana: m.mana,
          attack: m.attack,
          defense: m.defense,
          magic: m.magic,
          magicDefense: m.magicDefense,
          speed: m.speed,
          criticalChance: m.criticalChance,
          criticalDamage: m.criticalDamage,
          dodge: m.dodge,
          accuracy: m.accuracy,
          attackSpeed: m.attackSpeed,
          skills: m.skills,
          behavior: null,
          xpReward: BigInt(0),
          goldReward: BigInt(0),
          isActive: true,
        },
      })
    )
  );

  const mapSlug = gen.event.mapSlug;
  const existingMap = await prisma.map.findUnique({ where: { slug: mapSlug } });
  const finalMapSlug = existingMap ? `${mapSlug.slice(0, 44)}-${Math.random().toString(36).slice(2, 6)}` : mapSlug;
  warnings.push(`Mapa do raid criado: "${gen.event.mapName}" (${finalMapSlug})`);

  const map = await prisma.map.create({
    data: {
      name: gen.event.mapName,
      description: gen.event.mapDescription,
      slug: finalMapSlug,
      imageUrl: null,
      region: gen.event.region,
      requiredLevel: gen.event.requiredLevel,
      type: "raid",
      eventId: event.id,
      raidResetHours: gen.event.raidResetHours,
      maxRaidAttempts: gen.event.maxRaidAttempts,
      raidWaves: gen.event.raidWaves,
      raidDifficulty: gen.event.raidDifficulty,
      pinLeft: gen.event.pinLeft,
      pinTop: gen.event.pinTop,
      sortOrder: 900,
      isActive: true,
    },
  });

  await prisma.mapMonster.createMany({
    data: createdMonsters.map((m) => ({
      mapId: map.id,
      monsterId: m.id,
      spawnRate: m.isBoss ? 0.15 : 1.0,
      minLevel: Math.max(1, m.level - 3),
      maxLevel: m.level + 3,
      maxInstances: m.isBoss ? 1 : 10,
      respawnTime: 15000,
    })),
  });

  // 4. Quests do evento
  for (const q of gen.quests) {
    const itemRewards = JSON.parse(q.itemRewards);
    const resolvedRewards = [];
    for (const r of itemRewards) {
      const id = await createItem({ name: r.itemName, type: "consumable", rarity: "common" });
      resolvedRewards.push({ itemId: id, itemName: r.itemName, quantity: r.quantity });
    }
    await prisma.quest.create({
      data: {
        title: q.title,
        description: q.description,
        type: q.type,
        difficulty: q.difficulty,
        requiredLevel: q.requiredLevel,
        mapId: map.id,
        eventId: event.id,
        objectives: q.objectives,
        xpReward: q.xpReward,
        goldReward: q.goldReward,
        itemRewards: JSON.stringify(resolvedRewards),
        isActive: true,
      },
    });
    await markCollectItemsTemporary(prisma, q.objectives);
  }

  // 5. Crafts (itens e classes craftáveis)
  const craftableClasses: Array<{ name: string; id: string }> = [];
  for (const c of gen.crafts) {
    let resultItemId: string | null = null;
    if (c.resultItemName) resultItemId = await createItem({ name: c.resultItemName, type: "consumable", rarity: "common" });
    let resultClassId: string | null = null;
    if (c.resultClassName) {
      const cls = await prisma.gameClass.findFirst({ where: { name: { equals: c.resultClassName, mode: "insensitive" } } });
      if (cls) {
        resultClassId = cls.id;
        craftableClasses.push({ name: cls.name, id: cls.id });
        // craft de classe: o resultado físico é um token de classe (tipo "class")
        resultItemId = await createItem({ name: `Token da Classe: ${cls.name}`, type: "class", rarity: "epic" });
      } else {
        warnings.push(`Classe "${c.resultClassName}" não existe — receita ignorada`);
        continue;
      }
    }
    if (!resultItemId) continue;

    const ingredients: any[] = [];
    for (const ing of c.ingredients) {
      const id = await createItem({ name: ing.itemName, type: "consumable", subtype: "material", rarity: "common" });
      ingredients.push({ itemName: ing.itemName, quantity: ing.quantity });
    }

    await prisma.craftRecipe.create({
      data: {
        name: c.name,
        description: c.description,
        resultItemId,
        resultQuantity: c.resultQuantity,
        resultClassId,
        eventId: event.id,
        requiredLevel: c.requiredLevel,
        goldCost: BigInt(c.goldCost),
        ingredients: JSON.stringify(ingredients),
        isActive: true,
      },
    });
  }

  for (const cc of craftableClasses) {
    await prisma.gameClass.update({ where: { id: cc.id }, data: { craftable: true } });
  }
  if (craftableClasses.length > 0) warnings.push(`Classes marcadas como craftáveis: ${craftableClasses.map((c) => c.name).join(", ")}`);

  // 6. Shop do evento
  const shopOffers: any[] = [];
  for (const o of gen.shop) {
    const itemId = await createItem({ name: o.itemName, type: "consumable", rarity: "common" });
    const offer = await prisma.eventShopItem.create({
      data: {
        eventId: event.id,
        itemId,
        price: BigInt(o.price),
        stock: o.stock,
        requiredLevel: o.requiredLevel,
        isActive: true,
      },
    });
    shopOffers.push({ id: offer.id, itemName: o.itemName, price: o.price, stock: o.stock });
  }

  return {
    event: { id: event.id, name: event.name, slug: event.slug },
    map: { id: map.id, slug: map.slug, name: map.name },
    items: createdItems,
    monsters: createdMonsters.map((m) => ({ id: m.id, name: m.name, isBoss: m.isBoss })),
    quests: gen.quests.map((q) => ({ title: q.title })),
    crafts: gen.crafts.map((c) => ({ name: c.name })),
    craftableClasses: craftableClasses.map((c) => c.name),
    shopOffers,
    errors,
    warnings,
  };
}