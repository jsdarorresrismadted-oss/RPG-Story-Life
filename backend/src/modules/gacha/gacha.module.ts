import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import {
  BOOST_MAX_BY_RARITY,
  RARITY_LABELS,
  getGachaConfig,
  rollBooster,
  rollRarity,
  rollSlot,
} from "../../core/boosters";
import { EQUIP_SLOT_MAP } from "../../core/equipmentSlots";

const GACHA_TYPES = new Set(["gacha"]);

export function createGachaModule(app: Express): void {
  // Painel do gacha: config + tickets do jogador + catálogo + boosters obtidos
  app.get("/api/npcs/:id/gacha", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const npc = await prisma.npc.findUnique({ where: { id: req.params.id } });
      if (!npc) throw new AppError(404, "NPC not found");
      if (!GACHA_TYPES.has(npc.type)) throw new AppError(403, "Este NPC não é o Gacha.");

      const [config, user, catalog, owned] = await Promise.all([
        getGachaConfig(),
        prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, gachaTickets: true, gold: true } }),
        prisma.booster.findMany({ where: { isActive: true }, orderBy: [{ rarity: "asc" }, { boostType: "asc" }] }),
        prisma.userBooster.findMany({
          where: { userId: req.user!.userId },
          include: { booster: true },
          orderBy: { acquiredAt: "desc" },
        }),
      ]);
      if (!user) throw new AppError(404, "User not found");

      res.json({
        npc: { id: npc.id, name: npc.name, description: npc.description, type: npc.type },
        config: config ? { ...config, ticketCost: Number(config.ticketCost) } : null,
        tickets: user.gachaTickets,
        gold: Number(user.gold),
        catalog,
        owned: owned.map((ub) => ({ ...ub, booster: { ...ub.booster, boostValue: Math.min(ub.booster.boostValue, BOOST_MAX_BY_RARITY[ub.booster.rarity] ?? ub.booster.boostValue) } })),
        rarityLabels: RARITY_LABELS,
      });
    } catch (err) {
      next(err);
    }
  });

  // Rolar 1x: consome 1 ticket, sorteia raridade -> booster -> entrega
  app.post("/api/npcs/:id/gacha/roll", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const npc = await prisma.npc.findUnique({ where: { id: req.params.id }, select: { type: true } });
      if (!npc) throw new AppError(404, "NPC not found");
      if (!GACHA_TYPES.has(npc.type)) throw new AppError(403, "Este NPC não é o Gacha.");

      const config = await getGachaConfig();
      if (!config || !config.active) throw new AppError(400, "Gacha desativado no momento.");

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, gachaTickets: true },
      });
      if (!user) throw new AppError(404, "User not found");
      if (user.gachaTickets < 1) throw new AppError(400, "Você não tem tickets de gacha. Compre na Loja do Game.");

      const rarity = rollRarity(config.chances);
      const slot = rollSlot(config.slotChances);
      const booster = await rollBooster(rarity, slot);
      if (!booster) throw new AppError(404, `Nenhuma recompensa configurada para a raridade ${RARITY_LABELS[rarity] ?? rarity}.`);

      const boostValue = Math.min(booster.boostValue, BOOST_MAX_BY_RARITY[rarity] ?? booster.boostValue);

      // O anel/colar vai para o INVENTARIO do usuario como item equipavel
      // (slot ring/necklace). Se ja existe o item deste booster, empilha.
      let item = await prisma.item.findFirst({ where: { boosterId: booster.id } });
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { gachaTickets: { decrement: 1 } } });
        if (!item) {
          item = await tx.item.create({
            data: {
              name: booster.name,
              description: booster.description,
              icon: booster.icon,
              type: booster.type,
              rarity: booster.rarity,
              boostType: booster.boostType,
              boostValue,
              boosterId: booster.id,
            },
          });
        }
        const existing = await tx.inventory.findFirst({
          where: { userId: user.id, itemId: item.id, slotIndex: null },
        });
        let invRow = existing;
        if (existing) {
          await tx.inventory.update({ where: { id: existing.id }, data: { quantity: { increment: 1 } } });
        } else {
          invRow = await tx.inventory.create({ data: { userId: user.id, itemId: item.id, quantity: 1 } });
        }

        // Auto-equipa anel/colar se o slot estiver vazio (nao sobrescreve
        // item ja equipado no slot).
        const slotField = EQUIP_SLOT_MAP[booster.type];
        if (slotField) {
          const character = await tx.character.findFirst({ where: { userId: user.id } });
          if (character) {
            const equipment = await tx.equipment.findFirst({ where: { characterId: character.id } });
            const occupied = equipment ? (equipment as any)[slotField] : null;
            if (!occupied) {
              await tx.equipment.upsert({
                where: { characterId: character.id },
                create: { characterId: character.id, [slotField]: item.id },
                update: { [slotField]: item.id },
              });
              if (invRow) {
                await tx.inventory.update({ where: { id: invRow.id }, data: { isEquipped: true } });
              }
            }
          }
        }
      });

      const ticketsLeft = Math.max(0, user.gachaTickets - 1);
      res.json({
        rarity,
        rarityLabel: RARITY_LABELS[rarity] ?? rarity,
        booster: { ...booster, boostValue },
        ticketsLeft,
      });
    } catch (err) {
      next(err);
    }
  });

  // Meus boosters (todas as cópias do jogador)
  app.get("/api/gacha/my", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [owned, config] = await Promise.all([
        prisma.userBooster.findMany({
          where: { userId: req.user!.userId },
          include: { booster: true },
          orderBy: { acquiredAt: "desc" },
        }),
        getGachaConfig(),
      ]);
      res.json({
        owned: owned.map((ub) => ({ ...ub, booster: { ...ub.booster, boostValue: Math.min(ub.booster.boostValue, BOOST_MAX_BY_RARITY[ub.booster.rarity] ?? ub.booster.boostValue) } })),
        config: config ? { ...config, ticketCost: Number(config.ticketCost) } : null,
      });
    } catch (err) {
      next(err);
    }
  });

  // Equipar booster: máx. 1 anel + 1 colar equipados
  app.post("/api/gacha/boosters/:id/equip", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owned = await prisma.userBooster.findUnique({
        where: { id: req.params.id },
        include: { booster: true },
      });
      if (!owned || owned.userId !== req.user!.userId) throw new AppError(404, "Booster não encontrado");
      if (owned.quantity < 1) throw new AppError(400, "Você não possui este booster");

      await prisma.$transaction([
        prisma.userBooster.updateMany({
          where: { userId: req.user!.userId, equipped: true, booster: { type: owned.booster.type } },
          data: { equipped: false },
        }),
        prisma.userBooster.update({ where: { id: owned.id }, data: { equipped: true } }),
      ]);

      res.json({ message: "Booster equipado", id: owned.id, type: owned.booster.type });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/gacha/boosters/:id/unequip", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owned = await prisma.userBooster.findUnique({ where: { id: req.params.id }, select: { userId: true } });
      if (!owned || owned.userId !== req.user!.userId) throw new AppError(404, "Booster não encontrado");
      await prisma.userBooster.update({ where: { id: req.params.id }, data: { equipped: false } });
      res.json({ message: "Booster removido" });
    } catch (err) {
      next(err);
    }
  });
}
