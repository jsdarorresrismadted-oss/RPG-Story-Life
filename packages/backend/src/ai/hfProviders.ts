// ===== HF INFERENCE PROVIDERS - FREE 24/7 CHAIN =====

import { InferenceClient } from "@huggingface/inference";

const HF_TOKEN = process.env.HF_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const hfClient = HF_TOKEN ? new InferenceClient(HF_TOKEN) : null;

const PROVIDER_CHAIN = [
  { provider: "groq" as const, model: "llama-3.3-70b-versatile", name: "Groq (Llama 3.3 70B)", key: () => process.env.GROQ_API_KEY },
  { provider: "cerebras" as const, model: "llama-3.1-70b", name: "Cerebras (Llama 3.1 70B)", key: () => process.env.HF_TOKEN },
];

export async function callHFProviders(
  prompt: string,
  systemPrompt?: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  if (!hfClient) {
    throw new Error("HF_TOKEN não configurado - HF Providers indisponível");
  }

  const maxTokens = options?.maxTokens ?? 4000;
  const temperature = options?.temperature ?? 0.8;

  const messages = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: prompt },
  ];

  let lastError: Error | null = null;

  for (const { provider, model, name } of PROVIDER_CHAIN) {
    try {
      console.log(`[HF Providers] Tentando ${name} (${provider}/${model})...`);

      const response = await hfClient.chatCompletion({
        model,
        provider,
        messages,
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Resposta vazia do provedor");

      console.log(`[HF Providers] ✓ Sucesso com ${name}`);
      return content;

    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes?.("rate limit");
      const isUnavailable = err?.status === 503 || err?.message?.includes?.("unavailable");
      const isQuotaExceeded = err?.message?.includes?.("quota") || err?.message?.includes?.("exceeded");

      if (isRateLimit || isUnavailable || isQuotaExceeded) {
        console.warn(`[HF Providers] ${name} indisponível (${err?.status || "erro"}), tentando próximo...`);
        continue;
      }

      console.warn(`[HF Providers] ${name} erro não-recuperável: ${err?.message || err}`);
      continue;
    }
  }

  throw lastError || new Error("Todos os provedores HF falharam");
}

export function isHFProvidersAvailable(): boolean {
  return !!process.env.HF_TOKEN;
}

export function getHFProvidersInfo() {
  return {
    available: !!process.env.HF_TOKEN,
    chain: PROVIDER_CHAIN.map(({ provider, model, name }) => ({ provider, model, name })),
  };
}