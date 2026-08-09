import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";

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
      res.json(maps);
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
      res.json(map);
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
}
