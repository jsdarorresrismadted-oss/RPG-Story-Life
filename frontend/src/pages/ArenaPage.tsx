import { useEffect, useMemo, useState } from "react";
import { getSocket } from "../services/socket";
import { pvpApi, authApi } from "../services/api";
import { useGameStore } from "../store/gameStore";
import { useAuthStore } from "../store/authStore";
import { PvpMatchState, PvpMe, PvpOpponent } from "../types";
import { Swords, Trophy, Star, RefreshCw, LogOut, Users, Crown } from "lucide-react";
import toast from "react-hot-toast";

function logClass(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("crítico") || l.includes("critico")) return "text-yellow-300";
  if (l.includes("esquivou")) return "text-sky-300";
  if (l.includes("curou") || l.includes("regenerou") || l.includes("restaurou") || l.includes("absorveu") || l.includes("escudo")) return "text-green-300";
  if (l.includes("dano") || l.includes("causou") || l.includes("refletiu") || l.includes("golpe") || l.includes("aniquilou") || l.includes("letal")) return "text-red-300";
  if (l.includes("usou") || l.includes("canalizando")) return "text-purple-300";
  return "text-gray-300";
}

export function ArenaPage() {
  const { selectedCharacter } = useGameStore();
  const { setUser } = useAuthStore();
  const [me, setMe] = useState<PvpMe | null>(null);
  const [opponents, setOpponents] = useState<PvpOpponent[]>([]);
  const [match, setMatch] = useState<PvpMatchState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [challenging, setChallenging] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [result, setResult] = useState<{ won: boolean; ratingDelta: number; goldReward: number } | null>(null);

  const refreshAuth = () => {
    authApi.me().then(({ data }) => data && setUser(data)).catch(() => {});
  };

  const loadArena = () => {
    pvpApi.arena().then(({ data }) => {
      setMe(data.me || null);
      setOpponents(Array.isArray(data.opponents) ? data.opponents : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadArena();
  }, []);

  // Cooldown countdown
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
    const s = getSocket();
    if (!s) return;

    const onTick = (data: any) => {
      const myCharId = selectedCharacter?.id;
      const isChallenger = data.challengerCharacterId === myCharId;
      const next: PvpMatchState = {
        matchId: data.matchId,
        challengerCharacterId: data.challengerCharacterId,
        opponentCharacterId: data.opponentCharacterId,
        challengerName: data.challengerName,
        opponentName: data.opponentName,
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
        skills: data.skills,
        state: data.state === "error" ? "error" : data.state,
        won: data.won,
        ratingDelta: data.ratingDelta,
        goldReward: data.goldReward,
      };
      setMatch((prev) => (prev ? { ...prev, ...next } : next));

      if (data.messages && data.messages.length > 0) {
        setLog((prev) => [...prev.slice(-29), ...data.messages]);
      }

      if (data.state === "won" || data.state === "lost") {
        setResult({
          won: !!data.won,
          ratingDelta: data.ratingDelta ?? 0,
          goldReward: data.goldReward ?? 0,
        });
        if (data.won) toast.success("Vitória na arena!");
        else toast.error("Derrota na arena!");
        // Atualiza gold/XP
        pvpApi.arena().then(({ data: arena }) => {
          if (arena.me) setMe(arena.me);
        }).catch(() => {});
        refreshAuth();
      }
    };

    s.on("pvp:tick", onTick);
    return () => {
      s.off("pvp:tick", onTick);
    };
  }, [selectedCharacter?.id]);

  const challenge = async (targetId: string) => {
    setChallenging(true);
    setResult(null);
    setLog([]);
    try {
      const { data } = await pvpApi.challenge(targetId);
      setMatch(data as PvpMatchState);
      setLog([`Luta contra ${data.opponentName} iniciada!`]);
      setCooldownLeft(30);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao desafiar.");
    } finally {
      setChallenging(false);
    }
  };

  const flee = async () => {
    if (!match) return;
    try {
      await pvpApi.flee(match.matchId);
      setResult({ won: false, ratingDelta: -10, goldReward: 0 });
      setLog((prev) => [...prev.slice(-29), "Você abandonou a arena — derrota."]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao abandonar.");
    }
  };

  const resetMatch = () => {
    setMatch(null);
    setResult(null);
    setLog([]);
    loadArena();
  };

  const mySide = useMemo(() => {
    if (!match) return null;
    return match.challengerCharacterId === selectedCharacter?.id ? "challenger" : "opponent";
  }, [match, selectedCharacter?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> Carregando arena...
      </div>
    );
  }

  if (match && (match.state === "active" || result)) {
    const meName = mySide === "challenger" ? match.challengerName : match.opponentName;
    const themName = mySide === "challenger" ? match.opponentName : match.challengerName;
    const meHp = mySide === "challenger" ? match.challengerHp : match.opponentHp;
    const meMaxHp = mySide === "challenger" ? match.challengerMaxHp : match.opponentMaxHp;
    const meMana = mySide === "challenger" ? match.challengerMana : match.opponentMana;
    const meMaxMana = mySide === "challenger" ? match.challengerMaxMana : match.opponentMaxMana;
    const themHp = mySide === "challenger" ? match.opponentHp : match.challengerHp;
    const themMaxHp = mySide === "challenger" ? match.opponentMaxHp : match.challengerMaxHp;

    return (
      <div className="max-w-3xl mx-auto p-4 w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Swords size={20} className="text-red-400" /> Arena — duelo automático
          </h1>
          <button onClick={flee} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition-colors">
            <LogOut size={14} /> Abandonar
          </button>
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
              <span className="text-xs text-gray-500">{match.challengerRating ?? match.opponentRating ?? "—"} pts</span>
            </div>
            <div className="h-3 rounded-full bg-dark-800 border border-dark-600 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500" style={{ width: `${Math.min(100, (meHp / meMaxHp) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>HP</span><span>{Math.max(0, Math.round(meHp))} / {meMaxHp}</span>
            </div>
            <div className="h-2 rounded-full bg-dark-800 border border-dark-600 overflow-hidden mt-1">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500" style={{ width: `${Math.min(100, (meMana / meMaxMana) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>Mana</span><span>{Math.max(0, Math.round(meMana))} / {meMaxMana}</span>
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
          {log.length === 0 && <p className="text-xs text-gray-500">A luta começou! As skills são lançadas automaticamente.</p>}
          {log.map((line, i) => (
            <p key={i} className={`text-xs ${logClass(line)}`}>{line}</p>
          ))}
        </div>

        {result && (
          <div className={`mt-4 rounded-xl border p-4 text-center ${result.won ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
            <p className={`text-lg font-bold ${result.won ? "text-green-400" : "text-red-400"}`}>
              {result.won ? "VITÓRIA!" : "DERROTA!"}
            </p>
            <p className="text-sm text-gray-300 mt-1">
              {result.won ? "+" : ""}{result.ratingDelta} rating{result.won && result.goldReward > 0 ? ` • +${result.goldReward} ouro` : ""}
            </p>
            <button onClick={resetMatch} className="mt-3 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-sm font-semibold text-purple-200 hover:bg-purple-500/30 transition-colors">
              Voltar para a arena
            </button>
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
        <button onClick={loadArena} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600 text-xs font-semibold text-gray-300 hover:bg-dark-700 transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
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
          Arena em cooldown — aguarde {cooldownLeft}s para um novo desafio.
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
        <Users size={16} className="text-purple-400" /> Aventureiros disponíveis
      </div>

      <div className="space-y-2">
        {opponents.length === 0 && (
          <p className="text-sm text-gray-500">Nenhum aventureiro disponível no momento.</p>
        )}
        {opponents.map((o) => (
          <div key={o.id} className="rounded-xl border border-dark-700 bg-[#12141a] p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-dark-800 border border-dark-600 flex items-center justify-center text-base font-bold text-gray-200">
                {o.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{o.name}</p>
                <p className="text-[11px] text-gray-500">
                  {o.className} • lvl {o.level} • {o.arenaWins}V/{o.arenaLosses}D
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-purple-300 flex items-center gap-1">
                <Trophy size={13} /> {o.arenaRating}
              </span>
              <button
                onClick={() => challenge(o.id)}
                disabled={challenging || cooldownLeft > 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Swords size={13} /> {challenging ? "Desafiando..." : "Desafiar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 mt-4 flex items-center gap-1.5">
        <Crown size={12} /> A luta é automática — suas skills e as do oponente são lançadas sozinhas. Vencedor ganha ouro e rating.
      </p>
    </div>
  );
}
