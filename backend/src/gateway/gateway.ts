import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../core/config";
import { PrismaClient } from "@prisma/client";
import { CombatService } from "../modules/combat/combat.service";
import { CooldownManager } from "../modules/combat/cooldown.manager";
import { PvpService } from "../modules/pvp/pvp.service";

const prisma = new PrismaClient();

function sanitize(value: any): any {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  role?: string;
  currentCharacterId?: string;
  currentMapId?: string;
  partyId?: string;
  currentChatChannel?: string;
}

export function createGateway(
  io: SocketIOServer,
  combatService: CombatService,
  cooldownManager: CooldownManager,
  pvpService: PvpService
): void {
  combatService.setOnTick((payload) => {
    io.to(`character:${payload.characterId}`).emit("combat:tick", sanitize(payload));
  });

  pvpService.setOnTick((payload) => {
    io.to(`character:${payload.challengerCharacterId}`).emit("pvp:tick", sanitize(payload));
    io.to(`character:${payload.opponentCharacterId}`).emit("pvp:tick", sanitize(payload));
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = jwt.verify(token as string, config.jwt.secret) as any;
      socket.userId = payload.userId;
      socket.username = payload.username;
      socket.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`[WS] User connected: ${socket.username} (${socket.id})`);

    socket.join(`user:${socket.userId}`);

    socket.on("character:select", async (characterId: string) => {
      socket.currentCharacterId = characterId;
      socket.join(`character:${characterId}`);
      socket.emit("character:selected", { characterId });
    });

    socket.on("map:join", async (mapId: string) => {
      if (socket.currentMapId) {
        socket.leave(`map:${socket.currentMapId}`);
      }
      socket.currentMapId = mapId;
      socket.join(`map:${mapId}`);
      socket.to(`map:${mapId}`).emit("player:joined", {
        userId: socket.userId,
        username: socket.username,
      });
      socket.emit("map:joined", { mapId });
    });

    socket.on("map:leave", () => {
      if (socket.currentMapId) {
        socket.to(`map:${socket.currentMapId}`).emit("player:left", {
          userId: socket.userId,
          username: socket.username,
        });
        socket.leave(`map:${socket.currentMapId}`);
        socket.currentMapId = undefined;
      }
    });

    socket.on("chat:join", (channel: string) => {
      if (typeof channel !== "string" || !channel) return;
      if (socket.currentChatChannel) {
        socket.leave(`chat:${socket.currentChatChannel}`);
      }
      socket.join(`chat:${channel}`);
      socket.currentChatChannel = channel;
    });

    socket.on("chat:message", async (data: { channel: string; message: string; targetId?: string }) => {
      if (!data.message?.trim()) return;

      const channel = data.channel || "global";
      const message = data.message.trim();

      const chatPayload = {
        userId: socket.userId,
        username: socket.username,
        channel,
        message,
        timestamp: Date.now(),
      };

      if (channel === "whisper" && data.targetId) {
        io.to(`user:${data.targetId}`).emit("chat:message", chatPayload);
        socket.emit("chat:message", chatPayload);
        return;
      }

      if (channel === "party" && socket.partyId) {
        socket.join(`party:${socket.partyId}`);
        io.to(`party:${socket.partyId}`).emit("chat:message", chatPayload);
        return;
      }

      if (channel === "local" && socket.currentMapId) {
        socket.join(`map:${socket.currentMapId}`);
        io.to(`map:${socket.currentMapId}`).emit("chat:message", chatPayload);
        return;
      }

      const room = `chat:${channel}`;
      socket.join(room);
      io.to(room).emit("chat:message", chatPayload);
    });

    socket.on("combat:start", async (data: { monsterId: string }) => {
      try {
        if (!socket.currentCharacterId) {
          const character = await prisma.character.findFirst({
            where: { userId: socket.userId! },
            orderBy: { createdAt: "asc" },
          });
          if (!character) {
            return socket.emit("combat:error", { message: "Você precisa criar um personagem para lutar." });
          }
          socket.currentCharacterId = character.id;
          socket.join(`character:${character.id}`);
        }
        const result = await combatService.startCombat(socket.currentCharacterId, data.monsterId);
        socket.emit("combat:started", sanitize(result));
      } catch (err: any) {
        socket.emit("combat:error", { message: err.message });
      }
    });

    socket.on("combat:resume", async () => {
      try {
        if (!socket.currentCharacterId) {
          const character = await prisma.character.findFirst({
            where: { userId: socket.userId! },
            orderBy: { createdAt: "asc" },
          });
          if (!character) return;
          socket.currentCharacterId = character.id;
          socket.join(`character:${character.id}`);
        }
        const result = await combatService.resumeCombat(socket.currentCharacterId);
        if (result) socket.emit("combat:started", sanitize(result));
      } catch (err: any) {
        socket.emit("combat:error", { message: err.message });
      }
    });

    socket.on("combat:useSkill", async (data: { combatId: string; skillId: string }) => {
      if (!socket.currentCharacterId) return;
      try {
        const result = await combatService.useSkill(socket.currentCharacterId, data.combatId, data.skillId);
        socket.emit("combat:skillUsed", sanitize(result));
        socket.to(`combat:${data.combatId}`).emit("combat:update", sanitize(result));
      } catch (err: any) {
        socket.emit("combat:error", { message: err.message });
      }
    });

    socket.on("combat:flee", async (data: { combatId: string }) => {
      if (!socket.currentCharacterId) return;
      try {
        const result = await combatService.flee(socket.currentCharacterId, data.combatId);
        socket.emit("combat:action", sanitize({ ...result, action: "flee" }));
      } catch (err: any) {
        socket.emit("combat:error", { message: err.message });
      }
    });

    socket.on("combat:useItem", async (data: { combatId: string; inventoryId: string }) => {
      if (!socket.currentCharacterId) return;
      try {
        const result = await combatService.useItem(socket.currentCharacterId, data.combatId, data.inventoryId);
        socket.emit("combat:action", sanitize({ ...result, action: "item" }));
      } catch (err: any) {
        socket.emit("combat:error", { message: err.message });
      }
    });

    socket.on("party:invite", async (data: { targetUserId: string }) => {
      io.to(`user:${data.targetUserId}`).emit("party:invite", {
        fromUserId: socket.userId,
        fromUsername: socket.username,
      });
    });

    socket.on("party:join", async (data: { partyId: string }) => {
      socket.partyId = data.partyId;
      socket.join(`party:${data.partyId}`);
      socket.to(`party:${data.partyId}`).emit("party:memberJoined", {
        userId: socket.userId,
        username: socket.username,
      });
    });

    socket.on("subscribe:character", () => {
      if (socket.currentCharacterId) {
        socket.join(`character:${socket.currentCharacterId}`);
      }
    });

    socket.on("subscribe:cooldowns", () => {
      if (socket.currentCharacterId) {
        socket.join(`cooldowns:${socket.currentCharacterId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[WS] User disconnected: ${socket.username} (${socket.id})`);
      if (socket.currentMapId) {
        socket.to(`map:${socket.currentMapId}`).emit("player:left", {
          userId: socket.userId,
          username: socket.username,
        });
      }
    });
  });

  io.on("connect_error", (err) => {
    console.error(`[WS] Connection error:`, err.message);
  });
}
