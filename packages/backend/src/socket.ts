// ===== SOCKET.IO SETUP =====

import { FastifyInstance } from "fastify";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verify } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  characterId?: string;
}

export function setupSocket(fastify: FastifyInstance): SocketIOServer {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    },
  });

  // Auth middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("Authentication required"));

      const jwt = await import("jsonwebtoken");
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET || "dev-secret") as { sub: string };

      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { id: true } });
      if (!user) return next(new Error("User not found"));

      socket.userId = user.id;
      const character = await prisma.character.findFirst({ where: { userId: user.id }, select: { id: true } });
      socket.characterId = character?.id || undefined;
      await prisma.$disconnect();

      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join character room
    if (socket.characterId) {
      socket.join(`character:${socket.characterId}`);
    }

    // Join global room
    socket.join("global");

    // Combat events
    socket.on("combat:action", async (data) => {
      // Handle combat actions via socket
      io.to(`character:${socket.characterId}`).emit("combat:update", data);
    });

    // Chat
    socket.on("chat:message", async (data) => {
      io.emit("chat:message", {
        sender: socket.userId,
        characterId: socket.characterId,
        message: data.message,
        channel: data.channel || "global",
        timestamp: new Date().toISOString(),
      });
    });

    // AI Master events
    socket.on("ai:command", async (data) => {
      // Forward to AI Master
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  // Helper to emit to specific character
  io.emitToCharacter = (characterId: string, event: string, data: any) => {
    io.to(`character:${characterId}`).emit(event, data);
  };

  // Helper to emit to all
  io.emitGlobal = (event: string, data: any) => {
    io.emit(event, data);
  };

  return io;
}

export { SocketIOServer };
