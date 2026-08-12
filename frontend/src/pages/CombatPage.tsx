import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getSocket } from "../services/socket";
import { useGameStore } from "../store/gameStore";
import { useAuthStore } from "../store/authStore";
import { CombatUpdate, CombatFloatEvent, InventoryItem } from "../types";
import { authApi, charactersApi, inventoryApi, monstersApi } from "../services/api";
import { ArrowLeft, Sword, Shield, Zap, Skull, Heart, Sparkles, Coins, Lock, Star, DoorOpen, FlaskConical, HeartPulse, Droplets } from "lucide-react";
import toast from "react-hot-toast";
import { EntityIcon } from "../components/EntityIcon";
import { QuestTracker } from "../components/QuestTracker";

interface CombatPotion {
  inventoryId: string;
  itemName: string;
  quantity: number;
  heal: number;
  manaRestore: number;
  icon?: string | null;
}

interface Floater {
  id: number;
  target: "player" | "monster";
  text: string;
  kind: "normal" | "crit" | "dot" | "heal" | "hot" | "miss" | "dodge";
  dx: number;
  dy: number;
  enemyId?: string;
}

// Linhas do log que agora são representadas pelos números flutuantes (não duplicar).
const FLOATER_DUPLICATES = /causou \d+ de dano|dano crítico de \d+!|curou \d+ de vida|foi esquivado|esquivou do ataque|errou o ataque|errou!/i;

function stripFloaterDuplicates(msgs: string[]): string[] {
  return msgs.filter((m) => !FLOATER_DUPLICATES.test(m));
}

function logClass(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("crítico") || l.includes("critico")) return "text-yellow-300";
  if (l.includes("esquivou")) return "text-sky-300";
  if (l.includes("vitória") || l.includes("vitoria")) return "text-green-400 font-bold";
  if (l.includes("derrota") || l.includes("erro")) return "text-red-400";
  if (l.includes("curou") || l.includes("regenerou") || l.includes("restaurou") || l.includes("absorveu")) return "text-green-300";
  if (l.includes("dano") || l.includes("causou") || l.includes("refletiu") || l.includes("golpe") || l.includes("aniquilou") || l.includes("letal") || l.includes("atacou")) return "text-red-300";
  if (l.includes("expirou") || l.includes("fugiu") || l.includes("fugir") || l.includes("fuga")) return "text-gray-400";
  return "text-gray-300";
}

function itemEffects(item: any): { heal: number; manaRestore: number } {
  let heal = 0;
  let manaRestore = 0;
  if (!item?.effects) return { heal, manaRestore };
  try {
    const effects = JSON.parse(item.effects);
    if (Array.isArray(effects)) {
      for (const e of effects) {
        if (e?.type === "heal") heal += Number(e.value) || 0;
        else if (e?.type === "manaRestore") manaRestore += Number(e.value) || 0;
      }
    } else {
      heal = Number(effects.heal) || 0;
      manaRestore = Number(effects.manaRestore) || 0;
    }
  } catch {
    // ignore malformed effects
  }
  return { heal, manaRestore };
}

export function CombatPage() {
  const { monsterId } = useParams<{ monsterId: string }>();
  const navigate = useNavigate();
  const [originMapSlug] = useState(() => sessionStorage.getItem("combatOriginMapSlug") ?? "");
  const { selectedCharacter } = useGameStore();
  const setInCombat = useGameStore((s) => s.setInCombat);
  const { user, setUser } = useAuthStore();
  const [combat, setCombat] = useState<CombatUpdate | null>(null);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [monsterInfo, setMonsterInfo] = useState<{ name: string; level: number } | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [potions, setPotions] = useState<CombatPotion[]>([]);
  const [classRank, setClassRank] = useState(1);
  const rewardsRefreshed = useRef(false);
  const combatRef = useRef<CombatUpdate | null>(null);
  combatRef.current = combat;
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const floaterSeq = useRef(0);

  const pushFloater = (target: "player" | "monster", text: string, kind: Floater["kind"], enemyId?: string) => {
    const id = ++floaterSeq.current;
    const col = id % 7;
    const dx = (col - 3) * 26;
    const dy = (col % 3) * 12;
    setFloaters((prev) => [...prev.slice(-12), { id, target, text, kind, dx, dy, enemyId }]);
    window.setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 1100);
  };

  // Sistema central de feedback: eventos do servidor viram números flutuantes.
  const emitEvents = (events?: CombatFloatEvent[]) => {
    if (!events || events.length === 0) return;
    for (const ev of events) {
      if (ev.kind === "miss") pushFloater(ev.target, "MISS!", "miss", ev.entityId);
      else if (ev.kind === "dodge") pushFloater(ev.target, "DODGE!", "dodge", ev.entityId);
      else if (ev.kind === "heal" || ev.kind === "hot") pushFloater(ev.target, `+${ev.value}`, ev.kind, ev.entityId);
      else if (ev.value > 0) pushFloater(ev.target, `-${ev.value}`, ev.kind, ev.entityId);
    }
  };

  // Refresh user data (gold/XP) after a victory without needing F5
  const refreshUser = () => {
    if (rewardsRefreshed.current) return;
    rewardsRefreshed.current = true;
    authApi
      .me()
      .then(({ data }) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  };

  const socket = getSocket();

  const maxHp = combat?.maxHp ?? selectedCharacter?.maxHp ?? 100;
  const maxMana = combat?.maxMana ?? selectedCharacter?.maxMana ?? 50;
  const monsterMaxHp = combat?.monsterMaxHp ?? 100;

  const characterHpPercent = Math.min(100, ((combat?.characterHp ?? maxHp) / maxHp) * 100);
  const characterManaPercent = Math.min(100, ((combat?.characterMana ?? maxMana) / maxMana) * 100);
  const monsterHpPercent = Math.min(100, ((combat?.monsterHp ?? monsterMaxHp) / monsterMaxHp) * 100);

  const skills = useMemo(() => combat?.skills ?? [], [combat?.skills]);
  const autoSkill = skills.find((s) => s.trigger === "auto");
  const usableSkills = skills.filter((s) => s.trigger !== "auto");

  useEffect(() => {
    charactersApi.my().then(({ data }) => {
      const rank = data?.classProgress?.[0]?.rank;
      if (rank) setClassRank(rank);
    }).catch(() => {});
  }, []);

  const loadPotions = () => {
    inventoryApi.list().then(({ data }) => {
      const list: InventoryItem[] = Array.isArray(data) ? data : [];
      const usable = list
        .map((inv) => {
          const { heal, manaRestore } = itemEffects(inv.item);
          return { inventoryId: inv.id, itemName: inv.item.name, quantity: inv.quantity, heal, manaRestore, icon: inv.item.icon ?? null };
        })
        .filter((p) => p.heal > 0 || p.manaRestore > 0);
      setPotions(usable);
    }).catch(() => {});
  };

  useEffect(() => {
    loadPotions();
  }, []);

  useEffect(() => {
    const hasActiveCooldowns = Object.values(cooldowns).some((t) => Date.now() - t < 30000);
    if (!hasActiveCooldowns) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [cooldowns]);

  useEffect(() => {
    if (monsterId) {
      monstersApi.get(monsterId).then(({ data }) => setMonsterInfo({ name: data.name, level: data.level })).catch(() => {});
    }
  }, [monsterId]);

  useEffect(() => {
    if (!monsterId) return;
    let done = false;
    const ensure = () => {
      if (done) return;
      done = true;
      const s = getSocket();
      if (!s || !s.connected) return;
      // Retoma uma batalha salva (se existir). Sem auto-start: o combate só
      // começa quando o jogador clicar em "Iniciar combate".
      s.emit("combat:resume");
    };
    const interval = setInterval(() => {
      const s = getSocket();
      if (!s) return;
      if (s.connected) {
        clearInterval(interval);
        ensure();
        return;
      }
      s.once("connect", () => {
        clearInterval(interval);
        ensure();
      });
    }, 300);
    return () => clearInterval(interval);
  }, [monsterId]);

  useEffect(() => {
    if (!socket) return;

    socket.on("combat:started", (data: any) => {
      rewardsRefreshed.current = false;
      setInCombat(true);
      setCombat(data);
      setCombatLog([data.resumed ? "Combate retomado!" : `Combate contra ${data.monsterName || "o monstro"} iniciado!`]);
      setLoading(false);
    });

    socket.on("combat:skillUsed", (data: CombatUpdate) => {
      setCombat((prev) => (prev ? { ...prev, ...data } : data));
      if (data.events && data.events.length > 0) {
        emitEvents(data.events);
      } else {
        if (data.isMissed) pushFloater("monster", "MISS!", "miss");
        if (data.isDodged) pushFloater("monster", "DODGE!", "dodge");
        if ((data.damage ?? 0) > 0) pushFloater("monster", `-${data.damage}`, data.isCritical ? "crit" : "normal");
        if ((data.healed ?? 0) > 0) pushFloater("player", `+${data.healed}`, "heal");
      }
      if (data.state === "won") {
        setInCombat(false);
        toast.success("Vitória!");
        if (data.rewards?.drops && data.rewards.drops.length > 0) {
          toast(data.rewards.drops.map((d) => `${d.quantity}x ${d.name}`).join(" • "), {
            icon: "🎁",
            duration: 4000,
          });
        }
        refreshUser();
      } else if (data.state === "lost") {
        setInCombat(false);
        toast.error("Derrota!");
      }
      if (data.skillId) {
        setCooldowns((prev) => ({ ...prev, [data.skillId as string]: Date.now() }));
      }
      const log: string[] = [];
      if (data.appliedBuffs?.length) log.push(`Buff aplicado: ${data.appliedBuffs.join(", ")}`);
      if (data.messages && data.messages.length > 0) log.push(...stripFloaterDuplicates(data.messages));
      if (data.state === "won" && data.rewards) {
        const r = data.rewards;
        log.push(`Recompensas: +${r.xpGain ?? 0} XP • +${r.classXpGain ?? 0} CXP • +${r.goldGain ?? 0} gold${r.levelUps ? `, LEVEL UP x${r.levelUps}!` : ""}`);
        if (data.rewards.drops && data.rewards.drops.length > 0) {
          log.push(`Drops: ${data.rewards.drops.map((d) => `${d.quantity}x ${d.name}`).join(", ")}`);
        }
      }
      setCombatLog(prev => [...prev.slice(-19), ...log]);
    });

    socket.on("combat:tick", (data: CombatUpdate) => {
      const prev = combatRef.current;
      const waveChanged = prev?.raid?.wave !== undefined && data.raid?.wave !== undefined && prev.raid.wave !== data.raid.wave;
      if (prev && data.state === "active" && !waveChanged) {
        if (data.events && data.events.length > 0) {
          emitEvents(data.events);
        } else {
          if (typeof data.monsterHp === "number" && typeof prev.monsterHp === "number") {
            const delta = prev.monsterHp - data.monsterHp;
            if (delta > 0) pushFloater("monster", `-${delta}`, "normal");
            else if (delta < 0) pushFloater("monster", `+${-delta}`, "heal");
          }
          if (typeof data.characterHp === "number" && typeof prev.characterHp === "number") {
            const delta = prev.characterHp - data.characterHp;
            if (delta > 0) pushFloater("player", `-${delta}`, "normal");
            else if (delta < 0) pushFloater("player", `+${-delta}`, "heal");
          }
        }
      }
      setCombat((prev) => {
        if (!prev) return data as any;
        return { ...prev, ...data };
      });
      if (data.messages && data.messages.length > 0) {
        const msgs = stripFloaterDuplicates(data.messages);
        if (msgs.length > 0) setCombatLog(prev => [...prev.slice(-19), ...msgs]);
      }
      if (data.state === "won") {
        setInCombat(false);
        const r = data.rewards;
        let line = `Vitória! +${r?.xpGain ?? 0} XP • +${r?.classXpGain ?? 0} CXP • +${r?.goldGain ?? 0} gold${r?.levelUps ? `, LEVEL UP x${r.levelUps}!` : ""}`;
        if (r?.drops && r.drops.length > 0) line += ` • Drops: ${r.drops.map((d) => `${d.quantity}x ${d.name}`).join(", ")}`;
        setCombatLog(prev => [...prev.slice(-19), line]);
        refreshUser();
      } else if (data.state === "lost") {
        setInCombat(false);
        setLoading(false);
        toast.error("Derrota!");
        setCombatLog(prev => [...prev.slice(-19), "Você foi derrotado..."]);
      } else if (data.state === "error") {
        setInCombat(false);
        setLoading(false);
        toast.error("O combate travou — inicie novamente");
        setCombatLog(prev => [...prev.slice(-19), "O combate travou por um erro interno. Inicie novamente."]);
      }
    });

    socket.on("combat:error", (data: any) => {
      setCombatLog(prev => [...prev, `Erro: ${data.message}`]);
      toast.error(data.message || "Erro no combate");
      setLoading(false);
    });

    socket.on("combat:action", (data: any) => {
      setCombat((prev) => {
        if (!prev) return data as any;
        return { ...prev, ...data };
      });
      if (data.action === "flee") {
        if (data.fled) {
          setInCombat(false);
          toast.success("Você fugiu do combate!");
          setCombatLog(prev => [...prev.slice(-19), "Você conseguiu fugir!"]);
        } else {
          if (data.events && data.events.length > 0) {
            emitEvents(data.events);
          } else if ((data.damage ?? 0) > 0) {
            pushFloater("player", `-${data.damage}`, "normal");
          }
          toast.error("A fuga falhou!");
          setCombatLog(prev => [...prev.slice(-19), "A fuga falhou! O monstro atacou você."]);
        }
      } else if (data.action === "item") {
        const parts: string[] = [];
        if ((data.healed ?? 0) > 0) parts.push(`${data.healed} de vida`);
        if ((data.manaRestored ?? 0) > 0) parts.push(`${data.manaRestored} de mana`);
        if ((data.healed ?? 0) > 0) pushFloater("player", `+${data.healed}`, "heal");
        setCombatLog(prev => [...prev.slice(-19), `Você usou ${data.itemName || "poção"} (+${parts.join(", ")})`]);
        loadPotions();
      }
    });

    return () => {
      socket.off("combat:started");
      socket.off("combat:skillUsed");
      socket.off("combat:tick");
      socket.off("combat:error");
      socket.off("combat:action");
      // Nunca deixar o bloqueio de navegação preso: ao sair da página de
      // combate (back, URL manual, morte por tick etc) o estado é limpo.
      setInCombat(false);
    };
  }, [socket]);

  const startCombat = () => {
    const s = getSocket();
    if (!s || !monsterId) return;
    setLoading(true);
    setCombatLog([]);
    s.emit("combat:start", { monsterId });
  };

  const useSkill = (skillId: string) => {
    if (!socket || !combat) return;
    socket.emit("combat:useSkill", { combatId: combat.combatId, skillId });
  };

  const usePotion = (inventoryId: string) => {
    if (!socket || !combat) return;
    socket.emit("combat:useItem", { combatId: combat.combatId, inventoryId });
  };

  const flee = () => {
    if (!socket || !combat) return;
    socket.emit("combat:flee", { combatId: combat.combatId });
  };

  const isOnCooldown = (skillId: string, cooldown: number) => {
    const last = cooldowns[skillId];
    if (!last) return false;
    return now - last < cooldown;
  };

  const cooldownRemaining = (skillId: string, cooldown: number) => {
    const last = cooldowns[skillId];
    if (!last) return 0;
    return Math.max(0, cooldown - (now - last));
  };

  const monsterName = combat?.monsterName || monsterInfo?.name || "Monstro";
  const monsterLevel = combat?.monsterLevel || monsterInfo?.level || 1;
  const raid = combat?.raid ?? null;

  const playerHasBuff = (combat?.playerEffects ?? []).some((e) => e.kind === "buff" || e.kind === "hot" || e.kind === "shield");
  const monsterHasDebuff = (combat?.monsterEffects ?? []).some((e) => e.kind === "dot" || e.kind === "debuff");

  return (
    <div className="min-h-full flex flex-col pb-40 animate-fade-in">
      {combat && combat.state === "active" ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Sparkles size={14} className="text-red-400 animate-pulse" /> Em combate — você não pode sair agora
        </p>
      ) : (
        <Link to="/map" className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Voltar ao mapa
        </Link>
      )}

      {/* ===== BANNER DE RAID ===== */}
      {raid && (
        <div className="rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950/60 to-purple-950/60 p-4 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-red-300 flex items-center gap-2">
                <Skull size={16} /> RAID: {raid.mapName}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {raid.boss ? "Chefe final do raid — derrote-o para concluir!" : `Onda ${raid.wave} de ${raid.totalWaves}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: raid.totalWaves }).map((_, i) => (
                <span
                  key={i}
                  title={`Onda ${i + 1}`}
                  className={`w-5 h-2 rounded-full ${
                    i + 1 < raid.wave ? "bg-red-500/70" : i + 1 === raid.wave ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" : "bg-dark-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== TOPO: vida e mana ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Player */}
        <div className="panel p-5 relative">
          {floaters.filter((f) => f.target === "player").map((f) => (
            <span key={f.id} className={`combat-floater ${f.kind}`} style={{ left: `calc(50% + ${f.dx}px)`, top: `calc(38% + ${f.dy}px)` }}>{f.text}</span>
          ))}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center ${playerHasBuff ? "ring-2 ring-blue-400/70 shadow-[0_0_14px_rgba(96,165,250,0.45)]" : ""}`}>
              <Shield size={24} className="text-white" />
            </div>
            <div>
              <h2 className="font-display font-bold">{combat?.characterName || selectedCharacter?.name || user?.displayName || "Jogador"}</h2>
              <p className="text-xs text-gray-400">
                Nível {combat?.characterLevel || selectedCharacter?.level || user?.level || 1}
                {selectedCharacter?.class?.name && <> • {selectedCharacter.class.name}</>}
              </p>
            </div>
            <span className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <Star size={12} /> Rank {classRank}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-red-400">HP</span>
                <span className="font-mono">{Math.max(0, combat?.characterHp ?? maxHp)} / {maxHp}</span>
              </div>
              <div className="stat-bar">
                <div className="stat-bar-fill bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${characterHpPercent}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-blue-400">Mana</span>
                <span className="font-mono">{Math.max(0, combat?.characterMana ?? maxMana)} / {maxMana}</span>
              </div>
              <div className="stat-bar">
                <div className="stat-bar-fill bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${characterManaPercent}%` }} />
              </div>
            </div>
          </div>

          {combat?.playerEffects && combat.playerEffects.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {combat.playerEffects.map((e) => (
                <span key={e.slug} title={`${e.name}${e.stacks > 1 ? ` ×${e.stacks}` : ""} · ${e.remainingMs > 0 ? `${(e.remainingMs / 1000).toFixed(0)}s` : "permanente"}`} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  e.kind === "dot" || e.kind === "debuff" ? "bg-red-500/10 text-red-300 border-red-500/30" : e.kind === "hot" ? "bg-green-500/10 text-green-300 border-green-500/30" : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                }`}>
                  {e.name}{e.stacks > 1 ? ` ×${e.stacks}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Monster(s) */}
        <div className="panel p-5 relative">
          {combat?.enemies && combat.enemies.length > 1 ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
                  <Skull size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="font-display font-bold capitalize">{monsterName}</h2>
                  <p className="text-xs text-gray-400">Onda com {combat.enemies.length} inimigos</p>
                </div>
                {combat.state === "active" && (
                  <span className="ml-auto flex items-center gap-2 text-sm text-red-400">
                    <Sparkles size={14} className="animate-pulse" /> Em combate
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {combat.enemies.map((e) => {
                  const pct = Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100);
                  const dead = e.hp <= 0;
                  return (
                    <div key={e.id} className={`relative rounded-xl border p-3 ${dead ? "border-dark-700 bg-dark-800/40 opacity-60" : e.isBoss ? "border-red-500/50 bg-red-950/20" : "border-dark-600 bg-dark-800/60"}`}>
                      {floaters.filter((f) => f.target === "monster" && f.enemyId === e.id).map((f) => (
                        <span key={f.id} className={`combat-floater ${f.kind}`} style={{ left: `calc(50% + ${f.dx}px)`, top: `calc(30% + ${f.dy}px)` }}>{f.text}</span>
                      ))}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${e.isBoss ? "bg-gradient-to-br from-red-700 to-orange-600" : "bg-gradient-to-br from-red-600 to-orange-600"}`}>
                          <Skull size={18} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold capitalize truncate">{e.name}</h3>
                          <p className="text-[10px] text-gray-500">
                            Nv {e.level}{e.isBoss ? " • BOSS" : e.isElite ? " • Elite" : ""}
                          </p>
                        </div>
                      </div>
                      {dead ? (
                        <p className="text-[11px] text-green-400 font-bold text-center py-2">Derrotado</p>
                      ) : (
                        <>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-red-400">HP</span>
                            <span className="font-mono">{Math.max(0, Math.round(e.hp))} / {Math.round(e.maxHp)}</span>
                          </div>
                          <div className="stat-bar">
                            <div className="stat-bar-fill bg-gradient-to-r from-red-500 to-orange-500" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      )}
                      {e.effects && e.effects.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {e.effects.map((fx) => (
                            <span key={fx.slug} title={`${fx.name}${fx.stacks > 1 ? ` ×${fx.stacks}` : ""} · ${fx.remainingMs > 0 ? `${(fx.remainingMs / 1000).toFixed(0)}s` : "permanente"}`} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                              fx.kind === "dot" || fx.kind === "debuff" ? "bg-red-500/10 text-red-300 border-red-500/30" : "bg-orange-500/10 text-orange-300 border-orange-500/30"
                            }`}>
                              {fx.name}{fx.stacks > 1 ? ` ×${fx.stacks}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {combat.state === "won" && (
                <div className="mt-4 text-center py-3 space-y-2">
                  <p className="text-green-400 font-bold text-lg">
                    {combat.raid?.cleared ? "RAID CONCLUÍDO!" : "Vitória!"}
                  </p>
                  {combat.raid?.cleared && (
                    <p className="text-xs text-red-300">Você derrotou todas as ondas e o chefe final do raid.</p>
                  )}
                  {combat.rewards && (
                    <p className="text-sm text-gray-300 flex items-center justify-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Sparkles size={14} className="text-purple-400" /> +{combat.rewards.xpGain ?? 0} XP</span>
                      <span className="flex items-center gap-1"><Star size={14} className="text-amber-400" /> +{combat.rewards.classXpGain ?? 0} CXP</span>
                      <span className="flex items-center gap-1"><Coins size={14} className="text-yellow-400" /> +{combat.rewards.goldGain ?? 0} gold</span>
                    </p>
                  )}
                  {combat.rewards?.drops && combat.rewards.drops.length > 0 && (
                    <p className="text-xs text-emerald-300">
                      Drops: {combat.rewards.drops.map((d) => `${d.quantity}x ${d.name}`).join(", ")}
                    </p>
                  )}
                  <button onClick={startCombat} disabled={loading} className="btn-primary mt-1">{loading ? "Iniciando..." : "Voltar ao combate"}</button>
                </div>
              )}

              {combat.state === "lost" && (
                <div className="mt-4 text-center py-3">
                  <p className="text-red-400 font-bold text-lg">Derrota</p>
                  <button onClick={startCombat} className="btn-primary mt-2">Tentar novamente</button>
                </div>
              )}
            </>
          ) : (
            <>
          {floaters.filter((f) => f.target === "monster" && !f.enemyId).map((f) => (
            <span key={f.id} className={`combat-floater ${f.kind}`} style={{ left: `calc(50% + ${f.dx}px)`, top: `calc(38% + ${f.dy}px)` }}>{f.text}</span>
          ))}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center ${monsterHasDebuff ? "ring-2 ring-red-500/70 shadow-[0_0_14px_rgba(239,68,68,0.45)]" : ""}`}>
              <Skull size={24} className="text-white" />
            </div>
            <div>
              <h2 className="font-display font-bold capitalize">{monsterName}</h2>
              <p className="text-xs text-gray-400">Nível {monsterLevel} • {combat?.raid?.boss ? "BOSS" : combat?.raid ? "Monstro" : "Monstro"}</p>
            </div>
            {combat && combat.state === "active" && (
              <span className="ml-auto flex items-center gap-2 text-sm text-red-400">
                <Sparkles size={14} className="animate-pulse" /> Em combate
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-red-400">HP</span>
                <span className="font-mono">{Math.max(0, combat?.monsterHp ?? monsterMaxHp)} / {monsterMaxHp}</span>
              </div>
              <div className="stat-bar">
                <div className="stat-bar-fill bg-gradient-to-r from-red-500 to-orange-500" style={{ width: `${monsterHpPercent}%` }} />
              </div>
            </div>
          </div>

          {combat?.monsterEffects && combat.monsterEffects.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {combat.monsterEffects.map((e) => (
                <span key={e.slug} title={`${e.name}${e.stacks > 1 ? ` ×${e.stacks}` : ""} · ${e.remainingMs > 0 ? `${(e.remainingMs / 1000).toFixed(0)}s` : "permanente"}`} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  e.kind === "dot" || e.kind === "debuff" ? "bg-red-500/10 text-red-300 border-red-500/30" : "bg-orange-500/10 text-orange-300 border-orange-500/30"
                }`}>
                  {e.name}{e.stacks > 1 ? ` ×${e.stacks}` : ""}
                </span>
              ))}
            </div>
          )}

          {combat && combat.state === "won" && (
            <div className="mt-4 text-center py-3 space-y-2">
              <p className="text-green-400 font-bold text-lg">
                {combat.raid?.cleared ? "RAID CONCLUÍDO!" : combat.raid ? `Onda ${combat.raid.wave} vencida!` : "Vitória!"}
              </p>
              {combat.raid?.cleared && (
                <p className="text-xs text-red-300">Você derrotou todas as ondas e o chefe final do raid.</p>
              )}
              {combat.rewards && (
                <p className="text-sm text-gray-300 flex items-center justify-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Sparkles size={14} className="text-purple-400" /> +{combat.rewards.xpGain ?? 0} XP</span>
                  <span className="flex items-center gap-1"><Star size={14} className="text-amber-400" /> +{combat.rewards.classXpGain ?? 0} CXP</span>
                  <span className="flex items-center gap-1"><Coins size={14} className="text-yellow-400" /> +{combat.rewards.goldGain ?? 0} gold</span>
                </p>
              )}
              {combat.rewards?.drops && combat.rewards.drops.length > 0 && (
                <p className="text-xs text-emerald-300">
                  Drops: {combat.rewards.drops.map((d) => `${d.quantity}x ${d.name}`).join(", ")}
                </p>
              )}
              <button onClick={startCombat} disabled={loading} className="btn-primary mt-1">{loading ? "Iniciando..." : "Voltar ao combate"}</button>
            </div>
          )}

          {combat && combat.state === "lost" && (
            <div className="mt-4 text-center py-3">
              <p className="text-red-400 font-bold text-lg">Derrota</p>
              <button onClick={startCombat} className="btn-primary mt-2">Tentar novamente</button>
            </div>
          )}

          {combat && combat.state === "fled" && (
            <div className="mt-4 text-center py-3">
              <p className="text-amber-400 font-bold text-lg">Você fugiu do combate</p>
              <p className="text-xs text-gray-500 mt-1">Você não recebeu recompensas desta luta.</p>
              <button onClick={startCombat} disabled={loading} className="btn-primary mt-3">{loading ? "Iniciando..." : "Voltar ao combate"}</button>
            </div>
          )}

          {!combat && (
            <button onClick={startCombat} disabled={loading} className="btn-primary w-full mt-4 py-3">
              {loading ? "Engajando..." : "Iniciar combate"}
            </button>
          )}
            </>
          )}
        </div>
      </div>

      {/* ===== MEIO: log ===== */}
      <div className="panel p-4 mt-6">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Log de Combate</p>
        <div className="space-y-1 max-h-48 overflow-y-auto min-h-[4rem]">
          {combatLog.length === 0 && (
            <p className="text-sm text-gray-600">O combate ainda não começou. Clique em "Iniciar combate" para usar suas habilidades.</p>
          )}
          {combatLog.map((log, i) => (
            <p key={i} className={`text-sm font-mono ${logClass(log)}`}>{log}</p>
          ))}
        </div>
      </div>

      {/* ===== QUESTS EM ANDAMENTO (só aparece com quest ativa) ===== */}
      <QuestTracker />

      {/* ===== BAIXO: barra de skills (fixa) ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-md border-t border-dark-700 px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">
            Skill Bar {combat ? "" : "· inicie o combate para usar"}
          </p>
          {!combat ? (
            <p className="text-center text-sm text-gray-500">Clique em "Iniciar combate" para liberar suas habilidades.</p>
          ) : (
            <div>
              <div className="flex items-stretch justify-center gap-1.5 flex-wrap">
              {/* Auto attack */}
              <div className="w-28 card-hover py-2 text-center opacity-80" title={autoSkill?.description ?? "Ataque automático"}>
                <EntityIcon src={autoSkill?.icon} size={18} className="mx-auto mb-1 text-purple-400" imgClassName="w-6 h-6 mx-auto mb-1 object-contain" />
                <span className="text-[10px] block truncate px-0.5">{autoSkill?.name || "Auto"}</span>
                <span className="text-[8px] text-gray-500 block">Sempre ativo</span>
              </div>

              {usableSkills.map((skill) => {
                const locked = (skill.rankRequired ?? 1) > classRank;
                const cd = isOnCooldown(skill.id, skill.cooldown);
                const cdLeft = cooldownRemaining(skill.id, skill.cooldown);
                const noMana = (combat.characterMana ?? 0) < skill.manaCost;
                const disabled = locked || cd || noMana || combat.state !== "active";
                return (
                  <button
                    key={skill.id}
                    onClick={() => useSkill(skill.id)}
                    disabled={disabled}
                    className={`w-28 card-hover py-2 text-center relative ${
                      disabled ? "opacity-40 cursor-not-allowed" : ""
                    } ${skill.trigger === "ultimate" ? "border-yellow-500/40" : ""}`}
                    title={locked ? `Requer Rank ${skill.rankRequired}` : skill.description}
                  >
                    {cd && (
                      <span className="absolute inset-0 bg-black/70 rounded-xl flex items-center justify-center">
                        <span className="text-base font-bold text-white font-mono">
                          {(cdLeft / 1000).toFixed(1)}s
                        </span>
                        <span className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-b-xl overflow-hidden">
                          <span
                            className="block h-full bg-purple-400/80"
                            style={{ width: `${Math.min(100, Math.max(0, ((skill.cooldown - cdLeft) / skill.cooldown) * 100))}%` }}
                          />
                        </span>
                      </span>
                    )}
                    {locked ? (
                      <Lock size={18} className="mx-auto mb-1 text-gray-500" />
                    ) : skill.icon ? (
                      <div className="relative mx-auto mb-1 w-6 h-6">
                        <EntityIcon src={skill.icon} size={22} className="mx-auto" imgClassName="w-full h-full object-contain" />
                        {skill.iconSecondary && (
                          <EntityIcon src={skill.iconSecondary} size={22} className="absolute inset-0" imgClassName="absolute inset-0 w-full h-full object-contain translate-x-1 translate-y-1" />
                        )}
                      </div>
                    ) : skill.trigger === "ultimate" ? (
                      <Zap size={18} className="mx-auto mb-1 text-yellow-400" />
                    ) : skill.kind === "heal" ? (
                      <Heart size={18} className="mx-auto mb-1 text-green-400" />
                    ) : (
                      <Sword size={18} className="mx-auto mb-1 text-purple-400" />
                    )}
                    <span className="text-[10px] block truncate px-0.5">{skill.name}</span>
                    <span className="text-[8px] text-gray-500 block">
                      {locked
                        ? `Rank ${skill.rankRequired}+`
                        : `${skill.manaCost} mana${cd ? " · CD" : ""}`}
                    </span>
                  </button>
                );
              })}

              {/* Poção de cura */}
              {(() => {
                const healPotions = potions.filter((p) => p.heal > 0);
                if (healPotions.length === 0) return null;
                const p = healPotions[0];
                const disabled = p.quantity < 1 || combat.state !== "active";
                return (
                  <button
                    onClick={() => {
                      const needsHp = (combat.characterHp ?? 0) < (combat.maxHp ?? 0);
                      if (!needsHp) {
                        toast("Vida já está cheia.");
                        return;
                      }
                      usePotion(p.inventoryId);
                    }}
                    disabled={disabled}
                    className={`w-28 card-hover py-2 text-center ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    title={`Poção de cura: restaura ${p.heal} de vida (x${p.quantity})`}
                  >
                    {p.icon ? (
                      <EntityIcon src={p.icon} size={18} className="mx-auto mb-1 text-red-400" imgClassName="w-6 h-6 mx-auto mb-1 object-contain" />
                    ) : (
                      <HeartPulse size={18} className="mx-auto mb-1 text-red-400" />
                    )}
                    <span className="text-[10px] block truncate px-0.5">Cura</span>
                    <span className="text-[8px] text-gray-500 block">x{p.quantity}</span>
                  </button>
                );
              })()}

              {/* Poção de mana */}
              {(() => {
                const manaPotions = potions.filter((p) => p.manaRestore > 0);
                if (manaPotions.length === 0) return null;
                const p = manaPotions[0];
                const disabled = p.quantity < 1 || combat.state !== "active";
                return (
                  <button
                    onClick={() => {
                      const needsMana = (combat.characterMana ?? 0) < (combat.maxMana ?? 0);
                      if (!needsMana) {
                        toast("Mana já está cheia.");
                        return;
                      }
                      usePotion(p.inventoryId);
                    }}
                    disabled={disabled}
                    className={`w-28 card-hover py-2 text-center ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    title={`Poção de mana: restaura ${p.manaRestore} de mana (x${p.quantity})`}
                  >
                    {p.icon ? (
                      <EntityIcon src={p.icon} size={18} className="mx-auto mb-1 text-blue-400" imgClassName="w-6 h-6 mx-auto mb-1 object-contain" />
                    ) : (
                      <Droplets size={18} className="mx-auto mb-1 text-blue-400" />
                    )}
                    <span className="text-[10px] block truncate px-0.5">Mana</span>
                    <span className="text-[8px] text-gray-500 block">x{p.quantity}</span>
                  </button>
                );
              })()}

              <button
                onClick={flee}
                disabled={combat.state !== "active"}
                className={`w-28 card-hover py-2 text-center ${combat.state !== "active" ? "opacity-40 cursor-not-allowed" : "hover:border-amber-500/40"}`}
                title="Tenta fugir do combate (70% de chance)"
              >
                <DoorOpen size={18} className="mx-auto mb-1 text-amber-400" />
                <span className="text-[10px] block">Fugir</span>
                <span className="text-[8px] text-gray-500 block">70%</span>
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
