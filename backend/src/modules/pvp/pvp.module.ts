import { Express, Request, Response, NextFunction } from "express";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { PvpService } from "./pvp.service";

export function createPvpModule(app: Express, pvpService: PvpService): void {
  // Minhas stats de arena
  app.get("/api/pvp/arena", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [me, opponents] = await Promise.all([
        pvpService.getMyStats(req.user!.userId),
        pvpService.listOpponents(req.user!.userId),
      ]);
      res.json({ me, opponents });
    } catch (err) {
      next(err);
    }
  });

  // Luta ativa deste usuário (para reconectar após refresh)
  app.get("/api/pvp/arena/active", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await pvpService.getMyStats(req.user!.userId);
      if (!character) throw new AppError(404, "Personagem não encontrado.");
      const match = await pvpService.getActiveMatch(character.id);
      if (!match) {
        res.json(null);
        return;
      }
      res.json({ matchId: match.matchId });
    } catch (err) {
      next(err);
    }
  });

  // Desafiar outro aventureiro — cria um desafio pendente até o alvo aceitar.
  app.post("/api/pvp/arena/challenge", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { targetCharacterId } = req.body || {};
      if (!targetCharacterId) throw new AppError(400, "Alvo não informado.");
      const payload = await pvpService.challenge(req.user!.userId, targetCharacterId);
      const io = app.get("io") as any;
      if (io && payload.targetUserId) {
        io.to(`user:${payload.targetUserId}`).emit("pvp:challenge", {
          challengeId: payload.challengeId,
          fromName: payload.fromName,
          targetName: payload.targetName,
          expiresInMs: payload.expiresInMs,
        });
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // Listar desafios pendentes recebidos
  app.get("/api/pvp/arena/pending", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await pvpService.getMyStats(req.user!.userId);
      if (!character) throw new AppError(404, "Personagem não encontrado.");
      const pending = await pvpService.getPendingChallengeByTarget(character.id);
      res.json(pending ? { challengeId: pending.id, fromName: pending.fromName, fromCharacterId: pending.fromCharacterId, expiresInMs: pending.expiresAt - Date.now() } : null);
    } catch (err) {
      next(err);
    }
  });

  // Aceitar (true) ou recusar (false) um desafio pendente
  app.post("/api/pvp/arena/pending/:challengeId/respond", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await pvpService.getMyStats(req.user!.userId);
      if (!character) throw new AppError(404, "Personagem não encontrado.");
      const accept = req.body?.accept === true;
      const payload = await pvpService.respondChallenge(req.params.challengeId, character.id, accept);
      const io = app.get("io") as any;
      if (io && !payload.accepted && payload.challengerCharacterId) {
        const challenger = await pvpService.getCharacterById(payload.challengerCharacterId);
        if (challenger?.userId) {
          io.to(`user:${challenger.userId}`).emit("pvp:challengeDeclined", {
            challengeId: req.params.challengeId,
            targetName: payload.targetName,
          });
        }
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // Cancelar um desafio pendente que enviei
  app.post("/api/pvp/arena/pending/:challengeId/cancel", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await pvpService.getMyStats(req.user!.userId);
      if (!character) throw new AppError(404, "Personagem não encontrado.");
      await pvpService.cancelChallenge(req.params.challengeId, character.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Abandonar a luta (conta como derrota)
  app.post("/api/pvp/arena/:matchId/flee", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const character = await pvpService.getMyStats(req.user!.userId);
      if (!character) throw new AppError(404, "Personagem não encontrado.");
      const result = await pvpService.flee(character.id, req.params.matchId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
