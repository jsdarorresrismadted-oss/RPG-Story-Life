import "dotenv/config";
import express from "express";
import path from "path";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./core/config";
import { prisma, redis } from "./core/database";
import { runBackup } from "./core/backup";
import { errorHandler } from "./core/middleware/errorHandler";
import { createAuthModule } from "./modules/auth/auth.module";
import { createGateway } from "./gateway/gateway";
import { RaidService } from "./modules/raid/raid.service";
import { CombatService } from "./modules/combat/combat.service";
import { CooldownManager } from "./modules/combat/cooldown.manager";
import { PvpService } from "./modules/pvp/pvp.service";

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason);
});

const app = express();
const server = http.createServer(app);

// Railway (e proxies em geral) terminam o TLS — sem isso o req.ip é o IP do
// proxy para TODOS os usuários e o rate limit global vira um único balde compartilhado.
app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.json = (body: unknown) => {
    res.setHeader("Content-Type", "application/json");
    return res.send(
      JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
    );
  };
  next();
});

const io = new SocketIOServer(server, {
  cors: {
    origin: [config.frontendUrl, config.adminUrl],
    credentials: true,
  },
  pingInterval: 30000,
  pingTimeout: 10000,
});

app.use(helmet());
app.use(compression());
app.use(cors({ origin: [config.frontendUrl, config.adminUrl], credentials: true }));
app.use(morgan("short"));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now(), uptime: process.uptime() });
});

const combatService = new CombatService(prisma, redis, new RaidService(prisma));
const cooldownManager = new CooldownManager(redis);
const pvpService = new PvpService(prisma, combatService);

app.set("combatService", combatService);
app.set("cooldownManager", cooldownManager);
app.set("pvpService", pvpService);
app.set("io", io);
app.set("prisma", prisma);
app.set("redis", redis);

import { registerModules } from "./app";
registerModules(app);
createGateway(io, combatService, cooldownManager, pvpService);

const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

const adminDist = path.resolve(__dirname, "../../admin/dist");
app.use("/admin", express.static(adminDist));
app.get("/admin/*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(adminDist, "index.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(errorHandler);

server.listen(config.port, () => {
  console.log(`[RPG Story Life] Server running on port ${config.port}`);
  console.log(`[RPG Story Life] Environment: ${config.nodeEnv}`);
  // Snapshot ao iniciar (produção): garante um backup recente a cada deploy.
  // Em dev a DATABASE_URL é o túnel local (127.0.0.1) — o backup falha de forma
  // silenciosa sem túnel aberto, então não executamos nesse caso.
  const dbUrl = process.env.DATABASE_URL || "";
  if (!/127\.0\.0\.1|localhost/.test(dbUrl)) {
    runBackup().catch((err) => console.error("[auto-backup] falha no backup inicial:", (err as Error).message));
  }
});

process.on("SIGTERM", async () => {
  console.log("[RPG Story Life] SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  redis.disconnect();
  server.close(() => process.exit(0));
});

export { app, server, io };
