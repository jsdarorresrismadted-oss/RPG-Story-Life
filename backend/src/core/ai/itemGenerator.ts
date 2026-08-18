import { AppError } from "../middleware/errorHandler";
import { autoEquipmentStats } from "../items/itemAutoStats";
import { rollWeaponBoosters, WeaponBoosterInstance } from "../weapon-boosters";

// ===== Gerador de equipamentos (somente planejamento) =====
// - IA LOCAL (plano deterministico) gera: nome, descricao, atributos e precos.
//   (Groq opcional via GROQ_PLANNER=on quando o usuario quiser nomes por LLM.)
// - Nao gera imagens: os itens recebem o icone padrao da biblioteca por tipo/subtipo
//   (frontend/public), garantindo que todo item gerado siga o padrao visual.

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ===== Icones padrao (biblioteca frontend/public) =====
// Subtipo com icone proprio; senao cai no icone do tipo; senao null (fallback no front).
export const ITEM_ICON_BY_SUBTYPE: Record<string, string> = {
  sword: "/weaponicon/sword.png",
  longsword: "/weaponicon/longsword.png",
  dagger: "/daggericon/dagger.png",
  spear: "/weaponicon/spear.png",
  axe: "/weaponicon/axe.png",
  mace: "/weaponicon/mace.png",
  bow: "/weaponicon/bow.png",
  staff: "/weaponicon/staff.png",
  cap: "/helmeticon/helm.png",
  helmet: "/helmeticon/helm.png",
  crown: "/helmeticon/helm.png",
  hood: "/helmeticon/helm.png",
  light: "/armoricon/armor.png",
  heavy: "/armoricon/armor.png",
  robe: "/armoricon/armor.png",
  material: "/materialicon/crystal.png",
};

export const ITEM_ICON_BY_TYPE: Record<string, string> = {
  weapon: "/weaponicon/sword.png",
  helm: "/helmeticon/helm.png",
  armor: "/armoricon/armor.png",
  cape: "/cloakicon/cape.png",
  ring: "/ringicon/ring.png",
  necklace: "/necklceicon/necklace.png",
  consumable: "/potionicon/vida.png",
  material: "/materialicon/crystal.png",
};

export function defaultIconForItem(type: string, subtype?: string | null): string | null {
  const st = String(subtype || "").toLowerCase();
  return ITEM_ICON_BY_SUBTYPE[st] || ITEM_ICON_BY_TYPE[String(type || "").toLowerCase()] || null;
}

const TYPE_PT: Record<string, string> = {
  weapon: "arma",
  helm: "elmo",
  armor: "armadura",
  cape: "capa",
  material: "material bruto",
};

const SLOT_RULES: Record<string, string> = {
  weapon: "Apenas a arma. Sem personagem segurando.",
  helm: "Apenas o elmo.",
  armor: "A armadura deve cobrir tronco, ombros e bracos.",
  cape: "Apenas a capa, vista de frente.",
  material: "Nao e equipamento: e um MATERIAL BRUTO (minerio, pele, essencia, fragmento, cristal, erva), objeto isolado como no inventario.",
};

const RARITY_PT: Record<string, string> = {
  common: "comum",
  uncommon: "incomum",
  rare: "raro",
  epic: "epico",
  legendary: "lendario",
  mythic: "mitico",
};
const VALID_RARITIES = Object.keys(RARITY_PT);
const RARITY_MULT: Record<string, number> = { common: 1, uncommon: 1.6, rare: 2.6, epic: 4.5, legendary: 8, mythic: 14 };

const MASTER_RULES = [
  "REGRAS ABSOLUTAS - NUNCA VIOLA:",
  "1) NUNCA gere PERSONAGENS, HUMANOS, ROSTOS, CORPOS, SILHUETAS HUMANAS. APENAS ITENS/ARMAS/equipamentos soltos.",
  "2) O item e um OBJETO isolado, como seria exibido em um inventario de jogo. NAO ha ninguem segurando ou usando.",
  "",
  "ESTILO: Fantasy medieval.",
  "RARIDADE: Comuns sao simples. Lendarios/miticos devem ser ESPECTACULARES com efeitos e ornamentos.",
].join("\n");

export interface ItemPlan {
  name: string;
  description: string;
  subtype: string;
  icon: string | null;
  stats: Record<string, number>;
  attackSpeedMs?: number; // apenas armas
  dps?: number; // apenas armas
  boosters?: WeaponBoosterInstance[]; // armas: 3 boosters rolados pela raridade
  buyPrice: number;
  sellPrice: number;
}

interface PlanInput {
  type: string;
  rarity: string;
  level: number;
  subtype?: string;
  mobs?: string[];
  maps?: string[];
}

// ===== 1) Planejamento via Groq =====
async function planItem(input: PlanInput): Promise<ItemPlan> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AppError(503, "GROQ_API_KEY nao definida - o gerador de itens precisa dela (variavel do Railway)");

  const auto = true;
  const isMaterial = input.type === "material";
  const mobsHint = (input.mobs || []).slice(0, 30).join(", ");
  const mapsHint = (input.maps || []).slice(0, 20).join(", ");
  const specLines = isMaterial
    ? [
        "REGRA MATERIAL: o item e um MATERIAL BRUTO (materia-prima usada em craft) — minerio, pele, escama, essencia, fragmento, cristal, erva, etc. NAO e equipamento.",
        "NAO tem slot, NAO tem stats (todos 0), NAO tem attackSpeedMs nem dps. subtype DEVE ser 'material'.",
        "CRIATIVIDADE NOMINAL: o nome DEVE derivar de CRIATURAS ou LOCAIS do mundo do jogo (use os nomes reais listados abaixo), ex.: 'Garra de Lobo Anciao', 'Escama da Serpente das Dunas', 'Cristal da Caverna do Eco', 'Essencia do Pântano Sombrio'. Nao use nomes genericos tipo 'Fragmento Mistico'.",
        "Descricao: para que serve como materia-prima, mencionando a criatura/local de origem.",
        "PRECOS: buyPrice entre 50 e 50000, sellPrice ~20% do buyPrice.",
      ]
    : [
        "REGRA ARMA CASCA: armas NAO tem stats, NAO tem dps, NAO tem attackSpeedMs — sao cascas; DPS e velocidade vêm do ENCANTAMENTO que o jogador aplica depois.",
        "REGRA ATRIBUTOS: elmos, armaduras e capas NAO tem dps nem attackSpeedMs — o sistema calcula os atributos automaticamente por nivel e raridade, entao mande stats 0.",
        "Todo o esforco vai no nome, na descricao e no visual (icone). Nome fantastico e coerente com o subtipo (se pedido, comeca com ele: 'Cajado do Alvorecer', 'Espada ...').",
        "Descricao: 1-2 frases em portugues descrevendo visual e lendinha do item.",
        "PRECOS: buyPrice entre 50 e 500000, sellPrice = ~20% do buyPrice, coerentes com nivel e raridade.",
      ];
  const userPrompt = [
    "Crie um novo item para o RPG.",
    "Tipo: " + TYPE_PT[input.type] + " (" + input.type + ")",
    "Raridade: " + RARITY_PT[input.rarity] + " (" + input.rarity + ")",
    "Nivel: " + input.level,
    input.subtype && input.type === "weapon" ? "Subtipo da arma (obrigatorio): " + input.subtype : "",
    input.subtype && input.type !== "weapon" && input.type !== "material" ? "Subtipo: " + input.subtype : "",
    mobsHint ? "CRIATURAS EXISTENTES NO JOGO (use estes nomes em materiais): " + mobsHint : "",
    mapsHint ? "LOCAIS EXISTENTES NO JOGO (use estes nomes em materiais): " + mapsHint : "",
    "",
    ...specLines,
    "",
    "Responda SOMENTE com JSON valido neste formato:",
    '{"name":"Nome em portugues, curto e fantastico — SE um subtipo especifico foi pedido (cajado, espada, adaga, machado, arco, lanca, martelo, espada longa), o nome DEVE comecar com ele (ex.: subtipo cajado -> \\"Cajado do Alvorecer\\")",',
    '"description":"1-2 frases em portugues descrevendo visual e lendinha",',
    '"subtype":"um de (em INGLES): sword, dagger, longsword, axe, mace, spear, bow, staff — sword=espada, dagger=adaga, longsword=espada longa, axe=machado, mace=martelo, spear=lanca, bow=arco, staff=cajado (arma) | cap, helmet, crown, hood (elmo) | light, heavy, robe (armadura) | material (material bruto) | vazio para capa/anel/colar",',
    '"stats":{"strength":0,"intellect":0,"endurance":0,"dexterity":0,"wisdom":0,"luck":0},"attackSpeedMs":0,"dps":0,"buyPrice":0,"sellPrice":0}',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: MASTER_RULES + "\nVoce gera JSON valido seguindo o contrato do usuario. Responda SOMENTE com o JSON." },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError(502, "Groq HTTP " + res.status + ": " + body.slice(0, 200));
  }
  const data = (await res.json()) as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new AppError(502, "Groq: resposta vazia");

  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    raw = JSON.parse(text.slice(start, end + 1));
  }
  if (!raw || !raw.name) throw new AppError(502, "Groq: JSON invalido (name ausente)");

  const STAT_KEYS = ["strength", "intellect", "endurance", "dexterity", "wisdom", "luck"];
  const stats: Record<string, number> = {};
  for (const k of STAT_KEYS) {
    if (isMaterial) {
      stats[k] = 0;
      continue;
    }
    const v = Number(raw.stats?.[k]) || 0;
    stats[k] = Math.max(0, Math.min(200, Math.round(v)));
  }
  const isWeapon = input.type === "weapon";
  const subtype = isMaterial ? "material" : normalizeSubtype(input.type, raw.subtype, input.subtype);
  return {
    name: String(raw.name).slice(0, 60),
    description: String(raw.description || "").slice(0, 300),
    subtype,
    icon: defaultIconForItem(input.type, subtype),
    stats,
    attackSpeedMs: isWeapon ? Math.max(500, Math.min(2600, Math.round(Number(raw.attackSpeedMs) || 2000))) : 0,
    dps: isWeapon ? Math.max(0, Math.round(Number(raw.dps) || 0)) : 0,
    buyPrice: isMaterial
      ? Math.max(0, Math.min(50000, Math.round(Number(raw.buyPrice) || 0)))
      : Math.max(0, Math.round(Number(raw.buyPrice) || 0)),
    sellPrice: isMaterial
      ? Math.max(0, Math.min(10000, Math.round(Number(raw.sellPrice) || 0)))
      : Math.max(0, Math.round(Number(raw.sellPrice) || 0)),
  };
}

// ===== 1b) Planejamento LOCAL (deterministico, sem API externa) =====
// Gera nome, descricao, stats e precos a partir de tabelas + seed.

const STRENGTH_NAMES: Record<string, string[]> = {
  weapon: ["Lamina", "Furia", "Presagio", "Dente", "Vedamen", "Cinto", "Horizonte", "Eco", "Firma", "Estilhaço", "Gume", "Julgamento"],
  helm: ["Elmo", "Capacete", "Coroa", "Aureola", "Viseira", "Fronte", "Sentinela", "Cume"],
  armor: ["Couraça", "Malha", "Peito", "Blindagem", "Camisa", "Vestes", "Redoma", "Baluarte"],
  cape: ["Capa", "Manto", "Traje", "Bornal", "Vela", "Sombra", "Aura", "Voe"],
  material: ["Fragmento", "Essencia", "Cristal", "Minério", "Pele", "Escama", "Núcleo", "Plasma", "Pó", "Seiva", "Garra", "Osso"],
};
const STRENGTH_DESC: Record<string, string[]> = {
  weapon: ["gume infalivel", "peso ancestral", "eco de batalhas antigas", "espirito forjado", "marca do destino", "fio incansavel"],
  helm: ["viseira imponente", "coroa de autoridade", "penacho de guerra", "olhar que inspira", "crista ancestral", "brilho de lideranca"],
  armor: ["placas entrelacadas", "malha reforcada", "aca vermelho", "espessura de muralha", "revestimento de aço", "costura de mestre"],
  cape: ["tecido vaporoso", "cauda longa", "forro real", "bordado de estrelas", "manto de vento", "fibra luminosa"],
  material: ["materia-prima de forja", "usado em receitas de craft", "extraido de criaturas selvagens", "instavel ao toque", "cobiçado por alquimistas", "fermentado em cavernas profundas"],
};

const PRICE_NAMES: Record<string, string[]> = {
  weapon: ["da Aurora", "do Abismo", "de Kael", "das Tempestades", "do Sol", "da Noite", "do Trovão", "da Serpente", "do Fim", "das Marés", "do Vale", "da Ruína"],
  helm: ["do Guardiao", "do Norte", "do Destino", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira"],
  armor: ["do Guardiao", "do Norte", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira", "do Cerco"],
  cape: ["do Andarilho", "da Aurora", "do Crepusculo", "do Vento", "da Viagem", "do Horizonte", "das Sombras", "do Peregrino"],
  material: ["das Cavernas", "do Abismo", "da Floresta", "das Marés", "do Vulcão", "do Norte", "da Ruína", "do Pântano", "do Vale", "das Dunas"],
};

const SUBTYPES: Record<string, string[]> = {
  weapon: ["sword", "dagger", "longsword", "axe", "mace", "spear", "bow", "staff"],
  helm: ["cap", "helmet", "crown", "hood"],
  armor: ["light", "heavy", "robe"],
  cape: [""],
  material: ["material"],
};

// Sinônimos em português/inglês → subtipo canônico do sistema.
// Arsenal de armas: adaga, espada, espada longa, machado, martelo, lança, arco, cajado.
const SUBTYPE_PT_MAP: Record<string, string> = {
  espada: "sword", sword: "sword", lamina: "sword",
  "espada longa": "longsword", longsword: "longsword",
  adaga: "dagger", dagger: "dagger", faca: "dagger", punhal: "dagger",
  machado: "axe", axe: "axe", machadinha: "axe",
  martelo: "mace", mace: "mace", maca: "mace", maça: "mace",
  lanca: "spear", lança: "spear", spear: "spear",
  arco: "bow", bow: "bow", besta: "bow",
  cajado: "staff", staff: "staff", bastao: "staff", "cajado magico": "staff",
  capuz: "hood", hood: "hood", "capuz de tecido": "hood",
  coroa: "crown", crown: "crown",
  capacete: "helmet", helmet: "helmet", elmo: "helmet",
  gorro: "cap", cap: "cap",
  leve: "light", light: "light", couro: "light",
  pesada: "heavy", heavy: "heavy", pesado: "heavy", malha: "heavy", placa: "heavy",
  tunica: "robe", túnica: "robe", robe: "robe", vestes: "robe",
  material: "material",
};

// Detecta o subtipo a partir do tema digitado (ex.: "cajado" → staff).
function detectSubtypeFromTheme(theme?: string): string | null {
  const t = String(theme || "").toLowerCase();
  if (!t) return null;
  for (const [word, subtype] of Object.entries(SUBTYPE_PT_MAP)) {
    if (t.includes(word)) return subtype;
  }
  return null;
}

// Normaliza o subtipo vindo da IA (pode vir em português) e valida contra o tipo.
function normalizeSubtype(type: string, raw: string | undefined, theme?: string): string {
  const st = String(raw || "").trim().toLowerCase();
  const fromMap = SUBTYPE_PT_MAP[st] || detectSubtypeFromTheme(theme);
  const allowed = SUBTYPES[type] || [""];
  if (fromMap && allowed.includes(fromMap)) return fromMap;
  if (st && allowed.includes(st)) return st;
  // Fallback por tipo: arma física padrão, elmo cap, armadura leve.
  if (type === "weapon") return "sword";
  if (type === "helm") return "cap";
  if (type === "armor") return "light";
  return "";
}

// Hash determinista a partir de uma string (FNV-1a 32 bits).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], key: string, salt = 0): T {
  return arr[(hashStr(key + ":" + salt)) % arr.length];
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// Raízes de material que combinam com CRIATURAS (partes do corpo, subprodutos).
const MOB_MATERIAL_ROOTS = [
  "Garra", "Pele", "Escama", "Osso", "Dente", "Presa", "Coração", "Carapaça",
  "Chifre", "Pena", "Fio", "Verme", "Gosma", "Presilha", "Falange", "Casco",
];

// Raízes de material que combinam com LOCAIS (recursos do ambiente).
const MAP_MATERIAL_ROOTS = [
  "Cristal", "Fragmento", "Essência", "Minério", "Pó", "Seiva", "Núcleo",
  "Plasma", "Lodo", "Flor", "Sal", "Âmbar", "Turfa", "Basalto", "Musgo", "Véu",
];

// Gera nome criativo de material: "Pele de {mob}" ou "Cristal de {map}".
function materialNameFromWorld(mobs: string[], maps: string[], seed: number): { name: string; source: string } {
  const mob = mobs.length > 0 ? mobs[hashStr("mob|" + seed) % mobs.length] : null;
  const map = maps.length > 0 ? maps[hashStr("map|" + seed) % maps.length] : null;
  if (!mob && !map) {
    const root = pick(STRENGTH_NAMES.material, "material|" + seed, 2);
    const ep = pick(PRICE_NAMES.material, "material|" + seed, 3);
    return { name: (root + " " + ep).slice(0, 60), source: "" };
  }
  // Alterna entre criatura e local pela seed; se só um existir, usa ele.
  const useMob = mob && map ? hashStr("src|" + seed) % 2 === 0 : !!mob;
  if (useMob && mob) {
    const root = pick(MOB_MATERIAL_ROOTS, "mobroot|" + seed, 4);
    return { name: `${root} de ${mob}`.slice(0, 60), source: mob };
  }
  const root = pick(MAP_MATERIAL_ROOTS, "maproot|" + seed, 4);
  return { name: `${root} de ${map}`.slice(0, 60), source: map || "" };
}

function planItemLocal(input: PlanInput, seed: number): ItemPlan {
  const rarMult = RARITY_MULT[input.rarity];
  const base = 1.2 * input.level;

  // Subtype: escolha do admin tem prioridade (ex.: "staff" → cajado),
  // senão escolha pela seed.
  const subtypes = SUBTYPES[input.type];
  const subtype = input.subtype && subtypes.includes(input.subtype) ? input.subtype : pick(subtypes, `${input.type}|${input.rarity}|${input.level}|${seed}`, 1);

  // Material bruto: nome derivado de criaturas/locais do mundo (mais criativo).
  if (input.type === "material") {
    const world = materialNameFromWorld(input.mobs || [], input.maps || [], seed);
    const motif = pick(STRENGTH_DESC.material, `material|${seed}`, 4);
    const src = world.source
      ? ` Extraído de ${world.source}, usado em receitas de craft.`
      : ` Materia-prima usada em receitas de craft.`;
    return {
      name: world.name,
      description: `Material ${RARITY_PT[input.rarity]}: ${motif}.${src}`.slice(0, 300),
      subtype: "material",
      icon: defaultIconForItem("material", "material"),
      stats: { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 },
      attackSpeedMs: 0,
      dps: 0,
      buyPrice: clampInt(20 + base * rarMult * 6 + (seed % 80), 20, 50000),
      sellPrice: clampInt(5 + (20 + base * rarMult * 6 + (seed % 80)) * 0.2, 5, 10000),
    };
  }

  // nome = [substantivo forte] + [aposito ambientico]
  const WEAPON_PT: Record<string, string> = { sword: "Espada", dagger: "Adaga", longsword: "Espada Longa", axe: "Machado", mace: "Martelo", spear: "Lança", bow: "Arco", staff: "Cajado" };
  const root = WEAPON_PT[subtype]
    ? WEAPON_PT[subtype]
    : pick(STRENGTH_NAMES[input.type] || STRENGTH_NAMES.weapon, `${input.type}|${seed}`, 2);
  const ep = pick(PRICE_NAMES[input.type] || PRICE_NAMES.weapon, `${input.type}|${input.rarity}|${seed}`, 3);
  const name = (root + " " + ep).slice(0, 60);

  const motif = pick(STRENGTH_DESC[input.type] || STRENGTH_DESC.weapon, `${input.type}|${input.rarity}|${seed}`, 4);
  const description = `Equipamento ${RARITY_PT[input.rarity]} com ${motif}.`.slice(0, 300);

  // Armas são CASCAS: sem stats próprios, sem DPS, sem velocidade — DPS e
  // velocidade de ataque vêm do encantamento. Elmos, armaduras e capas têm
  // ATRIBUTOS calculados por nível + raridade (admin só escolhe nível e raridade).
  const STAT_KEYS: Record<string, number> = input.type === "weapon"
    ? { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 }
    : autoEquipmentStats(input.type, input.level, input.rarity);

  const buyPrice = clampInt(50 + base * rarMult * base * 0.6 + (hashStr(`${input.type}|${input.rarity}|${input.level}|${seed}`) % 300), 50, 500000);
  const sellPrice = Math.round(buyPrice * 0.2);

  return {
    name,
    description,
    subtype,
    icon: defaultIconForItem(input.type, subtype),
    stats: { ...STAT_KEYS },
    attackSpeedMs: 0,
    dps: 0,
    buyPrice,
    sellPrice,
  };
}

// ===== Orquestrador =====
export interface GenerateItemInput {
  type: string;
  rarity?: string;
  level?: number;
  subtype?: string;
  seed?: number;
  variants?: number;
  prompt?: string;
  mobs?: string[];
  maps?: string[];
}

export interface GeneratedItem {
  plan: ItemPlan;
  plans: ItemPlan[];
}

// Interpreta o prompt livre do admin (ex.: "5 itens, pontos entre 5 e 10, dps de 10 a 50, velocidade entre 2s a 2.5s").
function parsePrompt(prompt: string): {
  count: number;
  level?: number;
  subtype?: string;
  statsRange?: [number, number];
  statsAll?: boolean;
  dpsRange?: [number, number];
  speedRange?: [number, number];
} {
  const p = String(prompt || "").toLowerCase();
  const out: ReturnType<typeof parsePrompt> = { count: 1 };

  // "5 itens", "3 cajados", "2 adagas de veneno" — número + substantivo no plural
  // (exclui palavras-chave como "pontos"/"dps" para não confundir com faixas).
  const countM = p.match(/(\d+)\s+(?:de\s+)?(?!(?:pontos|dps|stats|atributos|segundos|milisegundos|ms)\b)[a-zá-úãõ]+s\b/);
  if (countM) out.count = clampInt(parseInt(countM[1], 10), 1, 12);

  const lvM = p.match(/n[ií]vel\s*(\d+)/);
  if (lvM) out.level = clampInt(parseInt(lvM[1], 10), 1, 150);

  const sub = detectSubtypeFromTheme(p);
  if (sub) out.subtype = sub;

  // Faixas numéricas: "6 a 8", "6–8", "6 e 8", "6 até 8", "1.5s a 2s", "2.5 a 3 segundos".
  // Separo: "a", "até", "e", hífen ou travessão (en/em dash — comum em texto colado do WhatsApp).
  // Extração em ORDEM (dps → velocidade → stats), removendo o trecho já usado do texto para
  // nenhuma faixa ser roubada por outra palavra-chave ("pontos entre 5 e 10, dps de 10 a 50").
  const SEP = "(?:e|a|at[eé]|[-–—])";
  const NUM = "(\\d+(?:[.,]\\d+)?)\\s*s?";
  // Prefere "palavra ANTES da faixa" ("dps de 10 a 50"); se não houver, aceita "faixa antes da palavra"
  // ("20 a 30 dps"). Só aceita faixas válidas (hi >= lo) — backtrack pode cortar dígitos ("30" -> "3").
  const pickRange = (m1: RegExpMatchArray | null, m2: RegExpMatchArray | null): RegExpMatchArray | null => {
    const valid = (m: RegExpMatchArray | null) => {
      if (!m) return false;
      return parseFloat(m[2].replace(",", ".")) >= parseFloat(m[1].replace(",", "."));
    };
    return valid(m1) ? m1 : valid(m2) ? m2 : null;
  };
  let work = p;
  // dps: faixa BEM próxima da palavra ("dps de 10 a 50", "dps 10-50", "10 a 50 dps") —
  // distância curta (max 4 antes / 6 depois) para não roubar faixa de outra coisa ("dps, e entre 1.5s a 2s").
  const dM = pickRange(
    work.match(new RegExp(`dps[^0-9]{0,4}${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?`)),
    work.match(new RegExp(`${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?[^0-9]{0,6}dps`))
  );
  if (dM) {
    out.dpsRange = [Math.round(parseFloat(dM[1])), Math.round(parseFloat(dM[2]))];
    work = work.replace(dM[0], " ");
  }
  const vM = pickRange(
    work.match(new RegExp(`(?:velocidade|segundos?)[^0-9]{0,12}${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?`)),
    work.match(new RegExp(`${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?[^0-9]{0,12}(?:velocidade|segundos?)`))
  );
  if (vM) {
    out.speedRange = [clampInt(Math.round(parseFloat(vM[1]) * 1000), 500, 2600), clampInt(Math.round(parseFloat(vM[2]) * 1000), 500, 2600)];
    work = work.replace(vM[0], " ");
  }
  const sM = pickRange(
    work.match(new RegExp(`(?:pontos|stats|atributos)[^0-9]{0,12}${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?`)),
    work.match(new RegExp(`${NUM}[^0-9]{0,8}${SEP}[^0-9]{0,8}(\\d+(?:[.,]\\d+)?)\\s*s?[^0-9]{0,12}(?:pontos|stats|atributos)`))
  );
  if (sM) out.statsRange = [Math.round(parseFloat(sM[1])), Math.round(parseFloat(sM[2]))];
  // "... em tudo" / "em todos os atributos" → aplica a faixa a TODAS as stats (não só às principais)
  if (out.statsRange && /em tudo|em todos|em todas|todos (?:os )?atributos|todas (?:as )?atributos|todos (?:os )?pontos|todas (?:as )?stats/.test(p)) {
    out.statsAll = true;
  }

  return out;
}

export async function generateItemSprite(input: GenerateItemInput, log: string[]): Promise<GeneratedItem> {
  const type = input.type;
  const validTypes = Object.keys(TYPE_PT);
  if (!validTypes.includes(type)) throw new AppError(400, "Tipo invalido: " + type);
  const rarity = VALID_RARITIES.includes(String(input.rarity || "")) ? String(input.rarity) : "common";
  const level = Math.max(1, Math.min(150, Number(input.level) || 1));
  const seed = Math.floor(Number(input.seed) || Date.now() % 1000000);

  // Prompt livre: interpreta quantidade, nível, subtipo e faixas de pontos/DPS/velocidade.
  const parsed = input.prompt ? parsePrompt(input.prompt) : { count: 1 };
  if (input.prompt) {
    console.log("[ai-items] prompt:", JSON.stringify(input.prompt));
    console.log("[ai-items] parsed:", JSON.stringify(parsed));
  }
  const count = parsed.count || 1;
  const baseSubtype = input.subtype || parsed.subtype;
  const baseLevel = parsed.level ?? level;

  const plans: ItemPlan[] = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i * 7919;
    // Plano: por padrao usa a IA LOCAL (deterministica, sem API externa).
    //    Groq fica opcional (GROQ_PLANNER=on) para nomes/textos via LLM.
    const plan = process.env.GROQ_PLANNER === "on"
      ? await planItem({ type, rarity, level: baseLevel, subtype: baseSubtype })
      : planItemLocal({ type, rarity, level: baseLevel, subtype: baseSubtype, mobs: input.mobs, maps: input.maps }, s);

    // Armas são CASCAS (DPS/velocidade só via encantamento). Elmos, armaduras e
    // capas têm ATRIBUTOS calculados por nível + raridade (o que vier do plano é
    // substituído pela fórmula — o admin só escolhe nível e raridade).
    if (["weapon", "helm", "armor", "cape"].includes(type)) {
      plan.dps = 0;
      plan.attackSpeedMs = 0;
      plan.stats =
        type === "weapon"
          ? { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 }
          : autoEquipmentStats(type, baseLevel, rarity);
    }

    // Armas ganham 3 boosters rolados (valor capado pela raridade, máx 51%).
    if (type === "weapon") {
      plan.boosters = rollWeaponBoosters(rarity, 3, undefined, baseSubtype);
    }

    plans.push(plan);
  }

  log.push((process.env.GROQ_PLANNER === "on" ? "Groq" : "IA local") + ` (plano${plans.length > 1 ? `s x${plans.length}` : ""})`);
  return { plan: plans[0], plans };
}
