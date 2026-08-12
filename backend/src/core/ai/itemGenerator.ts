import { AppError } from "../middleware/errorHandler";

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
  tome: "/weaponicon/staff.png",
  cap: "/helmeticon/helm.png",
  helmet: "/helmeticon/helm.png",
  crown: "/helmeticon/helm.png",
  hood: "/helmeticon/helm.png",
  light: "/armoricon/armor.png",
  heavy: "/armoricon/armor.png",
  robe: "/armoricon/armor.png",
};

export const ITEM_ICON_BY_TYPE: Record<string, string> = {
  weapon: "/weaponicon/sword.png",
  helm: "/helmeticon/helm.png",
  armor: "/armoricon/armor.png",
  cape: "/cloakicon/cape.png",
  ring: "/ringicon/ring.png",
  necklace: "/necklceicon/necklace.png",
  consumable: "/potionicon/vida.png",
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
};

const SLOT_RULES: Record<string, string> = {
  weapon: "Apenas a arma. Sem personagem segurando.",
  helm: "Apenas o elmo.",
  armor: "A armadura deve cobrir tronco, ombros e bracos.",
  cape: "Apenas a capa, vista de frente.",
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
  buyPrice: number;
  sellPrice: number;
}

interface PlanInput {
  type: string;
  theme?: string;
  material?: string;
  color?: string;
  rarity: string;
  level: number;
}

// ===== 1) Planejamento via Groq =====
async function planItem(input: PlanInput): Promise<ItemPlan> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AppError(503, "GROQ_API_KEY nao definida - o gerador de itens precisa dela (variavel do Railway)");

  const auto = !input.theme && !input.material && !input.color;
  const userPrompt = [
    "Crie um novo equipamento para o RPG.",
    "Tipo: " + TYPE_PT[input.type] + " (" + input.type + ")",
    "Raridade: " + RARITY_PT[input.rarity] + " (" + input.rarity + ")",
    "Nivel: " + input.level,
    input.theme ? "Tema: " + input.theme : "",
    input.material ? "Material: " + input.material : "",
    input.color ? "Cor principal: " + input.color : "",
    auto ? "Escolha voce mesmo nome, tema, material, cor, estilo, formato, design e ornamentos. O equipamento deve parecer unico, sem copiar itens famosos, respeitando a raridade informada." : "",
    "",
    "Regra do slot (respeite fielmente):",
    SLOT_RULES[input.type],
    "",
    "ATRIBUTOS (stats): TODOS os equipamentos (arma, elmo, armadura, capa, anel, colar) fornecem os 6 atributos — TODOS acima de zero. O atributo principal do tipo recebe o maior valor:",
    "- arma fisica (sword/dagger/axe): strength e dexterity altos; arma magica (staff/tome): intellect e wisdom altos",
    "- elmo e armadura: endurance e dexterity altos",
    "- capa: wisdom e luck altos",
    "- anel e colar: luck alto + um secundario",
    "Os 4 atributos restantes recebem valores menores (20-60% do principal), mas NUNCA zero. Valores inteiros, proporcionais ao nivel (base ~1.2 x nivel) e a raridade (multiplicador " + RARITY_MULT[input.rarity] + "x), entre 1 e 200.",
    "",
    "ARMAS: inclua tambem attackSpeedMs (500 a 2600, velocidade de ataque em milissegundos — mais rapido = melhor) e dps (dano por segundo, proporcional ao nivel e raridade, entre 1 e 100000).",
    "",
    "PRECOS: buyPrice entre 50 e 500000, sellPrice = ~20% do buyPrice, coerentes com nivel e raridade.",
    "",
    "Responda SOMENTE com JSON valido neste formato:",
    '{"name":"Nome em portugues, curto e fantastico",',
    '"description":"1-2 frases em portugues descrevendo visual e lendinha",',
    '"subtype":"um de: sword, dagger, staff, axe, tome, bow (arma) | cap, helmet, crown, hood (elmo) | light, heavy, robe (armadura) | vazio para capa/anel/colar",',
    '"stats":{"strength":0,"intellect":0,"endurance":0,"dexterity":0,"wisdom":0,"luck":0},',
    '"attackSpeedMs":0,"dps":0,"buyPrice":0,"sellPrice":0}',
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
    const v = Number(raw.stats?.[k]) || 0;
    stats[k] = Math.max(1, Math.min(200, Math.round(v)));
  }
  const isWeapon = input.type === "weapon";
  return {
    name: String(raw.name).slice(0, 60),
    description: String(raw.description || "").slice(0, 300),
    subtype: String(raw.subtype || "").slice(0, 20),
    icon: defaultIconForItem(input.type, String(raw.subtype || "")),
    stats,
    attackSpeedMs: isWeapon ? Math.max(500, Math.min(2600, Math.round(Number(raw.attackSpeedMs) || 2000))) : 0,
    dps: isWeapon ? Math.max(0, Math.round(Number(raw.dps) || 0)) : 0,
    buyPrice: Math.max(0, Math.round(Number(raw.buyPrice) || 0)),
    sellPrice: Math.max(0, Math.round(Number(raw.sellPrice) || 0)),
  };
}

// ===== 1b) Planejamento LOCAL (deterministico, sem API externa) =====
// Gera nome, descricao, stats e precos a partir de tabelas + seed.

const STRENGTH_NAMES: Record<string, string[]> = {
  weapon: ["Lamina", "Furia", "Presagio", "Dente", "Vedamen", "Cinto", "Horizonte", "Eco", "Firma", "Estilhaço", "Gume", "Julgamento"],
  helm: ["Elmo", "Capacete", "Coroa", "Aureola", "Viseira", "Fronte", "Sentinela", "Cume"],
  armor: ["Couraça", "Malha", "Peito", "Blindagem", "Camisa", "Vestes", "Redoma", "Baluarte"],
  cape: ["Capa", "Manto", "Traje", "Bornal", "Vela", "Sombra", "Aura", "Voe"],
};
const STRENGTH_DESC: Record<string, string[]> = {
  weapon: ["gume infalivel", "peso ancestral", "eco de batalhas antigas", "espirito forjado", "marca do destino", "fio incansavel"],
  helm: ["viseira imponente", "coroa de autoridade", "penacho de guerra", "olhar que inspira", "crista ancestral", "brilho de lideranca"],
  armor: ["placas entrelacadas", "malha reforcada", "aca vermelho", "espessura de muralha", "revestimento de aço", "costura de mestre"],
  cape: ["tecido vaporoso", "cauda longa", "forro real", "bordado de estrelas", "manto de vento", "fibra luminosa"],
};

const PRICE_NAMES: Record<string, string[]> = {
  weapon: ["da Aurora", "do Abismo", "de Kael", "das Tempestades", "do Sol", "da Noite", "do Trovão", "da Serpente", "do Fim", "das Marés", "do Vale", "da Ruína"],
  helm: ["do Guardiao", "do Norte", "do Destino", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira"],
  armor: ["do Guardiao", "do Norte", "da Batalha", "do Crepusculo", "da Legiao", "do Altar", "da Fronteira", "do Cerco"],
  cape: ["do Andarilho", "da Aurora", "do Crepusculo", "do Vento", "da Viagem", "do Horizonte", "das Sombras", "do Peregrino"],
};

const SUBTYPES: Record<string, string[]> = {
  weapon: ["sword", "dagger", "staff", "axe", "tome", "bow"],
  helm: ["cap", "helmet", "crown", "hood"],
  armor: ["light", "heavy", "robe"],
  cape: [""],
};

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

function planItemLocal(input: PlanInput, seed: number): ItemPlan {
  const rarMult = RARITY_MULT[input.rarity];
  const base = 1.2 * input.level;

  // Subtype determinado pela seed (estabilidade por tipo/raridade/nivel).
  const subtypes = SUBTYPES[input.type];
  const subtype = pick(subtypes, `${input.type}|${input.rarity}|${input.level}|${seed}`, 1);

  // nome = [substantivo forte] + [aposito ambientico]
  const root = pick(STRENGTH_NAMES[input.type] || STRENGTH_NAMES.weapon, `${input.type}|${seed}`, 2);
  const ep = pick(PRICE_NAMES[input.type] || PRICE_NAMES.weapon, `${input.type}|${input.rarity}|${seed}`, 3);
  const materialWord = input.material ? " de " + (input.material ?? "") : "";
  const name = (root + " " + ep + materialWord).slice(0, 60);

  const motif = pick(STRENGTH_DESC[input.type] || STRENGTH_DESC.weapon, `${input.type}|${input.rarity}|${seed}`, 4);
  const desc = `Equipamento ${RARITY_PT[input.rarity]} com ${motif}.` + (input.theme ? ` Inspirado em ${input.theme}.` : "");
  const description = desc.slice(0, 300);

  // Stats: 6 atributos sempre > 0; principal do tipo recebe o maior valor.
  const STAT_KEYS: Record<string, number> = { strength: 0, intellect: 0, endurance: 0, dexterity: 0, wisdom: 0, luck: 0 };
  const primary: string[] =
    input.type === "weapon"
      ? (subtype === "staff" || subtype === "tome" ? ["intellect", "wisdom"] : ["strength", "dexterity"])
      : input.type === "cape"
        ? ["wisdom", "luck"]
        : ["endurance", "dexterity"];

  const seeded = hashStr(`${input.type}|${input.rarity}|${input.level}|${seed}`);
  const main = clampInt(base * rarMult, 1, 200);
  let keyIdx = 0;
  for (const k of Object.keys(STAT_KEYS) as (keyof typeof STAT_KEYS)[]) {
    if (primary.includes(k)) {
      STAT_KEYS[k] = main + (primary[0] === k ? 0 : Math.round(main * 0.15));
    } else {
      const frac = 0.2 + ((seeded >> (keyIdx * 3)) & 7) / 20; // 0.20 a 0.55
      STAT_KEYS[k] = clampInt(main * frac, 1, 200);
    }
    keyIdx++;
  }

  const isWeapon = input.type === "weapon";
  let attackSpeedMs = 0;
  let dps = 0;
  if (isWeapon) {
    // Velocidade por subtipo alinhada aos itens do seed (dagger rápido, axe lento).
    const speedBySubtype: Record<string, [number, number]> = {
      dagger: [1300, 1600], sword: [1800, 2100], bow: [1700, 2000], staff: [2200, 2500], axe: [2300, 2600], tome: [2400, 2600],
    };
    const [lo, hi] = speedBySubtype[subtype] || [2000, 2300];
    attackSpeedMs = lo + (seeded % (hi - lo + 1));
    // DPS linear com nivel*raridade (para ~= attackPower); escala igual ao seed
    // (lv1 comum ~7, lv10 epica ~120). independente da velocidade.
    const powerScale = base * rarMult * 2.5;
    dps = clampInt(powerScale + (seeded % 15), 5, 100000);
  }

  const buyPrice = clampInt(50 + base * rarMult * base * 0.6 + (seeded % 300), 50, 500000);
  const sellPrice = Math.round(buyPrice * 0.2);

  return {
    name,
    description,
    subtype,
    icon: defaultIconForItem(input.type, subtype),
    stats: { ...STAT_KEYS },
    attackSpeedMs,
    dps,
    buyPrice,
    sellPrice,
  };
}

// ===== Orquestrador =====
export interface GenerateItemInput {
  type: string;
  theme?: string;
  material?: string;
  color?: string;
  rarity?: string;
  level?: number;
  seed?: number;
  variants?: number;
}

export interface GeneratedItem {
  plan: ItemPlan;
}

export async function generateItemSprite(input: GenerateItemInput, log: string[]): Promise<GeneratedItem> {
  const type = input.type;
  const validTypes = Object.keys(TYPE_PT);
  if (!validTypes.includes(type)) throw new AppError(400, "Tipo invalido: " + type);
  const rarity = VALID_RARITIES.includes(String(input.rarity || "")) ? String(input.rarity) : "common";
  const level = Math.max(1, Math.min(100, Number(input.level) || 1));
  const seed = Math.floor(Number(input.seed) || Date.now() % 1000000);

  // Plano: por padrao usa a IA LOCAL (deterministica, sem API externa).
  //    Groq fica opcional (GROQ_PLANNER=on) para nomes/textos via LLM.
  const plan = process.env.GROQ_PLANNER === "on"
    ? await planItem({ type, theme: input.theme, material: input.material, color: input.color, rarity, level })
    : planItemLocal({ type, theme: input.theme, material: input.material, color: input.color, rarity, level }, seed);

  log.push((process.env.GROQ_PLANNER === "on" ? "Groq" : "IA local") + " (plano)");
  return { plan };
}
