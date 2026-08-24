// ===== MONSTER GENERATOR =====

import { PrismaClient } from "@prisma/client";
import { callHFProviders } from "./hfProviders";

export interface GeneratedMonster {
  monsters: any[];
  errors: string[];
}

const VALID_ELEMENTS = ["physical", "fire", "water", "nature", "light", "dark", "thunder", "ice", "earth", "arcane", "poison"];
const VALID_DAMAGE_TYPES = ["physical", "magical", "true"];
const VALID_TRIGGERS = ["auto", "active", "on_hit", "on_crit", "on_kill", "on_low_hp", "on_skill_use", "passive"];
const VALID_SKILL_KINDS = ["attack", "buff", "debuff", "heal", "utility", "mobility", "summon", "transform"];
const VALID_ACTIONS = ["damage", "heal", "apply_effect", "mana", "shield", "teleport", "summon", "transform", "buff", "debuff"];

function slugify(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function buildPrompt(idea: string, xpPerLevel: number[]): string {
  return `Voce e o designer de monstros de um MMORPG brasileiro. Crie monstros baseados na ideia: "${idea}"

Responda APENAS com JSON valido:

{
  "monsters": [
    {
      "name": "Nome unico e criativo",
      "description": "Descricao do monstro (1-2 frases)",
      "level": 1,
      "isBoss": false,
      "isElite": false,
      "element": "physical",
      "faction": "nome da faccao",
      "hp": 100,
      "mana": 50,
      "attack": 20,
      "defense": 10,
      "magic": 10,
      "magicDefense": 10,
      "speed": 10,
      "criticalChance": 2,
      "criticalDamage": 150,
      "dodge": 1,
      "accuracy": 90,
      "attackSpeed": 2000,
      "xpReward": 0,
      "goldReward": 0,
      "skills": [
        {
          "name": "Nome criativo da skill",
          "kind": "attack|buff|debuff|heal|utility|mobility|summon|transform",
          "trigger": "auto|active|on_hit|on_crit|on_kill|on_low_hp|on_skill_use|passive",
          "target": "enemy|self|ally|all_enemies|all_allies|random_enemy",
          "cooldown": 8000,
          "manaCost": 0,
          "actions": [
            { "action": "damage|heal|apply_effect|mana|shield|teleport|summon|transform|buff|debuff", "amount": 15, "effectId": null, "target": "enemy", "chance": 1 }
          ]
        }
      ],
      "dropTable": [
        {
          "itemName": "Nome do item (existente ou novo)",
          "chance": 0.1,
          "minQty": 1,
          "maxQty": 1,
          "isGuaranteed": false
        }
      ]
    }
  ]
}

REGRAS IMPORTANTES:
- 4-12 monstros por regiao
- EXATAMENTE 1 boss (isBoss: true, HP/attack ~2x maior)
- Niveis variados (levelMin a levelMax da regiao)
- Nomes unicos: varie com "Sombrio", "Anciao", "Selvagem", "Gigante", "das Feras", "do Norte", "Ancestral", "do Abismo", "Real", "das Sombras", "Bravo", "Alfa", "da Matilha", "do Bosque", "Sinistro", "do Vale", "do Pantano", "das Ruinas", "do Gelo", "de Ferro"
- Skills com nomes criativos ("Corte Espectral", "Uivo da Maquina", "Chama Eterna")
- Actions apenas: damage, heal, apply_effect, mana, shield, teleport, summon, transform, buff, debuff
- Drops referenciam itens por NOME (existentes OU novos para serem criados)
- element: physical, fire, water, nature, light, dark, thunder, ice, earth, arcane, poison
- faction: tema da regiao (ex: "floresta", "montanha", "pantano", "ruinas", "vulcao", "evento")
- xpReward/goldReward calculados pelo sistema (pode chutar)`;
}

export function normalize(raw: any): GeneratedMonster {
  const monsters: any[] = (Array.isArray(raw?.monsters) ? raw.monsters : []).slice(0, 12).map((m: any, i: number) => {
    const isBoss = !!m?.isBoss || i === 0;

    return {
      name: m?.name || `Monstro ${i + 1}`,
      description: m?.description || "",
      level: Math.max(1, Math.min(100, Math.round(num(m?.level, 1)))),
      isBoss: isBoss ? true : !!m?.isBoss,
      isElite: !!m?.isElite || num(m?.level, 1) >= 20,
      element: VALID_ELEMENTS.includes(m?.element) ? m.element : "physical",
      faction: m?.faction || "evento",
      hp: Math.max(1, Math.round(num(m?.hp, 50 * (isBoss ? 10 : 1)))),
      mana: Math.max(0, Math.round(num(m?.mana, 20))),
      attack: Math.max(1, Math.round(num(m?.attack, 10 * (isBoss ? 2 : 1)))),
      defense: Math.max(0, Math.round(num(m?.defense, 5))),
      magic: Math.max(0, Math.round(num(m?.magic, 5))),
      magicDefense: Math.max(0, Math.round(num(m?.magicDefense, 5))),
      speed: Math.max(1, Math.round(num(m?.speed, 10))),
      criticalChance: Math.max(0, Math.min(100, num(m?.criticalChance, 2))),
      criticalDamage: Math.max(100, Math.min(500, num(m?.criticalDamage, 150))),
      dodge: Math.max(0, Math.min(100, num(m?.dodge, 1))),
      accuracy: Math.max(0, Math.min(100, num(m?.accuracy, 90))),
      attackSpeed: Math.max(100, Math.min(5000, Math.round(num(m?.attackSpeed, 2000)))),
      xpReward: Math.max(0, Math.round(num(m?.xpReward, 0))),
      goldReward: Math.max(0, Math.round(num(m?.goldReward, 0))),
      skills: Array.isArray(m?.skills) ? m.skills.slice(0, 5).map((s: any) => ({
        name: s?.name || "Ataque",
        kind: VALID_SKILL_KINDS.includes(s?.kind) ? s.kind : "attack",
        trigger: VALID_TRIGGERS.includes(s?.trigger) ? s.trigger : "active",
        target: ["self", "enemy", "ally", "all_enemies", "all_allies", "random_enemy"].includes(s?.target) ? s.target : "enemy",
        cooldown: Math.max(0, Math.round(num(s?.cooldown, 8000))),
        manaCost: Math.max(0, Math.round(num(s?.manaCost, 0))),
        actions: Array.isArray(s?.actions) ? s.actions.slice(0, 5).map((a: any) => ({
          action: VALID_ACTIONS.includes(a?.action) ? a.action : "damage",
          amount: a?.amount != null ? num(a.amount) : undefined,
          effectId: a?.effectId || null,
          target: ["self", "enemy", "ally", "all_enemies", "all_allies", "random_enemy"].includes(a?.target) ? a.target : "enemy",
          chance: Math.max(0, Math.min(1, num(a?.chance, 1))),
        })) : [{ action: "damage", amount: 15, target: "enemy", chance: 1 }],
      })) : [],
      dropTable: Array.isArray(m?.dropTable) ? m.dropTable.slice(0, 5).map((d: any) => ({
        itemName: d?.itemName || "Item",
        chance: Math.max(0, Math.min(1, num(d?.chance, 0.1))),
        minQty: Math.max(1, Math.round(num(d?.minQty, 1))),
        maxQty: Math.max(1, Math.round(num(d?.maxQty, 1))),
        isGuaranteed: !!d?.isGuaranteed,
      })) : [],
    };
  });

  const errors: string[] = [];
  if (monsters.length === 0) errors.push("Nenhum monstro criado");
  if (!monsters.some((m) => m.isBoss)) errors.push("Nenhum boss definido");

  return { monsters, errors };
}

export async function persistGeneratedMonster(gen: GeneratedMonster, prisma: PrismaClient) {
  const results = [];
  for (const m of gen.monsters) {
    const existing = await prisma.monster.findFirst({ where: { name: m.name } });
    if (existing) {
      results.push(await prisma.monster.update({ where: { id: existing.id }, data: m }));
    } else {
      results.push(await prisma.monster.create({ data: m }));
    }
  }
  return { count: results.length, monsters: results };
}

export async function generateMonster(idea: string, providerLog: string[], xpPerLevel: number[] = []) {
  const prompt = buildPrompt(idea, xpPerLevel);
  const fullPrompt = `${prompt}\n\nIMPORTANTE: Responda APENAS com JSON valido.`;

  const response = await callHFProviders(fullPrompt);
  providerLog.push(`Monstros gerados via IA`);
  return JSON.parse(response);
}
