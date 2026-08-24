// ===== CONFIGURATION =====

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/rpg_story_life",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-production",
  COOKIE_SECRET: process.env.COOKIE_SECRET || "cookie-secret-change-in-production",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",

  // AI Providers
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  HF_TOKEN: process.env.HF_TOKEN || "",
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY || "",

  // Game Settings
  MAX_LEVEL: 100,
  MAX_ENCHANTMENT_LEVEL: 150,
  MAX_RANK: 10,

  // AI Master
  AI_MASTER_CYCLE_MS: 5000,
  AI_MAX_TOKENS: 4000,
  AI_TEMPERATURE: 0.8,
} as const;

export type Config = typeof config;
