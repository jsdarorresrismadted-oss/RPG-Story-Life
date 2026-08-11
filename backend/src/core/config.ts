export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  adminUrl: process.env.ADMIN_URL || "http://localhost:5174",
  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    prefix: process.env.REDIS_PREFIX || "rpgsl:",
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  },
  aiRateLimit: {
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || "60000", 10),
    maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || "6", 10),
    minIntervalMs: parseInt(process.env.AI_MIN_INTERVAL_MS || "8000", 10),
  },
  combat: {
    tickRate: parseInt(process.env.COMBAT_TICK_RATE || "1000", 10),
    cooldownResolution: parseInt(process.env.COOLDOWN_RESOLUTION || "100", 10),
  },
};
