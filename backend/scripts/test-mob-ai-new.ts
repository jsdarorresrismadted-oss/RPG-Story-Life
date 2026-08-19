const mod = require("../src/core/ai/monsterGenerator");
const idea = process.argv[2] || "10 mobs do level 1 ao level 6 os ultimos 1 boss e 1 elite.";
const promptText = mod.buildPrompt(idea, 1250);

async function test(name: string, fnCall: () => Promise<string>) {
  console.log(`=== Tentando ${name} ===`);
  try {
    const t0 = Date.now();
    const text = await fnCall();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`${name} OK em ${secs}s, ${text.length} chars`);
    try {
      const parsed = mod.extractJson(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.monsters || [parsed.monster || parsed];
      console.log(`JSON válido! monstros no JSON: ${arr.length}`);
      for (const x of arr) console.log(`  - ${x.name} | lv ${x.level} | elite=${x.isElite} boss=${x.isBoss}`);
    } catch (e) {
      console.log(`JSON INVÁLIDO: ${e.message}`);
      console.log("Primeiros 400:", text.slice(0, 400));
      console.log("Últimos 200:", text.slice(-200));
    }
  } catch (e) {
    console.log(`${name} falhou: ${String(e.message).slice(0, 400)}`);
  }
}

(async () => {
  await test("Gemini-3.6-flash (direto)", async () => {
    const key = process.env.GEMINI_API_KEY;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  });
  await test("Groq", () => mod.callGroq(promptText));
})();