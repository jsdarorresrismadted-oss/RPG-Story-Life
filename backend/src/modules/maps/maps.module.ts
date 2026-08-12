import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate, requireRole } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";

// Posições iniciais dos pinos do mapa mundi (usadas enquanto o staff não
// define uma posição própria no banco). Novos mapas sem default ficam sem
// pino até o staff posicioná-los.
const DEFAULT_WORLD_PINS: Record<string, { left: number; top: number }> = {
  arcadia: { left: 25, top: 42 },
  "floresta-sombria": { left: 52, top: 26 },
  "caverna-do-dragao": { left: 74, top: 64 },
};

function withWorldPin(map: any): any {
  const def = DEFAULT_WORLD_PINS[map.slug];
  const left = map.pinLeft ?? def?.left ?? null;
  const top = map.pinTop ?? def?.top ?? null;
  if (left === null || top === null) return { ...map, pinLeft: null, pinTop: null };
  return { ...map, pinLeft: left, pinTop: top };
}

export function createMapsModule(app: Express): void {
  app.get("/api/maps", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const maps = await prisma.map.findMany({
        where: { isActive: true },
        include: {
          npcs: { where: { npc: { isActive: true } }, include: { npc: true } },
          monsters: {
            where: { monster: { isActive: true } },
            include: { monster: true },
            orderBy: { spawnRate: "desc" },
          },
          connections: { include: { toMap: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
      res.json(maps.map(withWorldPin));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/maps/:slug", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const map = await prisma.map.findUnique({
        where: { slug: req.params.slug },
        include: {
          npcs: { where: { npc: { isActive: true } }, include: { npc: { include: { shopItems: { include: { item: true, enchantment: true, class: true } }, quests: true } } } },
          monsters: {
            where: { monster: { isActive: true } },
            include: { monster: { include: { drops: { include: { item: true } } } } },
            orderBy: { spawnRate: "desc" },
          },
          connections: { include: { toMap: true } },
          questGivers: true,
        },
      });
      if (!map) {
        res.status(404).json({ error: "Map not found" });
        return;
      }
      res.json(withWorldPin(map));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/maps/:slug/npcs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const map = await prisma.map.findUnique({ where: { slug: req.params.slug } });
      if (!map) {
        res.status(404).json({ error: "Map not found" });
        return;
      }
      const npcs = await prisma.mapNpc.findMany({
        where: { mapId: map.id, npc: { isActive: true } },
        include: { npc: true },
      });
      res.json(npcs);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/maps/:slug/monsters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const map = await prisma.map.findUnique({ where: { slug: req.params.slug } });
      if (!map) {
        res.status(404).json({ error: "Map not found" });
        return;
      }
      const monsters = await prisma.mapMonster.findMany({
        where: { mapId: map.id, monster: { isActive: true } },
        include: { monster: true },
        orderBy: { spawnRate: "desc" },
      });
      res.json(monsters);
    } catch (err) {
      next(err);
    }
  });

  // Staff (admin/owner) ajusta a posição do pino no mapa mundi — vale para todos.
  app.put("/api/maps/:id/pin", authenticate, requireRole("admin", "owner"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const left = Number(req.body?.left);
      const top = Number(req.body?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        throw new AppError(400, "left e top devem ser números");
      }
      const pinLeft = Math.min(100, Math.max(0, left));
      const pinTop = Math.min(100, Math.max(0, top));
      const map = await prisma.map.update({
        where: { id: req.params.id },
        data: { pinLeft, pinTop },
      });
      res.json({ id: map.id, slug: map.slug, pinLeft, pinTop });
    } catch (err) {
      next(err);
    }
  });
}
