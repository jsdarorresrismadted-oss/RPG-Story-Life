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
  chatProfile?: {
    isVip: boolean;
    guildTag: string | null;
    guildName: string | null;
    guildRole: string | null;
    level: number;
    characterName: string | null;
  };
}

// Carrega o perfil do usuário usado nas tags do chat ([Staff], [VIP], [GuildTag]).
async function loadChatProfile(socket: AuthenticatedSocket): Promise<{
  isVip: boolean;
  guildTag: string | null;
  guildName: string | null;
  guildRole: string | null;
  level: number;
  characterName: string | null;
}> {
  const [user, membership, character] = await Promise.all([
    prisma.user.findUnique({
      where: { id: socket.userId },
      select: { vipUntil: true, role: true },
    }),
    prisma.guildMember.findFirst({
      where: { userId: socket.userId },
      select: { role: true, guild: { select: { tag: true, name: true } } },
    }),
    prisma.character.findFirst({
      where: { userId: socket.userId },
      orderBy: [{ level: "desc" }, { updatedAt: "desc" }],
      select: { level: true, name: true },
    }),
  ]);
  return {
    isVip: !!(user?.vipUntil && new Date(user.vipUntil).getTime() > Date.now()),
    guildTag: membership?.guild?.tag ?? null,
    guildName: membership?.guild?.name ?? null,
    guildRole: membership?.role ?? null,
    level: character?.level ?? 0,
    characterName: character?.name ?? null,
  };
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

  pvpService.setOnUpdate((payload) => {
    io.to(`character:${payload.challengerCharacterId}`).emit("pvp:update", sanitize(payload));
    io.to(`character:${payload.opponentCharacterId}`).emit("pvp:update", sanitize(payload));
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

      if (!socket.chatProfile) {
        socket.chatProfile = await loadChatProfile(socket);
      }

      const chatPayload = {
        userId: socket.userId,
        username: socket.username,
        role: socket.role ?? "player",
        isVip: socket.chatProfile.isVip,
        guildTag: socket.chatProfile.guildTag,
        guildName: socket.chatProfile.guildName,
        guildRole: socket.chatProfile.guildRole,
        level: socket.chatProfile.level,
        characterName: socket.chatProfile.characterName,
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

    // Atualiza as tags do chat quando o usuário entra/sai de guilda ou troca de personagem.
    socket.on("chat:refresh", async () => {
      socket.chatProfile = await loadChatProfile(socket);
      socket.emit("chat:profile", socket.chatProfile);
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

    // ============ PvP manual (arena com desafio + controle real) ============
    const ensureCharacterId = async (): Promise<string | undefined> => {
      if (socket.currentCharacterId) return socket.currentCharacterId;
      const character = await prisma.character.findFirst({
        where: { userId: socket.userId! },
        orderBy: { createdAt: "asc" },
      });
      if (!character) return undefined;
      socket.currentCharacterId = character.id;
      socket.join(`character:${character.id}`);
      return character.id;
    };

    socket.on("pvp:respondChallenge", async (data: { challengeId: string; accept: boolean }) => {
      try {
        const characterId = await ensureCharacterId();
        if (!characterId) return socket.emit("pvp:error", { message: "Nenhum personagem selecionado." });
        const result = await pvpService.respondChallenge(data.challengeId, characterId, !!data.accept);
        socket.emit("pvp:challengeResult", sanitize(result));
        if (!result.accepted) {
          io.to(`character:${result.challengerCharacterId}`).emit("pvp:challengeDeclined", {
            challengeId: data.challengeId,
            targetName: result.targetName,
          });
        }
      } catch (err: any) {
        socket.emit("pvp:error", { message: err.message });
      }
    });

    socket.on("pvp:useSkill", async (data: { matchId: string; skillId: string }) => {
      try {
        const characterId = await ensureCharacterId();
        if (!characterId) return socket.emit("pvp:error", { message: "Nenhum personagem selecionado." });
        const result = await pvpService.useSkill(characterId, data.matchId, data.skillId);
        socket.emit("pvp:skillUsed", sanitize(result));
      } catch (err: any) {
        socket.emit("pvp:error", { message: err.message });
      }
    });

    socket.on("pvp:useItem", async (data: { matchId: string; heal: number; mana: number }) => {
      try {
        const characterId = await ensureCharacterId();
        if (!characterId) return socket.emit("pvp:error", { message: "Nenhum personagem selecionado." });
        const result = await pvpService.useItem(characterId, data.matchId, data.heal || 0, data.mana || 0);
        socket.emit("pvp:itemUsed", sanitize(result));
      } catch (err: any) {
        socket.emit("pvp:error", { message: err.message });
      }
    });

    socket.on("pvp:flee", async (data: { matchId: string }) => {
      try {
        const characterId = await ensureCharacterId();
        if (!characterId) return socket.emit("pvp:error", { message: "Nenhum personagem selecionado." });
        const result = await pvpService.flee(characterId, data.matchId);
        socket.emit("pvp:fled", sanitize(result));
      } catch (err: any) {
        socket.emit("pvp:error", { message: err.message });
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
