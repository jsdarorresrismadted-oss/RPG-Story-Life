import { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../../core/database";
import { authenticate } from "../../core/middleware/auth";
import { AppError } from "../../core/middleware/errorHandler";
import { addItemsToInventory } from "../../core/progression";

export function createRedeemModule(app: Express): void {
  // Redeem a promo code: gold, SF Coins, xp and/or items
  app.post("/api/redeem", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawCode = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";
      if (!rawCode) throw new AppError(400, "Code required");

      const code = await prisma.redeemCode.findUnique({ where: { code: rawCode } });
      if (!code) throw new AppError(404, "Code not found");
      if (!code.isActive) throw new AppError(400, "Code is inactive");
      if (code.expiresAt && code.expiresAt < new Date()) {
        throw new AppError(400, "Code has expired");
      }
      if (code.uses >= code.maxUses) throw new AppError(400, "Code has reached its usage limit");

      const already = await prisma.redeemRedemption.findUnique({
        where: { codeId_userId: { codeId: code.id, userId: req.user!.userId } },
      });
      if (already) throw new AppError(409, "Code already redeemed by this account");

      const grantedItems: { name: string; quantity: number }[] = [];
      const warnings: string[] = [];
      const result = await prisma.$transaction(async (tx) => {
        await tx.redeemRedemption.create({
          data: { codeId: code.id, userId: req.user!.userId },
        });
        await tx.redeemCode.update({
          where: { id: code.id },
          data: { uses: { increment: 1 } },
        });

        await tx.user.update({
          where: { id: req.user!.userId },
          data: {
            gold: { increment: Number(code.gold) },
            sfCoins: { increment: code.sfCoins },
            experience: { increment: Number(code.experience) },
          },
        });

        const rawItems = Array.isArray(code.items) ? (code.items as any[]) : [];
        const grantedClasses: string[] = [];
        const character = await tx.character.findFirst({
          where: { userId: req.user!.userId },
        });

        for (const entry of rawItems) {
          const wantsClass =
            entry?.type === "class" ||
            entry?.className ||
            entry?.classSlug ||
            entry?.classId;

          if (wantsClass) {
            const name = String(entry?.className ?? entry?.itemName ?? "").trim();
            const slug = String(entry?.classSlug ?? "").trim();
            const id = String(entry?.classId ?? "").trim();
            let gameClass = null;
            if (id) gameClass = await tx.gameClass.findUnique({ where: { id } });
            if (!gameClass && slug) gameClass = await tx.gameClass.findFirst({ where: { slug } });
            if (!gameClass && name) gameClass = await tx.gameClass.findFirst({ where: { name } });
            if (!gameClass) {
              warnings.push(`Classe "${name || slug || id}" não encontrada`);
              continue;
            }
            if (character) {
              await tx.characterClass.upsert({
                where: {
                  characterId_classId: { characterId: character.id, classId: gameClass.id },
                },
                update: {},
                create: { characterId: character.id, classId: gameClass.id, isActive: false },
              });
              grantedClasses.push(gameClass.name);
            } else {
              warnings.push(`Crie um personagem para receber a classe "${gameClass.name}"`);
            }
            continue;
          }

          const name = typeof entry?.itemName === "string" ? entry.itemName : "";
          const quantity = Number(entry?.quantity) || 1;
          if (!name) continue;
          const granted = await addItemsToInventory(tx, req.user!.userId, [{ itemName: name, quantity }]);
          if (granted.granted.length > 0) {
            grantedItems.push(granted.granted[0]);
            continue;
          }

          const gameClass = await tx.gameClass.findFirst({ where: { name } });
          if (gameClass) {
            if (character) {
              await tx.characterClass.upsert({
                where: {
                  characterId_classId: { characterId: character.id, classId: gameClass.id },
                },
                update: {},
                create: { characterId: character.id, classId: gameClass.id, isActive: false },
              });
              grantedClasses.push(gameClass.name);
            } else {
              warnings.push(`Crie um personagem para receber a classe "${gameClass.name}"`);
            }
          }
        }

        return {
          gold: Number(code.gold),
          sfCoins: code.sfCoins,
          experience: Number(code.experience),
          classes: grantedClasses,
          warnings,
        };
      });

      res.json({ ...result, items: grantedItems });
    } catch (err) {
      next(err);
    }
  });
}
