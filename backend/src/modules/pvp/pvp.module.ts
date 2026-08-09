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

  // Desafiar outro aventureiro (batalha automática)
  app.post("/api/pvp/arena/challenge", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { targetCharacterId } = req.body || {};
      if (!targetCharacterId) throw new AppError(400, "Alvo não informado.");
      const payload = await pvpService.challenge(req.user!.userId, targetCharacterId);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // Abandonar a luta (conta como derrota)
  app.post("/api/pvp/arena/:matchId/flee", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pvpService.flee(req.user!.userId, req.params.matchId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
