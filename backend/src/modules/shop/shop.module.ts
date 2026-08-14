import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { isVipActive, assertPurchaseRequirements } from "../../core/progression";
import { withEnchantmentStats } from "../../core/enchantments/enchantmentStats";

const DAY_MS = 24 * 60 * 60 * 1000;

const enrichProducts = (products: any[]): any[] =>
  products.map((p) => (p.enchantment ? { ...p, enchantment: withEnchantmentStats(p.enchantment) } : p));

async function getShopConfig(): Promise<{ mockPayments: boolean }> {
  const row = await prisma.systemConfig.findUnique({ where: { key: "shop" } });
  const value = (row?.value as any) ?? {};
  return { mockPayments: value.mockPayments !== false };
}

// Aplica o efeito do produto no usuário (dentro de transação).
async function applyProduct(
  tx: any,
  userId: string,
  product: any
): Promise<{ amount: number; message: string }> {
  if (product.type === "sf_coins_pack") {
    await tx.user.update({
      where: { id: userId },
      data: { sfCoins: { increment: product.sfCoinAmount } },
    });
    return { amount: product.sfCoinAmount, message: `+${product.sfCoinAmount} SF Coins` };
  }

  if (product.type === "vip") {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { vipUntil: true } });
    const base = isVipActive(user) ? user.vipUntil.getTime() : Date.now();
    const until = new Date(base + product.vipDays * DAY_MS);
    await tx.user.update({
      where: { id: userId },
      data: { vipUntil: until, vipOwned: true },
    });
    return { amount: product.vipDays, message: `${product.vipDays} dias de VIP` };
  }

  if (product.type === "pass_premium") {
    const now = new Date();
    const season = await tx.season.findFirst({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    });
    if (!season) throw new AppError(400, "Nenhuma temporada ativa no momento");
    await tx.seasonPass.upsert({
      where: { seasonId_userId: { seasonId: season.id, userId } },
      update: { isPremium: true },
      create: { seasonId: season.id, userId, isPremium: true },
    });
    return { amount: 1, message: "Passe Premium da temporada ativa" };
  }

  if (product.type === "enchantment") {
    if (!product.enchantmentId) throw new AppError(400, "Produto sem encantamento vinculado");
    await tx.userEnchantment.upsert({
      where: { userId_enchantmentId: { userId, enchantmentId: product.enchantmentId } },
      create: { userId, enchantmentId: product.enchantmentId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    return { amount: 1, message: "Encantamento adquirido" };
  }

  if (product.type === "item") {
    if (!product.itemId) throw new AppError(400, "Produto sem item vinculado");
    const qty = Math.max(1, product.quantity || 1);
    const existing = await tx.inventory.findFirst({
      where: { userId, itemId: product.itemId, slotIndex: null },
    });
    if (existing) {
      await tx.inventory.update({
        where: { id: existing.id },
        data: { quantity: { increment: qty } },
      });
    } else {
      await tx.inventory.create({
        data: { userId, itemId: product.itemId, quantity: qty },
      });
    }
    return { amount: qty, message: `${qty}x item adicionado ao inventário` };
  }

  if (product.type === "class") {
    if (!product.classId) throw new AppError(400, "Produto sem classe vinculada");
    const characters = await tx.character.findMany({ where: { userId } });
    for (const character of characters) {
      await tx.characterClass.upsert({
        where: { characterId_classId: { characterId: character.id, classId: product.classId } },
        update: {},
        create: { characterId: character.id, classId: product.classId },
      });
    }
    return { amount: characters.length, message: "Classe desbloqueada" };
  }

  throw new AppError(400, "Produto inválido");
}

export function createShopModule(app: Express): void {
  // Catálogo público da loja
  app.get("/api/shop", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await prisma.shopProduct.findMany({
        where: { isActive: true },
        include: {
          enchantment: true,
          item: { include: { craftRecipes: { where: { isActive: true } } } },
          gameClass: true,
        },
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
      });
      res.json(enrichProducts(products));
    } catch (err) {
      next(err);
    }
  });

  // Compra: custo em SF Coins / PVP Coins (deduz na hora) ou em dinheiro (mock até integrar gateway).
  app.post("/api/shop/purchase/:productId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await prisma.shopProduct.findUnique({
        where: { id: req.params.productId },
        include: { item: true, enchantment: true, gameClass: true },
      });
      if (!product || !product.isActive) throw new AppError(404, "Produto não encontrado");

      // Estoque: stock < 0 = infinito; senão exige unidades restantes (1 por compra, ou a quantidade p/ type=item)
      const qty = product.type === "item" ? Math.max(1, product.quantity || 1) : 1;
      const remaining = Number(product.stock ?? -1) < 0 ? Infinity : Number(product.stock) - Number(product.sold ?? 0);
      if (qty > remaining) {
        throw new AppError(400, remaining <= 0 ? "Produto esgotado — volte mais tarde." : `Estoque insuficiente — restam ${remaining} unidade(s).`);
      }

      // Requisitos de compra: VIP, quests concluídas e nível do personagem ativo
      const requiresVip =
        product.requiredVip ||
        product.item?.requiredVip ||
        product.enchantment?.requiredVip ||
        product.gameClass?.requiredVip;
      await assertPurchaseRequirements(req.user!.userId, {
        requiredLevel: Number(product.requiredLevel) || 0,
        requiredVip: !!requiresVip,
        requiredQuestIds: product.requiredQuestIds,
      });

      if (product.currency === "sf_coins") {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { sfCoins: true },
        });
        if (!user || user.sfCoins < product.price) {
          throw new AppError(400, `Saldo insuficiente — custa ${product.price} SF Coins`);
        }
        await prisma.$transaction(async (tx) => {
          const ok = await tx.$executeRawUnsafe(
            `UPDATE "ShopProduct" SET "sold" = "sold" + ${qty} WHERE "id" = '${product.id}' AND ("stock" < 0 OR "sold" + ${qty} <= "stock")`
          );
          if (ok === 0) throw new AppError(400, "Produto esgotado — volte mais tarde.");
          await tx.user.update({
            where: { id: req.user!.userId },
            data: { sfCoins: { decrement: product.price } },
          });
          await applyProduct(tx, req.user!.userId, product);
          await tx.shopOrder.create({
            data: {
              userId: req.user!.userId,
              productId: product.id,
              type: product.type,
              amount: product.type === "vip" ? product.vipDays : product.type === "sf_coins_pack" ? product.sfCoinAmount : product.type === "item" ? Math.max(1, product.quantity || 1) : 1,
              price: product.price,
              currency: "sf_coins",
              status: "paid",
            },
          });
        });
        res.json({ message: "Compra realizada!", detail: product.name });
        return;
      }

      if (product.currency === "pvp_coins") {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { pvpCoins: true },
        });
        if (!user || user.pvpCoins < product.price) {
          throw new AppError(400, `Saldo insuficiente — custa ${product.price} PVP Coins`);
        }
        await prisma.$transaction(async (tx) => {
          const ok = await tx.$executeRawUnsafe(
            `UPDATE "ShopProduct" SET "sold" = "sold" + ${qty} WHERE "id" = '${product.id}' AND ("stock" < 0 OR "sold" + ${qty} <= "stock")`
          );
          if (ok === 0) throw new AppError(400, "Produto esgotado — volte mais tarde.");
          await tx.user.update({
            where: { id: req.user!.userId },
            data: { pvpCoins: { decrement: product.price } },
          });
          await applyProduct(tx, req.user!.userId, product);
          await tx.shopOrder.create({
            data: {
              userId: req.user!.userId,
              productId: product.id,
              type: product.type,
              amount: product.type === "item" ? Math.max(1, product.quantity || 1) : 1,
              price: product.price,
              currency: "pvp_coins",
              status: "paid",
            },
          });
        });
        res.json({ message: "Compra realizada!", detail: product.name });
        return;
      }

      if (product.currency === "gold") {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { gold: true },
        });
        if (!user || Number(user.gold) < product.price) {
          throw new AppError(400, `Ouro insuficiente — custa ${product.price} de ouro`);
        }
        await prisma.$transaction(async (tx) => {
          const ok = await tx.$executeRawUnsafe(
            `UPDATE "ShopProduct" SET "sold" = "sold" + ${qty} WHERE "id" = '${product.id}' AND ("stock" < 0 OR "sold" + ${qty} <= "stock")`
          );
          if (ok === 0) throw new AppError(400, "Produto esgotado — volte mais tarde.");
          await tx.user.update({
            where: { id: req.user!.userId },
            data: { gold: { decrement: product.price } },
          });
          await applyProduct(tx, req.user!.userId, product);
          await tx.shopOrder.create({
            data: {
              userId: req.user!.userId,
              productId: product.id,
              type: product.type,
              amount: product.type === "item" ? Math.max(1, product.quantity || 1) : 1,
              price: product.price,
              currency: "gold",
              status: "paid",
            },
          });
        });
        res.json({ message: "Compra realizada!", detail: product.name });
        return;
      }

      // Produtos em dinheiro real (SF Coins packs, VIP, premium): checkout simulado.
      const config = await getShopConfig();
      if (!config.mockPayments) {
        throw new AppError(400, "Pagamentos ainda não configurados — tente de novo mais tarde");
      }
      await prisma.$transaction(async (tx) => {
        const ok = await tx.$executeRawUnsafe(
          `UPDATE "ShopProduct" SET "sold" = "sold" + ${qty} WHERE "id" = '${product.id}' AND ("stock" < 0 OR "sold" + ${qty} <= "stock")`
        );
        if (ok === 0) throw new AppError(400, "Produto esgotado — volte mais tarde.");
        await applyProduct(tx, req.user!.userId, product);
        await tx.shopOrder.create({
          data: {
            userId: req.user!.userId,
            productId: product.id,
            type: product.type,
            amount: product.type === "vip" ? product.vipDays : product.type === "sf_coins_pack" ? product.sfCoinAmount : product.type === "item" ? Math.max(1, product.quantity || 1) : 1,
            price: product.price,
            currency: "money",
            status: "paid",
          },
        });
      });
      res.json({
        message: "Compra simulada realizada!",
        detail: product.name,
        note: "Checkout simulado — integre o gateway de pagamento quando for monetizar.",
      });
    } catch (err) {
      next(err);
    }
  });

  // Histórico do jogador
  app.get("/api/shop/orders", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await prisma.shopOrder.findMany({
        where: { userId: req.user!.userId },
        include: { product: { include: { enchantment: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json(
        orders.map((o) => ({
          ...o,
          product: o.product?.enchantment ? { ...o.product, enchantment: withEnchantmentStats(o.product.enchantment) } : o.product,
        }))
      );
    } catch (err) {
      next(err);
    }
  });
}
