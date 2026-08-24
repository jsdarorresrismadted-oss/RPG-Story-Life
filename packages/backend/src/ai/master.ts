// ===== AI MASTER - AUTONOMOUS WORLD BUILDER =====

import { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { getGameStateSummary, buildAutonomousPrompt } from "./prompts";
import { executeAiAction } from "./actions";
import { callHFProviders } from "./hfProviders";

export async function startAIMaster(fastify: FastifyInstance, io: SocketIOServer, prisma: PrismaClient) {
  const ensureState = () =>
    prisma.aiMasterState.upsert({
      where: { id: "master" },
      create: { isRunning: true, lore: "", cycleCount: 0 },
      update: { isRunning: true },
    });

  try {
    await ensureState();
  } catch (err) {
    fastify.log.error({ err }, "AI Master: DB not ready, retrying in background");
    setTimeout(() => {
      ensureState()
        .then(() => runMasterLoop(fastify, io, prisma))
        .catch((e) => fastify.log.error({ err: e }, "AI Master loop crashed"));
    }, 5000);
    return;
  }

  // Start the autonomous loop
  runMasterLoop(fastify, io, prisma).catch((err) => {
    fastify.log.error({ err }, "AI Master loop crashed");
  });
}

async function runMasterLoop(fastify: FastifyInstance, io: SocketIOServer, prisma: PrismaClient) {
  fastify.log.info("🤖 AI Master loop started - 24/7 autonomous mode");

  while (true) {
    try {
      const state = await prisma.aiMasterState.findUnique({ where: { id: "master" } });
      if (!state || !state.isRunning) {
        fastify.log.info("AI Master paused, waiting...");
        await sleep(10000);
        continue;
      }

      // Execute one autonomous cycle
      await runAutonomousCycle(fastify, io, prisma, state);

      // Wait before next cycle
      await sleep(config.AI_MASTER_CYCLE_MS);
    } catch (err) {
      fastify.log.error({ err }, "AI Master cycle error");
      await sleep(30000); // Wait longer on error
    }
  }
}

async function runAutonomousCycle(fastify: FastifyInstance, io: SocketIOServer, prisma: PrismaClient, state: any) {
  const cycleNum = state.cycleCount + 1;
  fastify.log.info(`🤖 AI Master Cycle #${cycleNum} started`);

  try {
    // 1. OBSERVE - Get current game state
    const gameState = await getGameStateSummary(prisma);

    // 2. ANALYZE - Build prompt with current state + Lore
    const prompt = buildAutonomousPrompt(state.lore || "", gameState, cycleNum);

    // 3. EXECUTE - Call AI
    const response = await callHFProviders(prompt);

    // 4. PARSE & EXECUTE - Parse [ACTION] blocks
    const actions = parseActions(response);
    for (const action of actions) {
      try {
        const result = await executeAiAction(action, prisma, io);
        await logAction(prisma, cycleNum, action, result);
      } catch (err) {
        fastify.log.error({ err, action }, "Action execution failed");
      }
    }

    // 5. VALIDATE & SAVE - Update state
    const newGameState = await getGameStateSummary(prisma);
    await prisma.aiMasterState.update({
      where: { id: "master" },
      data: {
        cycleCount: cycleNum,
        lastCycleAt: new Date(),
        worldState: newGameState,
        logs: {
          create: { cycle: cycleNum, action: "cycle_complete", details: { actionsCount: actions.length } },
        },
      },
    });

    // Broadcast update to admin panels
    io.emit("ai:cycle", { cycle: cycleNum, actions: actions.length, timestamp: new Date().toISOString() });

    fastify.log.info(`✅ Cycle #${cycleNum} complete - ${actions.length} actions executed`);
  } catch (err) {
    fastify.log.error({ err, cycle: cycleNum }, "Cycle failed");
    await logAction(prisma, cycleNum, { action: "error" }, { error: String(err) });
  }
}

function parseActions(text: string): any[] {
  const actions: any[] = [];
  const regex = /\[ACTION\]\s*(\{[\s\S]*?\})\s*\[\/ACTION\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const action = JSON.parse(match[1]);
      actions.push(action);
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  return actions;
}

async function logAction(prisma: PrismaClient, cycle: number, action: any, result: any) {
  await prisma.aiMasterLog.create({
    data: { stateId: "master", cycle, action: action.action || "unknown", details: { action, result } },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
