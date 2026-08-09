import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { displayStats } from "../classes/classes.module";

// Catálogo unificado de conteúdo para o Codex e o jogo.
// Só lê conteúdo ativo; nada de dados de jogador aqui.
export function createContentModule(app: Express): void {
  app.get("/api/content", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [classes, items, monsters, maps, quests] = await Promise.all([
        prisma.gameClass.findMany({
          where: { isActive: true },
          include: {
            skills: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
            passives: { orderBy: { rankRequired: "asc" as const } },
            statModel: true,
          },
          orderBy: { name: "asc" },
        }),
        prisma.item.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        }),
        prisma.monster.findMany({
          where: { isActive: true },
          include: { drops: { include: { item: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.map.findMany({
          where: { isActive: true },
          include: {
            npcs: { where: { npc: { isActive: true } }, include: { npc: true } },
            monsters: { where: { monster: { isActive: true } }, include: { monster: true }, orderBy: { spawnRate: "desc" as const } },
            connections: { include: { toMap: true } },
          },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.quest.findMany({
          where: { isActive: true },
          include: { giverNpc: { select: { name: true } }, map: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      res.json({
        classes: classes.map((c: any) => ({ ...c, stats: displayStats(c) })),
        items,
        monsters,
        maps,
        quests,
      });
    } catch (err) {
      next(err);
    }
  });

  // Patch notes ativos (avisos de atualização exibidos no Dashboard)
  app.get("/api/patch-notes", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const notes = await prisma.patchNote.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      res.json(notes);
    } catch (err) {
      next(err);
    }
  });
}
