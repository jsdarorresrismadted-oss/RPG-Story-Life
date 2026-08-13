import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { config } from "./config";
import { autoBackupExtension } from "./backup";

// $extends adiciona o auto-backup; o cast mantém a tipagem original de PrismaClient
// (transactions, services etc.) sem perder o comportamento da extensão.
export const prisma = new PrismaClient().$extends(autoBackupExtension) as unknown as PrismaClient;

export const redis = new Redis(config.redis.url, {
  keyPrefix: config.redis.prefix,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
});
redis.on("error", (err) => console.error("[Redis]", err.message));
