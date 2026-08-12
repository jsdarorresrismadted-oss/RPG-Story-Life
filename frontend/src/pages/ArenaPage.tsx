import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../services/socket";
import { pvpApi, authApi, inventoryApi } from "../services/api";
import { useGameStore } from "../store/gameStore";
import { useAuthStore } from "../store/authStore";
import { PvpMatchState, PvpMe } from "../types";
import { Swords, Star, RefreshCw, LogOut, Crown, Heart, Zap, HeartPulse, Dices } from "lucide-react";
import toast from "react-hot-toast";
import { EntityIcon } from "../components/EntityIcon";

function logClass(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("crítico") || l.includes("critico")) return "text-yellow-300";
  if (l.includes("esquivou")) return "text-sky-300";
  if (l.includes("curou") || l.includes("regenerou") || l.includes("restaurou") || l.includes("absorveu") || l.includes("escudo")) return "text-green-300";
  if (l.includes("dano") || l.includes("causou") || l.includes("refletiu") || l.includes("golpe") || l.includes("aniquilou") || l.includes("letal")) return "text-red-300";
  if (l.includes("usou") || l.includes("canalizando")) return "text-purple-300";
  return "text-gray-300";
}

interface PvpPotion {
  itemName: string;
  heal: number;
  manaRestore: number;
  icon?: string | null;
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

export function ArenaPage() {
  const { selectedCharacter } = useGameStore();
  const { setUser } = useAuthStore();
  const [me, setMe] = useState<PvpMe | null>(null);
  const [match, setMatch] = useState<PvpMatchState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [challenging, setChallenging] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [result, setResult] = useState<{ won: boolean; ratingDelta: number; goldReward: number; fled?: boolean } | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [potions, setPotions] = useState<PvpPotion[]>([]);
  const [potionsLeft, setPotionsLeft] = useState(3);
  const myCharIdRef = useRef(selectedCharacter?.id);
  myCharIdRef.current = selectedCharacter?.id;

  const refreshAuth = () => {
    authApi.me().then(({ data }) => data && setUser(data)).catch(() => {});
  };

  const loadArena = () => {
    pvpApi.arena().then(({ data }) => {
      setMe(data.me || null);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadArena();
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    pvpApi.active().then(({ data }) => {
      if (data?.matchId) {
        setLog((prev) => [...prev.slice(-29), "Você tem uma luta de arena em andamento."]);
      }
    }).catch(() => {});
  }, [me?.id]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  useEffect(() => {
    const hasActive = Object.values(cooldowns).some((t) => Date.now() - t < 60000);
    if (!hasActive) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [cooldowns]);

  useEffect(() => {
    inventoryApi.list().then(({ data }) => {
      const list: any[] = Array.isArray(data) ? data : [];
      const usable = list
        .map((inv) => {
          const { heal, manaRestore } = itemEffects(inv.item);
          return { itemName: inv.item.name, heal, manaRestore, icon: inv.item.icon ?? null };
        })
        .filter((p) => p.heal > 0 || p.manaRestore > 0);
      setPotions(usable);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onUpdate = (data: any) => {
      if (!data?.matchId) return;
      if (data.type === "started") {
        setResult(null);
        setPotionsLeft(3);
        setCooldowns({});
        setLog((prev) => [...prev.slice(-29), `Luta contra ${data.opponentName || ""} começou!`]);
      }
      const next: PvpMatchState = {
        type: data.type,
        matchId: data.matchId,
        challengerCharacterId: data.challengerCharacterId,
        opponentCharacterId: data.opponentCharacterId,
        challengerName: data.challengerName ?? "",
        opponentName: data.opponentName ?? "",
        challengerHp: data.challengerHp ?? 0,
        challengerMaxHp: data.challengerMaxHp ?? 100,
        challengerMana: data.challengerMana ?? 0,
        challengerMaxMana: data.challengerMaxMana ?? 50,
        opponentHp: data.opponentHp ?? 0,
        opponentMaxHp: data.opponentMaxHp ?? 100,
        opponentMana: data.opponentMana ?? 0,
        opponentMaxMana: data.opponentMaxMana ?? 50,
        opponentLevel: data.opponentLevel,
        challengerRating: data.challengerRating,
        opponentRating: data.opponentRating,
        challengerSkills: data.challengerSkills,
        opponentSkills: data.opponentSkills,
        state: data.state === "error" ? "error" : data.state,
        won: data.won,
        ratingDelta: data.ratingDelta,
        goldReward: data.goldReward,
        fled: data.fled,
      };
      setMatch((prev) => (prev ? { ...prev, ...next } : next));

      if (data.type === "tick") {
        const mySide = data.challengerCharacterId === myCharIdRef.current ? "challenger" : "opponent";
        const cds = mySide === "challenger" ? data.challengerCooldowns : data.opponentCooldowns;
        if (cds) {
          const map: Record<string, number> = {};
          for (const c of cds) map[c.skillId] = Date.now() + c.remaining;
          setCooldowns(map);
        }
      }

      if (data.messages && data.messages.length > 0) {
        setLog((prev) => [...prev.slice(-29), ...data.messages]);
      }

      if (data.type === "ended") {
        setResult({
          won: !!data.won,
          ratingDelta: data.ratingDelta ?? 0,
          goldReward: data.goldReward ?? 0,
          fled: data.fled,
        });
        if (data.won) toast.success("Vitória na arena!");
        else if (data.state === "fled" || data.fled) toast.error("Você abandonou a arena.");
        else toast.error("Derrota na arena!");
        pvpApi.arena().then(({ data: arena }) => {
          if (arena.me) setMe(arena.me);
        }).catch(() => {});
        refreshAuth();
      }
    };

    const onSkillUsed = (data: any) => {
      if (data.messages && data.messages.length > 0) {
        setLog((prev) => [...prev.slice(-29), ...data.messages]);
      }
      if (data.cooldowns) {
        const map: Record<string, number> = {};
        for (const c of data.cooldowns) map[c.skillId] = Date.now() + c.remaining;
        setCooldowns(map);
      }
    };

    const onItemUsed = (data: any) => {
      const parts: string[] = [];
      if ((data.healed ?? 0) > 0) parts.push(`${data.healed} de vida`);
      if ((data.manaRestored ?? 0) > 0) parts.push(`${data.manaRestored} de mana`);
      if (parts.length) setLog((prev) => [...prev.slice(-29), `Você usou uma poção (+${parts.join(", ")})`]);
      setPotionsLeft((p) => Math.max(0, p - 1));
    };

    const onChallengeResult = (data: any) => {
      if (!data?.accepted) {
        toast(`${data.targetName ?? "O adversário"} recusou seu desafio.`);
      }
    };

    const onError = (data: any) => {
      toast.error(data.message || "Erro na arena.");
    };

    s.on("pvp:update", onUpdate);
    s.on("pvp:skillUsed", onSkillUsed);
    s.on("pvp:itemUsed", onItemUsed);
    s.on("pvp:challengeResult", onChallengeResult);
    s.on("pvp:error", onError);
    return () => {
      s.off("pvp:update", onUpdate);
      s.off("pvp:skillUsed", onSkillUsed);
      s.off("pvp:itemUsed", onItemUsed);
      s.off("pvp:challengeResult", onChallengeResult);
      s.off("pvp:error", onError);
    };
  }, []);

  const challenge = async () => {
    setChallenging(true);
    setResult(null);
    setLog([]);
    try {
      const { data } = await pvpApi.challenge();
      toast(`${data.targetName} recebeu seu desafio — aguardando resposta...`, { duration: 3000 });
      setCooldownLeft(Math.ceil((data.expiresInMs ?? 30000) / 1000));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao procurar partida.");
    } finally {
      setChallenging(false);
    }
  };

  const findMatch = () => {
    if (challenging || cooldownLeft > 0) return;
    challenge();
  };

  const flee = async () => {
    if (!match) return;
    const s = getSocket();
    if (!s) return;
    s.emit("pvp:flee", { matchId: match.matchId });
  };

  const resetMatch = () => {
    setMatch(null);
    setResult(null);
    setLog([]);
    setPotionsLeft(3);
    setCooldowns({});
    loadArena();
  };

  const useSkill = (skillId: string) => {
    const s = getSocket();
    if (!s || !match) return;
    s.emit("pvp:useSkill", { matchId: match.matchId, skillId });
  };

  const usePotion = () => {
    const s = getSocket();
    if (!s || !match) return;
    const p = potions.find((x) => x.heal > 0) || potions[0];
    if (!p) return;
    s.emit("pvp:useItem", { matchId: match.matchId, heal: p.heal, mana: p.manaRestore });
  };

  const mySide = useMemo(() => {
    if (!match) return null;
    return match.challengerCharacterId === selectedCharacter?.id ? "challenger" : "opponent";
  }, [match, selectedCharacter?.id]);

  const mySkills = useMemo(() => {
    if (!match) return [];
    return mySide === "challenger" ? (match.challengerSkills ?? []) : (match.opponentSkills ?? []);
  }, [match, mySide]);

  const myMana = mySide === "challenger" ? match?.challengerMana ?? 0 : match?.opponentMana ?? 0;
  const myHp = mySide === "challenger" ? match?.challengerHp ?? 0 : match?.opponentHp ?? 0;
  const myMaxHp = mySide === "challenger" ? match?.challengerMaxHp ?? 100 : match?.opponentMaxHp ?? 100;
  const myMaxMana = mySide === "challenger" ? match?.challengerMaxMana ?? 50 : match?.opponentMaxMana ?? 50;
  const themHp = mySide === "challenger" ? match?.opponentHp ?? 0 : match?.challengerHp ?? 0;
  const themMaxHp = mySide === "challenger" ? match?.opponentMaxHp ?? 100 : match?.challengerMaxHp ?? 100;

  const isOnCooldown = (skillId: string, cooldown: number) => {
    const t = cooldowns[skillId];
    if (!t) return false;
    return now - t < cooldown;
  };
  const cooldownRemaining = (skillId: string, cooldown: number) => {
    const t = cooldowns[skillId];
    if (!t) return 0;
    return Math.max(0, cooldown - (now - t));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> Carregando arena...
      </div>
    );
  }

  if (match && (match.state === "active" || match.state === "won" || match.state === "lost" || match.state === "fled" || match.state === "error")) {
    const meName = mySide === "challenger" ? match.challengerName : match.opponentName;
    const themName = mySide === "challenger" ? match.opponentName : match.challengerName;
    const inFight = match.state === "active" && !result;

    return (
      <div className="max-w-3xl mx-auto p-4 w-full pb-40">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Swords size={20} className="text-red-400" /> Arena — duelo manual
          </h1>
          {inFight && (
            <button onClick={flee} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition-colors">
              <LogOut size={14} /> Abandonar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-dark-700 bg-[#12141a] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-sm font-bold text-purple-300">
                  {(meName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{meName}</p>
                  <p className="text-[10px] text-gray-500">Você</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">{mySide === "challenger" ? match.challengerRating ?? "—" : match.opponentRating ?? "—"} pts</span>
            </div>
            <div className="h-3 rounded-full bg-dark-800 border border-dark-600 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500" style={{ width: `${Math.min(100, (myHp / myMaxHp) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>HP</span><span>{Math.max(0, Math.round(myHp))} / {myMaxHp}</span>
            </div>
            <div className="h-2 rounded-full bg-dark-800 border border-dark-600 overflow-hidden mt-1">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500" style={{ width: `${Math.min(100, (myMana / myMaxMana) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>Mana</span><span>{Math.max(0, Math.round(myMana))} / {myMaxMana}</span>
            </div>
          </div>

          <div className="rounded-xl border border-dark-700 bg-[#12141a] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-sm font-bold text-red-300">
                  {(themName || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{themName}</p>
                  <p className="text-[10px] text-gray-500">Oponente</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">{match.opponentLevel ? `lvl ${match.opponentLevel}` : ""}</span>
            </div>
            <div className="h-3 rounded-full bg-dark-800 border border-dark-600 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-600 to-orange-400 transition-all duration-500" style={{ width: `${Math.min(100, (themHp / themMaxHp) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>HP</span><span>{Math.max(0, Math.round(themHp))} / {themMaxHp}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-dark-700 bg-[#12141a] p-3 h-56 overflow-y-auto space-y-1">
          {log.length === 0 && <p className="text-xs text-gray-500">A luta começou! Use suas skills e poções abaixo para vencer.</p>}
          {log.map((line, i) => (
            <p key={i} className={`text-xs ${logClass(line)}`}>{line}</p>
          ))}
        </div>

        {result && (
          <div className={`mt-4 rounded-xl border p-4 text-center ${result.won ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
            <p className={`text-lg font-bold ${result.won ? "text-green-400" : "text-red-400"}`}>
              {result.won ? "VITÓRIA!" : result.fled ? "VOCÊ ABANDONOU!" : "DERROTA!"}
            </p>
            <p className="text-sm text-gray-300 mt-1">
              {result.won ? "+" : ""}{result.ratingDelta} rating{result.won && result.goldReward > 0 ? ` • +${result.goldReward} ouro` : ""}
            </p>
            <button onClick={resetMatch} className="mt-3 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-sm font-semibold text-purple-200 hover:bg-purple-500/30 transition-colors">
              Voltar para a arena
            </button>
          </div>
        )}

        {inFight && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-md border-t border-dark-700 px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">Skill Bar — ataque manual</p>
              <div className="flex items-stretch justify-center gap-1.5 flex-wrap">
                {mySkills.filter((s: any) => s.trigger !== "auto").map((skill: any) => {
                  const cd = isOnCooldown(skill.id, skill.cooldown);
                  const cdLeft = cooldownRemaining(skill.id, skill.cooldown);
                  const noMana = myMana < skill.manaCost;
                  const disabled = cd || noMana || match.state !== "active";
                  return (
                    <button
                      key={skill.id}
                      onClick={() => useSkill(skill.id)}
                      disabled={disabled}
                      className={`w-28 card-hover py-2 text-center relative ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${skill.trigger === "ultimate" ? "border-yellow-500/40" : ""}`}
                      title={skill.description}
                    >
                      {cd && (
                        <span className="absolute inset-0 bg-black/70 rounded-xl flex items-center justify-center">
                          <span className="text-base font-bold text-white font-mono">{(cdLeft / 1000).toFixed(1)}s</span>
                        </span>
                      )}
                      {skill.icon ? (
                        <div className="relative w-6 h-6 mx-auto mb-1">
                          <EntityIcon src={skill.icon} size={22} className="mx-auto" imgClassName="w-full h-full object-contain" />
                          {skill.iconSecondary && (
                            <EntityIcon src={skill.iconSecondary} size={12} className="absolute -bottom-1 -right-1 rounded bg-dark-800 border border-dark-600" imgClassName="absolute -bottom-1 -right-1 w-3.5 h-3.5 object-contain rounded bg-dark-800 border border-dark-600" />
                          )}
                        </div>
                      ) : skill.trigger === "ultimate" ? (
                        <Zap size={18} className="mx-auto mb-1 text-yellow-400" />
                      ) : skill.kind === "heal" ? (
                        <Heart size={18} className="mx-auto mb-1 text-green-400" />
                      ) : (
                        <Swords size={18} className="mx-auto mb-1 text-purple-400" />
                      )}
                      <span className="text-[10px] block truncate px-0.5">{skill.name}</span>
                      <span className="text-[8px] text-gray-500 block">{skill.manaCost} mana{cd ? " · CD" : ""}</span>
                    </button>
                  );
                })}

                {potions.length > 0 && (
                  <button
                    onClick={usePotion}
                    disabled={potionsLeft <= 0 || match.state !== "active"}
                    className={`w-28 card-hover py-2 text-center ${potionsLeft <= 0 || match.state !== "active" ? "opacity-40 cursor-not-allowed" : ""}`}
                    title={`Poções restantes: ${potionsLeft}/3`}
                  >
                    <HeartPulse size={18} className="mx-auto mb-1 text-red-400" />
                    <span className="text-[10px] block truncate px-0.5">Poção</span>
                    <span className="text-[8px] text-gray-500 block">x{potionsLeft}</span>
                  </button>
                )}

                <button
                  onClick={flee}
                  disabled={match.state !== "active"}
                  className={`w-28 card-hover py-2 text-center ${match.state !== "active" ? "opacity-40 cursor-not-allowed" : "hover:border-amber-500/40"}`}
                  title="Abandona a arena — conta como derrota"
                >
                  <LogOut size={18} className="mx-auto mb-1 text-amber-400" />
                  <span className="text-[10px] block">Abandonar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Swords size={20} className="text-red-400" /> Arena PvP
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={loadArena} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600 text-xs font-semibold text-gray-300 hover:bg-dark-700 transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {me && (
        <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{me.name} <span className="text-gray-500 font-normal">• {me.className} • lvl {me.level}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">
              Vitórias: <span className="text-green-400">{me.arenaWins}</span> • Derrotas: <span className="text-red-400">{me.arenaLosses}</span> • Kills: <span className="text-red-300">{me.pvpKills}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-300">{me.arenaRating}</p>
            <p className="text-[10px] text-gray-500 flex items-center gap-1 justify-end"><Star size={10} /> rating</p>
          </div>
        </div>
      )}

      {cooldownLeft > 0 && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-dark-800 border border-dark-600 text-xs text-gray-300 flex items-center gap-2">
          <RefreshCw size={13} className="text-purple-400 animate-spin" />
          Desafio pendente — aguardando resposta do oponente ({cooldownLeft}s).
        </div>
      )}

      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/15 border border-purple-500/40 flex items-center justify-center text-purple-300 mb-3">
          {challenging ? <RefreshCw size={22} className="animate-spin" /> : <Dices size={22} />}
        </div>
        <h2 className="font-display font-semibold text-white">Partida aleatória</h2>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
          O sistema escolhe um aventureiro aleatório para você duelar — ninguém escolhe o adversário, então a arena é justa e sem combinações.
        </p>
        <button
          onClick={findMatch}
          disabled={challenging || cooldownLeft > 0}
          className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-sm font-bold text-purple-200 hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Swords size={15} /> {challenging ? "Procurando oponente..." : "Procurar partida"}
        </button>
      </div>

      <p className="text-[11px] text-gray-500 mt-4 flex items-center gap-1.5">
        <Crown size={12} /> Quando um oponente é encontrado, ele recebe um aviso e pode aceitar. Depois é com você: use suas skills e poções na hora. Vencedor ganha ouro e rating.
      </p>
    </div>
  );
}
