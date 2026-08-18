import { AppError } from "../middleware/errorHandler";
import { PASS_LEVELS } from "../periodQuests";

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

export interface PassReward {
  type: "gold" | "experience" | "item" | "classXp";
  value?: number;
  slug?: string;
  itemName?: string;
  quantity?: number;
}

export interface PassObjective {
  type: "kill" | "collect";
  monsterName?: string;
  itemName?: string;
  amount: number;
}

export interface GeneratedSeasonPlan {
  name: string;
  description: string;
  durationDays: number;
  tiers: { level: number; freeRewards: PassReward[]; premiumRewards: PassReward[] }[];
  quests: {
    daily: { title: string; description: string; objectives: PassObjective[]; xpReward: number; goldReward: number; itemRewards: PassReward[] }[];
    weekly: { title: string; description: string; objectives: PassObjective[]; xpReward: number; goldReward: number; itemRewards: PassReward[] }[];
    monthly: { title: string; description: string; objectives: PassObjective[]; xpReward: number; goldReward: number; itemRewards: PassReward[] }[];
  };
}

export async function generateSeasonPlan(
  theme: string,
  itemNames: string[],
  monsterNames: string[]
): Promise<GeneratedSeasonPlan> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AppError(503, "GROQ_API_KEY não definida — o gerador de temporada precisa dela (variável do Railway)");

  const rewardFormat =
    '{"type":"um de: gold, experience, item, classXp","value":NUMERO (gold/experience/classXp) ou 0, "itemName":"NOME DE UM ITEM DA LISTA (só quando type=item)","quantity":NUMERO}';

  const userPrompt = [
    "Crie uma TEMPORADA (Season Pass) completa para um RPG de texto medieval fantástico.",
    theme ? "Tema da temporada: " + theme : "Crie um tema épico de temporada (ex.: guerra elemental, invasão das sombras, festival das marés).",
    "",
    "O passe tem EXATAMENTE 50 níveis. Cada nível (tier) tem recompensas para a trilha FREE (gratuita) e para a trilha PREMIUM (paga):",
    "- FREE: recompensas utilitárias moderadas (ouro, XP, itens consumíveis/materiais comuns).",
    "- PREMIUM: recompensas muito melhores (itens raros/epicos/lendarios, mais ouro e XP).",
    "- Níveis de marcos (5, 10, 15, 20, 25, 30, 35, 40, 45, 50) devem ter recompensas especiais (o 50 = melhor recompensa de todas).",
    "- A maioria dos níveis pode ter 1 recompensa; marcos podem ter 2. NUNCA recompensas vazias.",
    "",
    "ITENS DISPONÍVEIS (use SOMENTE estes nomes, exatamente como escritos):",
    itemNames.length > 0 ? itemNames.join(", ") : "(nenhum item cadastrado — use apenas ouro/XP/classXp)",
    "",
    "MONSTROS DISPONÍVEIS para objetivos de matar (use SOMENTE estes nomes):",
    monsterNames.length > 0 ? monsterNames.join(", ") : "(nenhum monstro cadastrado — não use objetivos kill)",
    "",
    "QUESTS DE PASSE (3 períodos):",
    "- daily: 4 quests — rápidas e fáceis (ex.: matar 5-10 monstros ou coletar 3-5 materiais). xpReward entre 100 e 250.",
    "- weekly: 3 quests — médias (ex.: matar 20-40 monstros). xpReward entre 300 e 600.",
    "- monthly: 2 quests — longas (ex.: matar 80-150 monstros ou coletar 25-50 materiais). xpReward entre 800 e 1200.",
    "- Objetivos: {" + 'type:"kill", monsterName:"NOME do monstro", amount: 5' + "} ou {" + 'type:"collect", itemName:"NOME do material", amount: 3' + "}. Só esses dois tipos.",
    "- goldReward pequeno (0 a 500). itemRewards: lista vazia ou até 2 itens consumíveis/materiais.",
    "",
    "Responda SOMENTE com JSON válido neste formato:",
    '{"name":"Nome curto e épico da temporada em português",',
    '"description":"2-3 frases descrevendo a temporada em português",',
    '"durationDays":30,',
    '"tiers":[{"level":1,"freeRewards":[' + rewardFormat + '],"premiumRewards":[' + rewardFormat + ']}], // exatamente 50 tiers, level 1 a 50 em ordem',
    '"quests":{"daily":[{ "title":"...", "description":"...", "objectives":[...], "xpReward":100, "goldReward":0, "itemRewards":[...] }],',
    '"weekly":[...],"monthly":[...]}' +
      "}",
  ].join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Você é o designer de conteúdo de um RPG. Gera JSON válido seguindo o contrato do usuário. Responda SOMENTE com o JSON, sem texto extra.",
        },
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
  if (!raw?.name) throw new AppError(502, "Groq: JSON inválido (name ausente)");

  const itemSet = new Set(itemNames.map((n) => String(n).trim().toLowerCase()));
  const monsterSet = new Set(monsterNames.map((n) => String(n).trim().toLowerCase()));

  const cleanReward = (r: any): PassReward | null => {
    if (!r || typeof r !== "object") return null;
    const type = String(r.type || "").toLowerCase();
    if (!["gold", "experience", "item", "classXp"].includes(type)) return null;
    if (type === "item") {
      const itemName = String(r.itemName || r.slug || r.name || "").trim();
      if (!itemName || !itemSet.has(itemName.toLowerCase())) return null;
      return { type: "item", itemName, quantity: Math.max(1, Math.round(Number(r.quantity) || 1)) };
    }
    return { type: type as PassReward["type"], value: Math.max(0, Math.round(Number(r.value) || 0)) };
  };

  const cleanObjectives = (list: any[]): PassObjective[] => {
    const out: PassObjective[] = [];
    for (const o of Array.isArray(list) ? list : []) {
      if (!o || typeof o !== "object") continue;
      const type = String(o.type || "").toLowerCase();
      if (type === "kill") {
        const name = String(o.monsterName || o.target || "").trim();
        if (!name || !monsterSet.has(name.toLowerCase())) continue;
        out.push({ type: "kill", monsterName: name, amount: Math.max(1, Math.round(Number(o.amount) || 1)) });
      } else if (type === "collect") {
        const name = String(o.itemName || o.target || "").trim();
        if (!name || !itemSet.has(name.toLowerCase())) continue;
        out.push({ type: "collect", itemName: name, amount: Math.max(1, Math.round(Number(o.amount) || 1)) });
      }
    }
    return out;
  };

  const cleanQuest = (q: any) => ({
    title: String(q?.title || "").slice(0, 80),
    description: String(q?.description || "").slice(0, 300),
    objectives: cleanObjectives(q?.objectives),
    xpReward: Math.max(0, Math.round(Number(q?.xpReward) || 0)),
    goldReward: Math.max(0, Math.round(Number(q?.goldReward) || 0)),
    itemRewards: (Array.isArray(q?.itemRewards) ? q.itemRewards : [])
      .map(cleanReward)
      .filter((r: PassReward | null) => r !== null) as PassReward[],
  });

  const tiers: GeneratedSeasonPlan["tiers"] = [];
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  for (let level = 1; level <= PASS_LEVELS; level++) {
    const t = rawTiers.find((x: any) => Number(x?.level) === level) || rawTiers[level - 1] || {};
    tiers.push({
      level,
      freeRewards: (Array.isArray(t.freeRewards) ? t.freeRewards : [])
        .map(cleanReward)
        .filter((r: PassReward | null) => r !== null) as PassReward[],
      premiumRewards: (Array.isArray(t.premiumRewards) ? t.premiumRewards : [])
        .map(cleanReward)
        .filter((r: PassReward | null) => r !== null) as PassReward[],
    });
  }

  const quests = {
    daily: (Array.isArray(raw.quests?.daily) ? raw.quests.daily : []).map(cleanQuest),
    weekly: (Array.isArray(raw.quests?.weekly) ? raw.quests.weekly : []).map(cleanQuest),
    monthly: (Array.isArray(raw.quests?.monthly) ? raw.quests.monthly : []).map(cleanQuest),
  };

  return {
    name: String(raw.name).slice(0, 60),
    description: String(raw.description || "").slice(0, 400),
    durationDays: Math.max(14, Math.min(90, Math.round(Number(raw.durationDays) || 30))),
    tiers,
    quests,
  };
}