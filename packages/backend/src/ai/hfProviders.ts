// ===== PROVIDER CHAIN - GROQ (primary) + CEREBRAS (fallback) =====
// Usa fetch direto contra APIs OpenAI-compatíveis (sem dependência do SDK HF).

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

const PROVIDERS = [
  {
    name: "Groq (Llama 3.3 70B)",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "Cerebras (Llama 3.1 70B)",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: () => CEREBRAS_API_KEY,
    model: "llama-3.1-70b",
  },
];

async function chatCompletion(provider: any, messages: any[], maxTokens: number, temperature: number): Promise<string> {
  const key = provider.key();
  if (!key) throw new Error(`${provider.name} sem API key`);

  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${provider.name} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

export async function callHFProviders(
  prompt: string,
  systemPrompt?: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 4000;
  const temperature = options?.temperature ?? 0.8;

  const messages = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: prompt },
  ];

  let lastError: Error | null = null;

  for (const provider of PROVIDERS) {
    try {
      console.log(`[Providers] Tentando ${provider.name}...`);
      const content = await chatCompletion(provider, messages, maxTokens, temperature);
      if (!content) throw new Error("Resposta vazia do provedor");
      console.log(`[Providers] Sucesso com ${provider.name}`);
      return content;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Providers] ${provider.name} falhou: ${err?.message || err}`);
    }
  }

  throw lastError || new Error("Todos os provedores falharam");
}

export function isHFProvidersAvailable(): boolean {
  return !!GROQ_API_KEY || !!CEREBRAS_API_KEY;
}

export function getHFProvidersInfo() {
  return {
    available: isHFProvidersAvailable(),
    chain: PROVIDERS.map(({ name, model }) => ({ name, model })),
  };
}
