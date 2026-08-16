// Testa apenas a chamada de IA (sem banco): gera o prompt e chama Gemini/Groq
// com o pedido exato do dono, medindo tamanho da resposta e parse.
const path = require("path");
const mod = require("../src/core/ai/monsterGenerator");
const { buildPrompt } = (() => {
  // reimplementa buildPrompt sem getGameLimits (hardcode xpPerLevel=1250)
  return {};
})();

const idea = "10 mobs do level 1 ao level 6 os ultimos 1 boss e 1 elite.";

// Copia o buildPrompt com xpPerLevel fixo: precisamos do texto real do prompt.
// buildPrompt não é exportado; reconstruímos chamando generateMonster é impossível sem DB.
// Então exportamos temporariamente via require cache? Mais simples: ler o arquivo e extrair.
const fs = require("fs");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "core", "ai", "monsterGenerator.ts"), "utf8");
// Usa um xpPerLevel típico (1250) — só para teste do prompt.
const prompt = src; // não usaremos; só confirma que o arquivo existe

async function main() {
  // Simula o prompt real: o mesmo texto com 1250 (limite do jogo)
  const fakeLimits = 1250;
  const promptText = `Você é um designer de monstros de um MMORPG de texto. Gere UM OU VÁRIOS monstros (o usuário pode pedir uma quantidade, ex.: "6 monstros") seguindo EXATAMENTE o contrato abaixo.

CONTRATO (responda apenas com JSON válido, sem markdown):

{
  "monsters": [
    {
      "name": "Nome pt-BR do monstro",
      "description": "Uma frase curta.",
      "level": 1,
      "isElite": false,
      "isBoss": false,
      "faction": "ex: Floresta, Masmorra, Abismo, Vila, Deserto",
      "element": "fire|water|nature|light|dark|thunder|ice|earth|arcane|none",
      "hp": 50, "mana": 20, "attack": 10, "defense": 5, "magic": 5,
      "magicDefense": 5, "speed": 10, "criticalChance": 2, "criticalDamage": 150,
      "dodge": 1, "accuracy": 90, "attackSpeed": 2000,
      "xpReward": 10, "goldReward": 5,
      "behavior": "Frase curta sobre o comportamento do monstro em combate.",
      "skills": [ ... ],
      "drops": [ ... ]
    }
  ]
}

REGRAS DE QUANTIDADE:
- Se o usuário pedir uma quantidade (ex.: "6 monstros", "10 mobs"), gere EXATAMENTE essa quantidade (máximo 12).
- SEMPRE respeite o pedido de quantidade e de faixa de nível do usuário: ex. "10 mobs do level 1 ao level 6" → 10 monstros com níveis distribuídos de 1 a 6 (sem repetir nível se possível), e "os últimos 1 boss e 1 elite" → os 2 últimos monstros da lista devem ser isBoss: true e isElite: true.
- Se não pedir quantidade, gere 1 monstro.
- Nomes e temas coerentes entre si (um grupo do mesmo habitat/fantasia), variando nível quando o usuário pedir faixa (ex.: "nível 1 a 5" → distribua os níveis nessa faixa, um por nível se possível).

REGRAS DE STATS (por monstro):
- level 1 a 99. hp 30 a 500000 (bosses podem ter muito mais), attack 2 a 5000.
- defense e magicDefense entre 20% e 40% do attack (o sistema ainda adiciona +30% de defesa e +20% de dano).
- criticalChance 0 a 50 (%), criticalDamage 100 a 300 (%), dodge 0 a 30 (%), accuracy 70 a 100 (%).
- attackSpeed 1200 a 5000 (ms entre ataques).
- O sistema calcula xpReward/goldReward/classXpReward automaticamente pelo nível, SEMPRE alinhado ao custo real de subir de nível: o XP para subir do nível N é N × ${fakeLimits} (base do jogo). Um mob comum dá 5% desse valor (elite 7,5%, boss 15%), ouro = 40% do XP e CXP = 50% do XP — o ganho nunca fica mais alto nem mais baixo que esse padrão. Você pode ignorar esses campos ou chutar valores (serão normalizados).

REGRAS DE SKILLS (1 a 4 skills por monstro):
- NOMES CRIATIVOS E ÚNICOS em pt-BR, coerentes com a criatura (ex.: "Corte Espectral", "Uivo da Maré", "Presas Sombrias", "Aura Pestilenta"). NUNCA "Ataque 1", "Skill 2", "Ataque Básico" genérico.
- A PRIMEIRA é o ataque automático: trigger "auto", kind "attack", cooldown 2000, actions: [{ action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: 0.8-1.2 }], damageType: "physical"|"magic" }].
- Demais: trigger "active", cooldown 3000-20000, actions válidas:
  • { action: "damage", amount: <n>, scaling: [{ stat: "attack"|"magic", factor: <0.5-2> }], damageType: "physical"|"magic" }
  • { action: "heal", amount: <n>, scaling: [{ stat: "magic", factor: <0.5-1> }] }
  • { action: "applyEffect", effect: "sangramento"|"chama-arcana"|"veneno-corrosivo"|"medo-abissal", target: "enemy"|"self", stacks: 1-3 }
  • { action: "mana", amount: <n>, restore: true }
- Cada skill: { name, description, kind, trigger, target: "enemy"|"self", cooldown, manaCost, rankRequired: 1, sortOrder, actions }.

REGRAS DE DROPS (2 a 5 itens por monstro) — RECURSOS TEMÁTICOS DA PRÓPRIA CRIATURA:
- Crie para cada monstro itens de DROP TEMÁTICO (matéria-prima/recursos do corpo ou essência da criatura, usados em craft). Exemplos:
  espectro da floresta → "Essência de Espectro da Floresta"; goblin → "Osso de Goblin"; lobo → "Presa de Lobo"; aranha → "Veno de Aranha"; dragao → "Escama de Dragao".
- Formato de drop NOVO (item será criado automaticamente): { "name": "Nome do recurso em pt-BR", "description": "1 frase (ex.: matéria-prima de craft)", "dropChance": <1-100%>, "minQuantity": 1, "maxQuantity": 2, "guaranteed": false }
- Recurso principal (mais comum): dropChance 40-70%. Recursos secundários: 15-35%. Recursos raros (essências, núcleos): 5-15%.
- (Opcional) NO MÁXIMO 1 drop de item JÁ EXISTENTE no jogo: { "itemName": "Nome EXATO de item existente (ex.: Poção de Vida)", "dropChance": 3-10%, "minQuantity": 1, "maxQuantity": 1, "guaranteed": false }.

PEDIDO DO USUÁRIO (atenda fielmente o tema, fantasia e mecânicas pedidos):
"${idea}"`;

  console.log("=== Tentando Gemini ===");
  try {
    const t0 = Date.now();
    const text = await mod.callGemini(promptText);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Gemini OK em ${secs}s, ${text.length} chars`);
    try {
      const parsed = mod.extractJson(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.monsters || [parsed.monster || parsed];
      console.log(`JSON válido! monstros no JSON: ${arr.length}`);
      for (const m of arr) console.log(`  - ${m.name} | lv ${m.level} | elite=${m.isElite} boss=${m.isBoss}`);
    } catch (e) {
      console.log(`JSON INVÁLIDO do Gemini: ${e.message}`);
      console.log("Primeiros 300 chars:", text.slice(0, 300));
      console.log("Últimos 200 chars:", text.slice(-200));
    }
  } catch (e) {
    console.log(`Gemini falhou: ${String(e.message).slice(0, 300)}`);
  }

  console.log("\n=== Tentando Groq ===");
  try {
    const t0 = Date.now();
    const text = await mod.callGroq(promptText);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Groq OK em ${secs}s, ${text.length} chars`);
    try {
      const parsed = mod.extractJson(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.monsters || [parsed.monster || parsed];
      console.log(`JSON válido! monstros no JSON: ${arr.length}`);
      for (const m of arr) console.log(`  - ${m.name} | lv ${m.level} | elite=${m.isElite} boss=${m.isBoss}`);
    } catch (e) {
      console.log(`JSON INVÁLIDO do Groq: ${e.message}`);
      console.log("Primeiros 300 chars:", text.slice(0, 300));
      console.log("Últimos 200 chars:", text.slice(-200));
    }
  } catch (e) {
    console.log(`Groq falhou: ${String(e.message).slice(0, 300)}`);
  }
}
main().catch((e) => { console.error("falha:", e.message || e); process.exit(1); });