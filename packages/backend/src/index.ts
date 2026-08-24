// ===== BACKEND ENTRY POINT =====

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient } from "@prisma/client";
import { config } from "./config";
import { registerRoutes } from "./routes";
import { setupSocket } from "./socket";
import { startAIMaster } from "./ai/master";

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: config.NODE_ENV === "development" ? {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss Z", ignore: "pid,hostname" }
    } : undefined,
  },
});

const prisma = new PrismaClient({
  log: config.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error", "warn"],
});

// Decorate fastify with prisma
fastify.decorate("prisma", prisma);

// ===== PLUGINS =====

await fastify.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

await fastify.register(cookie, {
  secret: config.COOKIE_SECRET,
  hook: "onRequest",
});

await fastify.register(jwt, {
  secret: config.JWT_SECRET,
  cookie: { cookieName: "refreshToken", signed: false },
  sign: { expiresIn: "15m" },
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

await fastify.register(websocket);

// ===== AUTH DECORATORS =====

fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.decorate("requireAdmin", async (request: any, reply: any) => {
  await request.authenticate();
  if (request.user.role !== "admin" && request.user.role !== "owner") {
    reply.code(403).send({ error: "Forbidden" });
  }
});

// ===== HEALTH CHECK =====

fastify.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}));

// ===== ROUTES =====

await registerRoutes(fastify);

// ===== SOCKET.IO SETUP =====

const io = setupSocket(fastify);

// ===== START SERVER =====

const start = async () => {
  try {
    await fastify.listen({ port: config.PORT, host: "0.0.0.0" });
    fastify.log.info(`🚀 Server running on http://localhost:${config.PORT}`);

    // Start AI Master (always running)
    await startAIMaster(fastify, io, prisma);
    fastify.log.info("🤖 AI Master started - 24/7 autonomous mode");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  fastify.log.info("Shutting down...");
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  fastify.log.info("Shutting down...");
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

start();