import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { assertPurchaseRequirements } from "../../core/progression";

export function createCraftModule(app: Express): void {
  // Receitas de craft ativas
  app.get("/api/craft", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const recipes = await prisma.craftRecipe.findMany({
        where: { isActive: true },
        include: { resultItem: true },
        orderBy: { requiredLevel: "asc" },
      });
      res.json(recipes);
    } catch (err) {
      next(err);
    }
  });

  // Crafta: valida inventário, consome materiais e entrega o item
  app.post("/api/craft/:id/craft", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recipe = await prisma.craftRecipe.findFirst({
        where: { id: req.params.id, isActive: true },
        include: { resultItem: true },
      });
      if (!recipe) throw new AppError(404, "Receita não encontrada");

      const userId = req.user!.userId;
      await assertPurchaseRequirements(userId, {
        requiredLevel: recipe.requiredLevel,
        requiredVip: recipe.requiredVip,
        requiredQuestIds: recipe.requiredQuestIds,
      });

      const goldCost = Number(recipe.goldCost) || 0;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { gold: true },
      });
      if (!user) throw new AppError(404, "User not found");
      if (Number(user.gold) < goldCost) {
        throw new AppError(400, `Ouro insuficiente (precisa de ${goldCost.toLocaleString("pt-BR")}).`);
      }

      let ingredients: { itemName: string; quantity: number }[] = [];
      try {
        const parsed = JSON.parse(recipe.ingredients || "[]");
        ingredients = Array.isArray(parsed) ? parsed : [];
      } catch {
        ingredients = [];
      }
      if (ingredients.length === 0) throw new AppError(400, "Receita sem ingredientes");

      const inventory = await prisma.inventory.findMany({
        where: { userId },
        include: { item: true },
      });
      const has = (name: string, qty: number) =>
        inventory.some((inv) => inv.item.name.toLowerCase() === String(name).toLowerCase() && inv.quantity >= qty);

      for (const ing of ingredients) {
        if (!has(ing.itemName, ing.quantity)) {
          throw new AppError(400, `Materiais insuficientes: falta ${ing.quantity}x ${ing.itemName}.`);
        }
      }

      await prisma.$transaction(async (tx) => {
        if (goldCost > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { gold: { decrement: goldCost } },
          });
        }
        for (const ing of ingredients) {
          const rows = await tx.inventory.findMany({
            where: { userId, item: { name: { equals: ing.itemName, mode: "insensitive" } }, slotIndex: null },
            orderBy: { quantity: "desc" },
          });
          let remaining = ing.quantity;
          for (const row of rows) {
            if (remaining <= 0) break;
            const take = Math.min(row.quantity, remaining);
            remaining -= take;
            const next = row.quantity - take;
            if (next <= 0) {
              await tx.inventory.delete({ where: { id: row.id } });
            } else {
              await tx.inventory.update({ where: { id: row.id }, data: { quantity: next } });
            }
          }
        }
        const existing = await tx.inventory.findFirst({
          where: { userId, itemId: recipe.resultItemId, slotIndex: null },
        });
        if (existing) {
          await tx.inventory.update({
            where: { id: existing.id },
            data: { quantity: { increment: recipe.resultQuantity } },
          });
        } else {
          await tx.inventory.create({
            data: { userId, itemId: recipe.resultItemId, quantity: recipe.resultQuantity },
          });
        }
      });

      res.json({
        item: recipe.resultItem.name,
        quantity: recipe.resultQuantity,
        message: `${recipe.resultQuantity}x ${recipe.resultItem.name} craftado!`,
      });
    } catch (err) {
      next(err);
    }
  });
}
