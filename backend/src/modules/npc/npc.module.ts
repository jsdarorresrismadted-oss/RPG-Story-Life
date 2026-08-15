import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { assertPurchaseRequirements } from "../../core/progression";
import { withEnchantmentStats } from "../../core/enchantments/enchantmentStats";

const SHOP_TYPES = new Set(["vendor", "shop", "enchantments", "classes"]);
const QUEST_TYPES = new Set(["quest_giver", "quest"]);
const ENCHANTABLE_SLOTS = ["weapon", "class", "helm", "armor", "cape", "ring", "necklace"] as const;

function parseSlots(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// Anexa computedStats (fórmula de progressão) aos encantamentos das ofertas
function enrichOffers(shopItems: any[]): any[] {
  return (shopItems || []).map((s) =>
    s.enchantment ? { ...s, enchantment: withEnchantmentStats(s.enchantment) } : s
  );
}

export function createNpcModule(app: Express): void {
  app.get("/api/npcs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, mapId } = req.query;
      const where: any = { isActive: true };
      if (type) where.type = type;
      if (mapId) where.mapNpcs = { some: { mapId: mapId as string } };

      const npcs = await prisma.npc.findMany({
        where,
        include: {
          mapNpcs: { include: { map: { select: { name: true, slug: true } } } },
          shopItems: { include: { item: true, enchantment: true, class: true } },
          quests: true,
        },
      });
      for (const npc of npcs) {
        if (!SHOP_TYPES.has(npc.type)) (npc as any).shopItems = [];
        if (!QUEST_TYPES.has(npc.type)) (npc as any).quests = [];
        (npc as any).shopItems = enrichOffers((npc as any).shopItems);
      }
      res.json(npcs);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/npcs/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const npc = await prisma.npc.findUnique({
        where: { id: req.params.id },
        include: {
          shopItems: { include: { item: true, enchantment: true, class: true } },
          quests: true,
          mapNpcs: { include: { map: true } },
        },
      });
      if (!npc) {
        res.status(404).json({ error: "NPC not found" });
        return;
      }
      if (!SHOP_TYPES.has(npc.type)) (npc as any).shopItems = [];
      if (!QUEST_TYPES.has(npc.type)) (npc as any).quests = [];
      (npc as any).shopItems = enrichOffers((npc as any).shopItems);
      res.json(npc);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/npcs/:id/shop", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const npc = await prisma.npc.findUnique({ where: { id: req.params.id }, select: { type: true } });
      if (!npc) throw new AppError(404, "NPC not found");
      if (!SHOP_TYPES.has(npc.type)) {
        res.json([]);
        return;
      }
      const shop = await prisma.shopItem.findMany({
        where: { npcId: req.params.id },
        include: { item: true, enchantment: true, class: true },
      });
      res.json(enrichOffers(shop));
    } catch (err) {
      next(err);
    }
  });

  // Buy an item (ou encantamento ou classe) do NPC vendor (debita gold/diamante e adiciona ao inventário/coleção)
  app.post("/api/npcs/:id/buy", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { itemId, enchantmentId, classId, quantity = 1, inventoryId } = req.body;
      if (!itemId && !enchantmentId && !classId) throw new AppError(400, "itemId, enchantmentId ou classId required");
      const qty = Math.max(1, Math.floor(Number(quantity) || 1));

      const npc = await prisma.npc.findUnique({ where: { id: req.params.id }, select: { type: true } });
      if (!npc) throw new AppError(404, "NPC not found");
      if (!SHOP_TYPES.has(npc.type)) {
        throw new AppError(403, "Este NPC não é um vendedor.");
      }

      const shopOffer = enchantmentId
        ? await prisma.shopItem.findFirst({
            where: { npcId: req.params.id, enchantmentId },
            include: { item: true, enchantment: true, class: true },
          })
        : classId
        ? await prisma.shopItem.findFirst({
            where: { npcId: req.params.id, classId },
            include: { item: true, enchantment: true, class: true },
          })
        : await prisma.shopItem.findFirst({
            where: { npcId: req.params.id, itemId },
            include: { item: true, enchantment: true, class: true },
          });
      if (!shopOffer) throw new AppError(404, "Item not sold by this NPC");

      // Encantamento desativado não pode ser comprado (nem item inativo)
      if (shopOffer.enchantmentId && !shopOffer.enchantment?.isActive) {
        throw new AppError(400, "Este encantamento não está mais disponível.");
      }
      if (shopOffer.itemId && !shopOffer.item?.isActive) {
        throw new AppError(400, "Este item não está mais disponível.");
      }
      if (shopOffer.classId && !shopOffer.class?.isActive) {
        throw new AppError(400, "Esta classe não está mais disponível.");
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, gold: true, sfCoins: true, vipUntil: true, level: true },
      });
      if (!user) throw new AppError(404, "User not found");

      // Requisitos de compra: VIP, quests concluídas e nível do personagem ativo
      const requiresVip = shopOffer.requiredVip || shopOffer.item?.requiredVip || shopOffer.enchantment?.requiredVip || shopOffer.class?.requiredVip;
      await assertPurchaseRequirements(user.id, {
        requiredLevel: Number(shopOffer.requiredLevel) || Number(shopOffer.class?.requiredLevel) || 0,
        requiredVip: !!requiresVip,
        requiredQuestIds: shopOffer.requiredQuestIds,
      });

      const currency = shopOffer.currency === "sf_coins" ? "sf_coins" : "gold";
      const totalPrice = Number(shopOffer.price) * qty;
      if (currency === "sf_coins") {
        if (Number(user.sfCoins) < totalPrice) {
          throw new AppError(400, `Not enough SF Coins (need ${totalPrice})`);
        }
      } else if (Number(user.gold) < totalPrice) {
        throw new AppError(400, `Not enough gold (need ${totalPrice})`);
      }

      const character = await prisma.character.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });

      let appliedItem: string | null = null;

      await prisma.$transaction(async (tx) => {
        if (currency === "sf_coins") {
          await tx.user.update({
            where: { id: user.id },
            data: { sfCoins: { decrement: totalPrice } },
          });
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: { gold: { decrement: totalPrice } },
          });
        }
        if (shopOffer.enchantmentId) {
          await tx.userEnchantment.upsert({
            where: { userId_enchantmentId: { userId: user.id, enchantmentId: shopOffer.enchantmentId } },
            create: { userId: user.id, enchantmentId: shopOffer.enchantmentId, quantity: qty },
            update: { quantity: { increment: qty } },
          });
          // Compra com "encantar agora": aplica direto no item escolhido (consome o encantamento)
          if (inventoryId) {
            const enchant = shopOffer.enchantment!;
            const inv = await tx.inventory.findUnique({
              where: { id: String(inventoryId) },
              include: { item: true },
            });
            if (!inv || inv.userId !== user.id) throw new AppError(404, "Item not found in inventory");
            if (!ENCHANTABLE_SLOTS.includes(inv.item.type as any)) {
              throw new AppError(400, "Este item não aceita encantamentos");
            }
            if ((user.level ?? 0) < enchant.level) {
              throw new AppError(400, `Encantamento nível ${enchant.level} exige jogador de nível ${enchant.level} ou superior`);
            }
            const compatible = parseSlots(enchant.compatibleSlots);
            if (compatible.length > 0 && !compatible.includes(inv.item.type)) {
              throw new AppError(400, "Encantamento incompatível com este item");
            }
            const oldEnchantmentId = inv.item.enchantmentId;
            if (oldEnchantmentId && oldEnchantmentId !== enchant.id) {
              await tx.userEnchantment.upsert({
                where: { userId_enchantmentId: { userId: user.id, enchantmentId: oldEnchantmentId } },
                create: { userId: user.id, enchantmentId: oldEnchantmentId, quantity: 1 },
                update: { quantity: { increment: 1 } },
              });
            }
            await tx.userEnchantment.update({
              where: { userId_enchantmentId: { userId: user.id, enchantmentId: enchant.id } },
              data: { quantity: { decrement: 1 } },
            });
            await tx.item.update({
              where: { id: inv.itemId },
              data: { enchantmentId: enchant.id },
            });
            appliedItem = inv.item.name;
          }
        } else if (classId) {
          if (!character) throw new AppError(404, "Character not found");
          const classIdToBuy = shopOffer.classId;
          if (!classIdToBuy) throw new AppError(400, "Esta oferta não é uma classe.");
          // Desbloqueia a classe e já equipa no personagem (troca gratuita depois)
          await tx.characterClass.upsert({
            where: { characterId_classId: { characterId: character.id, classId: classIdToBuy } },
            update: { isActive: true },
            create: { characterId: character.id, classId: classIdToBuy, isActive: true },
          });
          await tx.characterClass.updateMany({
            where: { characterId: character.id, classId: { not: classIdToBuy }, isActive: true },
            data: { isActive: false },
          });
          await tx.character.update({
            where: { id: character.id },
            data: { classId: classIdToBuy },
          });
        } else if (shopOffer.itemId) {
          const existing = await tx.inventory.findFirst({
            where: { userId: user.id, itemId: shopOffer.itemId, slotIndex: null },
          });
          if (existing) {
            await tx.inventory.update({
              where: { id: existing.id },
              data: { quantity: { increment: qty } },
            });
          } else {
            await tx.inventory.create({
              data: { userId: user.id, itemId: shopOffer.itemId, quantity: qty },
            });
          }
        }
      });

      res.json({
        item: shopOffer.class?.name ?? shopOffer.enchantment?.name ?? shopOffer.item?.name ?? "Compra",
        quantity: qty,
        totalPrice,
        currency,
        isClass: !!shopOffer.classId,
        appliedTo: appliedItem,
        [currency === "sf_coins" ? "sfCoinsLeft" : "goldLeft"]: Math.max(0, Number(currency === "sf_coins" ? user.sfCoins : user.gold) - totalPrice),
      });
    } catch (err) {
      next(err);
    }
  });
}
