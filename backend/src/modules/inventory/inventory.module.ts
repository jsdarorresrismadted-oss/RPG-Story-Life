import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { withEnchantmentStats } from "../../core/enchantments/enchantmentStats";
import { parseQuestIds } from "../../core/progression";
import { EQUIP_SLOT_MAP } from "../../core/equipmentSlots";

const EQUIP_SLOTS = ["weapon", "class", "helm", "armor", "cape", "ring", "necklace"] as const;

// Anexa computedStats (fórmula de progressão) ao encantamento de cada item
const enrichItems = (rows: any[]): any[] =>
  rows.map((inv) => ({
    ...inv,
    item: inv.item?.enchantment ? { ...inv.item, enchantment: withEnchantmentStats(inv.item.enchantment) } : inv.item,
  }));

// Anexa a receita de craft (se o item for craftável) com ingredientes, custo e requisitos resolvidos.
async function enrichWithRecipe(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const recipes = await prisma.craftRecipe.findMany({ where: { isActive: true } });
  if (!recipes.length) return rows;
  const questIds = [...new Set(recipes.flatMap((r) => parseQuestIds(r.requiredQuestIds)))];
  const quests = questIds.length
    ? await prisma.quest.findMany({ where: { id: { in: questIds } }, select: { id: true, title: true } })
    : [];
  const questTitle = new Map(quests.map((q) => [q.id, q.title]));
  const byItem = new Map(recipes.map((r) => [r.resultItemId, r]));
  return rows.map((inv) => {
    const rec = byItem.get(inv.itemId);
    if (!rec) return inv;
    const reqIds = parseQuestIds(rec.requiredQuestIds);
    let ingredients: { itemName: string; quantity: number }[] = [];
    try {
      const parsed = JSON.parse(rec.ingredients || "[]");
      ingredients = Array.isArray(parsed) ? parsed : [];
    } catch {
      ingredients = [];
    }
    return {
      ...inv,
      recipe: {
        id: rec.id,
        name: rec.name,
        description: rec.description,
        resultQuantity: rec.resultQuantity,
        requiredLevel: rec.requiredLevel,
        requiredVip: rec.requiredVip,
        goldCost: Number(rec.goldCost) || 0,
        requiredQuestIds: reqIds,
        requiredQuests: reqIds.map((id) => ({ id, title: questTitle.get(id) || "Missão" })),
        ingredients,
      },
    };
  });
}

const SLOT_MAP = EQUIP_SLOT_MAP;

function parseSlots(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function createInventoryModule(app: Express): void {
  app.get("/api/inventory", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.inventory.findMany({
        where: { userId: req.user!.userId },
        include: { item: { include: { enchantment: true } } },
        orderBy: { acquiredAt: "desc" },
      });
      res.json(await enrichWithRecipe(enrichItems(items)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/inventory/equipped", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const equipped = await prisma.inventory.findMany({
        where: { userId: req.user!.userId, isEquipped: true },
        include: { item: { include: { enchantment: true } } },
      });
      res.json(enrichItems(equipped));
    } catch (err) {
      next(err);
    }
  });

  // Equipa um item no slot correspondente ao seu tipo
  app.post("/api/inventory/equip", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { inventoryId, characterId } = req.body;
      const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { item: true },
      });
      if (!inv || inv.userId !== req.user!.userId) {
        throw new AppError(404, "Item not found in inventory");
      }

      const itemType = inv.item.type;
      if (!EQUIP_SLOTS.includes(itemType as any)) {
        throw new AppError(400, "Item cannot be equipped");
      }

      // Item exclusivo para VIP
      if (inv.item.requiredVip) {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { vipOwned: true },
        });
        if (!user?.vipOwned) {
          throw new AppError(403, "Este item é exclusivo para VIP.");
        }
      }

      await prisma.$transaction(async (tx) => {
        // Unequip any item in the same slot
        const existingEquipped = await tx.inventory.findFirst({
          where: {
            userId: req.user!.userId,
            isEquipped: true,
            item: { type: itemType },
          },
          include: { item: true },
        });
        if (existingEquipped) {
          await tx.inventory.update({
            where: { id: existingEquipped.id },
            data: { isEquipped: false },
          });
        }

        await tx.inventory.update({
          where: { id: inventoryId },
          data: { isEquipped: true },
        });

        const field = SLOT_MAP[itemType];
        await tx.equipment.upsert({
          where: { characterId },
          create: { characterId, [field]: inv.itemId },
          update: { [field]: inv.itemId },
        });

        // Ao equipar anel/colar do inventario (gacha), desequipa boosters
        // legados (UserBooster) do mesmo tipo para nao somar dois bônus.
        if (itemType === "ring" || itemType === "necklace") {
          await tx.userBooster.updateMany({
            where: { userId: req.user!.userId, equipped: true, booster: { type: itemType } },
            data: { equipped: false },
          });
        }
      });

      res.json({ message: "Item equipped" });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/inventory/unequip", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { inventoryId, characterId } = req.body;
      const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { item: true },
      });
      if (!inv || inv.userId !== req.user!.userId) {
        throw new AppError(404, "Item not found");
      }

      await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
          where: { id: inventoryId },
          data: { isEquipped: false },
        });

        const field = SLOT_MAP[inv.item.type];
        if (field) {
          await tx.equipment.update({
            where: { characterId },
            data: { [field]: null },
          });
        }
      });

      res.json({ message: "Item unequipped" });
    } catch (err) {
      next(err);
    }
  });

  // Encantamentos que o jogador possui
  app.get("/api/inventory/enchantments", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owned = await prisma.userEnchantment.findMany({
        where: { userId: req.user!.userId },
        include: { enchantment: true },
        orderBy: { acquiredAt: "desc" },
      });
      res.json(owned.map((ue) => ({ ...ue, enchantment: withEnchantmentStats(ue.enchantment) })));
    } catch (err) {
      next(err);
    }
  });

  // Aplica (ou troca) um encantamento em um item equipável compatível
  app.post("/api/inventory/enchant", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { inventoryId, enchantmentId } = req.body;
      const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { item: true },
      });
      if (!inv || inv.userId !== req.user!.userId) {
        throw new AppError(404, "Item not found in inventory");
      }
      if (!EQUIP_SLOTS.includes(inv.item.type as any)) {
        throw new AppError(400, "Este item não aceita encantamentos");
      }

      const enchantment = await prisma.enchantment.findUnique({ where: { id: enchantmentId } });
      if (!enchantment || !enchantment.isActive) {
        throw new AppError(404, "Encantamento não encontrado");
      }
      // Encantamento exclusivo para VIP
      if (enchantment.requiredVip) {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { vipOwned: true },
        });
        if (!user?.vipOwned) {
          throw new AppError(403, "Este encantamento é exclusivo para VIP.");
        }
      }
      if (inv.item.rank < (enchantment.minRank || 1)) {
        throw new AppError(400, `Encantamento requer item de rank ${enchantment.minRank}`);
      }
      // Encantamento de nível alto não pode ser aplicado em item de nível menor
      if (inv.item.level < enchantment.level) {
        throw new AppError(400, `Encantamento nível ${enchantment.level} exige item de nível ${enchantment.level} ou superior`);
      }
      const compatible = parseSlots(enchantment.compatibleSlots);
      if (compatible.length > 0 && !compatible.includes(inv.item.type)) {
        throw new AppError(400, "Encantamento incompatível com este item");
      }

      await prisma.$transaction(async (tx) => {
        const owned = await tx.userEnchantment.findUnique({
          where: { userId_enchantmentId: { userId: req.user!.userId, enchantmentId } },
        });
        if (!owned || owned.quantity < 1) {
          throw new AppError(400, "Você não possui este encantamento");
        }

        // Troca: devolve o encantamento antigo para o jogador
        const oldEnchantmentId = inv.item.enchantmentId;
        if (oldEnchantmentId && oldEnchantmentId !== enchantmentId) {
          await tx.userEnchantment.upsert({
            where: { userId_enchantmentId: { userId: req.user!.userId, enchantmentId: oldEnchantmentId } },
            create: { userId: req.user!.userId, enchantmentId: oldEnchantmentId, quantity: 1 },
            update: { quantity: { increment: 1 } },
          });
        }

        await tx.userEnchantment.update({
          where: { userId_enchantmentId: { userId: req.user!.userId, enchantmentId } },
          data: { quantity: { decrement: 1 } },
        });

        await tx.item.update({
          where: { id: inv.itemId },
          data: { enchantmentId },
        });
      });

      res.json({ message: "Encantamento aplicado!" });
    } catch (err) {
      next(err);
    }
  });

  // Remove o encantamento do item, devolvendo-o ao jogador
  app.post("/api/inventory/enchant/remove", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { inventoryId } = req.body;
      const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { item: true },
      });
      if (!inv || inv.userId !== req.user!.userId) {
        throw new AppError(404, "Item not found in inventory");
      }
      const enchantmentId = inv.item.enchantmentId;
      if (!enchantmentId) {
        throw new AppError(400, "Item sem encantamento");
      }

      await prisma.$transaction(async (tx) => {
        await tx.item.update({
          where: { id: inv.itemId },
          data: { enchantmentId: null },
        });
        await tx.userEnchantment.upsert({
          where: { userId_enchantmentId: { userId: req.user!.userId, enchantmentId } },
          create: { userId: req.user!.userId, enchantmentId, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
      });

      res.json({ message: "Encantamento removido" });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/inventory/:id", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inv = await prisma.inventory.findUnique({
        where: { id: req.params.id },
      });
      if (!inv || inv.userId !== req.user!.userId) {
        throw new AppError(404, "Item not found");
      }
      await prisma.inventory.delete({ where: { id: req.params.id } });
      res.json({ message: "Item deleted" });
    } catch (err) {
      next(err);
    }
  });
}
