import { PrismaClient } from "@prisma/client";
import { AppError } from "../../core/middleware/errorHandler";

// Raid com ondas:
// - Onda 1 começa com 2 monstros e vai aumentando até a onda final.
// - Onda final = horda máxima de monstros e, em seguida, o boss.
// Cada onda é representada como um "monstro agregado" (N× HP do monstro base),
// com id sintético no formato raid:{mapId}:{stage}. O estágio 10 é o boss.
export const RAID_MONSTER_PREFIX = "raid:";

export interface RaidStageInfo {
  mapId: string;
  stage: number; // 0..totalStages-1
}

export interface RaidStageShape {
  wave: number; // 1..N (exibição)
  count: number; // quantos monstros na onda
  isBoss: boolean;
}

export class RaidService {
  constructor(private prisma: PrismaClient) {}

  isRaidMonsterId(monsterId: string): boolean {
    return typeof monsterId === "string" && monsterId.startsWith(RAID_MONSTER_PREFIX);
  }

  parseMonsterId(monsterId: string): RaidStageInfo | null {
    if (!this.isRaidMonsterId(monsterId)) return null;
    const rest = monsterId.slice(RAID_MONSTER_PREFIX.length);
    const idx = rest.lastIndexOf(":");
    if (idx <= 0) return null;
    const mapId = rest.slice(0, idx);
    const stage = parseInt(rest.slice(idx + 1), 10);
    if (!mapId || isNaN(stage) || stage < 0) return null;
    return { mapId, stage };
  }

  monsterIdFor(mapId: string, stage: number): string {
    return `${RAID_MONSTER_PREFIX}${mapId}:${stage}`;
  }

  totalStages(waves: number): number {
    return waves + 1; // N ondas de horda + 1 estágio de boss
  }

  stageShape(stage: number, waves: number): RaidStageShape {
    if (stage >= waves) return { wave: waves, isBoss: true, count: 1 };
    if (stage === waves - 1) return { wave: waves, isBoss: false, count: waves }; // onda final: horda máxima
    const wave = stage + 1;
    return { wave, isBoss: false, count: wave + 1 };
  }

  // Resolve um monsterId (real do banco ou sintético de raid) para o mapa raid.
  async resolveRaidFromMonster(monsterId: string): Promise<{ mapId: string; stage: number } | null> {
    const parsed = this.parseMonsterId(monsterId);
    if (parsed) return parsed;
    const link = await this.prisma.mapMonster.findFirst({
      where: { monsterId, map: { type: "raid", isActive: true } },
      include: { map: true },
    });
    if (!link) return null;
    return { mapId: link.map.id, stage: 0 };
  }

  async loadMap(mapId: string): Promise<any> {
    const map = await this.prisma.map.findUnique({
      where: { id: mapId },
      include: {
        monsters: {
          where: { monster: { isActive: true } },
          include: { monster: true },
          orderBy: { spawnRate: "desc" },
        },
      },
    });
    if (!map) throw new AppError(404, "Mapa de raid não encontrado");
    return map;
  }

  async buildMonster(mapId: string, stage: number): Promise<any> {
    const map = await this.loadMap(mapId);
    return this.buildStageMonster(map, stage);
  }

  // Monta o "monstro agregado" do estágio com escala por onda + dificuldade do mapa.
  private buildStageMonster(map: any, stage: number): any {
    const waves = map.raidWaves || 10;
    const difficulty = map.raidDifficulty || 2;
    const shape = this.stageShape(stage, waves);

    const monsters: any[] = (map.monsters || []).map((mm: any) => mm.monster);
    const pool = monsters.filter((m: any) => !m.isBoss);
    const boss = monsters.find((m: any) => m.isBoss) || monsters[monsters.length - 1] || null;
    const base = shape.isBoss ? boss : pool.length > 0 ? pool[stage % pool.length] : monsters[0] || null;
    if (!base) throw new AppError(400, "Este raid não tem monstros configurados.");

    const hpScale = difficulty * (1 + (shape.wave - 1) * 0.45) * (shape.isBoss ? 2.2 : 1);
    const atkScale = difficulty * (0.9 + (shape.wave - 1) * 0.25) * (shape.isBoss ? 1.8 : 1);
    const level = base.level + (shape.isBoss ? Math.max(5, Math.round(waves * 1.5)) : shape.wave - 1);
    const multi = shape.isBoss ? 1 : shape.count;
    const hp = Math.max(1, Math.round(Number(base.hp || 50) * multi * hpScale));

    return {
      id: this.monsterIdFor(map.id, stage),
      name: shape.isBoss ? base.name : shape.count > 1 ? `${shape.count}x ${base.name}` : base.name,
      description: base.description || "",
      imageUrl: base.imageUrl,
      level,
      isBoss: shape.isBoss,
      isElite: shape.isBoss || base.isElite || shape.count >= 6,
      faction: base.faction,
      element: base.element,
      hp,
      mana: Math.max(1, Math.round(Number(base.mana || 20) * multi)),
      attack: Math.max(1, Math.round(Number(base.attack || 10) * atkScale)),
      defense: Math.max(0, Math.round(Number(base.defense || 5) * (shape.isBoss ? 1.5 : 1))),
      magic: Math.max(0, Math.round(Number(base.magic || 5) * atkScale)),
      magicDefense: Math.max(0, Math.round(Number(base.magicDefense || 5) * (shape.isBoss ? 1.5 : 1))),
      speed: base.speed || 10,
      criticalChance: base.criticalChance || 2,
      criticalDamage: base.criticalDamage || 150,
      dodge: base.dodge || 1,
      accuracy: base.accuracy || 90,
      attackSpeed: base.attackSpeed || 2000,
      skills: base.skills || "[]",
      xpReward: shape.isBoss ? Math.round(Number(base.xpReward || 100) * difficulty * 6) : 0,
      goldReward: shape.isBoss ? Math.round(Number(base.goldReward || 50) * difficulty * 6) : 0,
      raid: {
        mapId: map.id,
        mapName: map.name,
        stage,
        wave: shape.wave,
        totalWaves: waves,
        isBoss: shape.isBoss,
        monstersTotal: shape.count,
        perMonsterHp: Math.max(1, Math.round(hp / shape.count)),
      },
    };
  }

  // ===== Run ativa =====
  async findActiveRun(characterId: string): Promise<any | null> {
    return this.prisma.raidRun.findFirst({ where: { characterId, state: "active" } });
  }

  // Garante uma run ativa (sem consumir tentativa) — usado no resume de combate.
  async ensureRun(characterId: string, mapId: string, stage: number): Promise<any> {
    const existing = await this.findActiveRun(characterId);
    if (existing) return existing;
    return this.prisma.raidRun.create({
      data: { characterId, mapId, stage, state: "active" },
    });
  }

  async getRun(runId: string): Promise<any | null> {
    return this.prisma.raidRun.findUnique({ where: { id: runId } });
  }

  // Inicia uma run (ou retoma a existente). Consome 1 tentativa apenas quando
  // a run é nova — ondas intermediárias não consomem tentativas extras.
  async beginRun(characterId: string, mapId: string): Promise<{ run: any; newlyCreated: boolean }> {
    const existing = await this.findActiveRun(characterId);
    if (existing) return { run: existing, newlyCreated: false };

    const map = await this.loadMap(mapId);
    await this.consumeAttempt(characterId, map);

    const run = await this.prisma.raidRun.create({
      data: { characterId, mapId, stage: 0, state: "active" },
    });
    return { run, newlyCreated: true };
  }

  // Consome uma tentativa de raid (janela de reset). Lança erro quando esgotadas.
  private async consumeAttempt(characterId: string, map: any): Promise<void> {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new AppError(404, "Personagem não encontrado");

    const resetMs = (map.raidResetHours || 24) * 60 * 60 * 1000;
    const lastReset = character.lastRaidResetAt ? new Date(character.lastRaidResetAt).getTime() : 0;
    const elapsed = Date.now() - lastReset;
    const expired = elapsed > resetMs;
    const attemptsUsed = expired ? 0 : (character.raidAttempts ?? 0);
    const maxAttempts = map.maxRaidAttempts ?? 3;

    if (attemptsUsed >= maxAttempts) {
      const hoursLeft = Math.ceil((resetMs - elapsed) / (60 * 60 * 1000));
      throw new AppError(400, `Tentativas de raid esgotadas! Novas tentativas em ${hoursLeft}h.`);
    }

    await this.prisma.character.update({
      where: { id: characterId },
      data: {
        raidAttempts: attemptsUsed + 1,
        lastRaidResetAt: expired ? new Date() : character.lastRaidResetAt ?? new Date(),
      },
    });
  }

  // Avança para a próxima onda. Retorna done=true quando o boss caiu (raid vencida).
  async advanceRun(runId: string): Promise<{ run: any; done: boolean; nextStage: number | null; monster: any | null }> {
    const run = await this.prisma.raidRun.findUnique({ where: { id: runId } });
    if (!run || run.state !== "active") return { run, done: true, nextStage: null, monster: null };

    const map = await this.loadMap(run.mapId);
    const lastStage = this.totalStages(map.raidWaves || 10) - 1;
    const nextStage = run.stage + 1;
    if (nextStage > lastStage) {
      const updated = await this.prisma.raidRun.update({ where: { id: run.id }, data: { state: "won" } });
      return { run: updated, done: true, nextStage: null, monster: null };
    }

    const updated = await this.prisma.raidRun.update({ where: { id: run.id }, data: { stage: nextStage } });
    const monster = this.buildStageMonster(map, nextStage);
    return { run: updated, done: false, nextStage, monster };
  }

  async failRun(runId: string): Promise<void> {
    await this.prisma.raidRun.updateMany({
      where: { id: runId, state: "active" },
      data: { state: "lost" },
    });
  }

  async completeRun(runId: string): Promise<void> {
    await this.prisma.raidRun.updateMany({
      where: { id: runId, state: "active" },
      data: { state: "won" },
    });
  }
}
