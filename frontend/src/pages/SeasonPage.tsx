import { useEffect, useState } from "react";
import { seasonsApi, questsApi } from "../services/api";
import { Trophy, Gift, Lock, Check, Coins, Zap, Star, Gem, CalendarDays, CalendarRange, CalendarClock, CheckCircle2, Play } from "lucide-react";
import toast from "react-hot-toast";

const PASS_XP_PER_LEVEL = 1000;

const PERIODS = [
  { key: "daily", label: "Diárias", icon: CalendarDays, hint: "Resetam todo dia", color: "text-sky-400" },
  { key: "weekly", label: "Semanais", icon: CalendarRange, hint: "Resetam toda semana", color: "text-purple-400" },
  { key: "monthly", label: "Mensais", icon: CalendarClock, hint: "Resetam todo mês", color: "text-amber-400" },
] as const;

interface QuestLike {
  id: string;
  title: string;
  description: string;
  type: string;
  period?: string | null;
  objectives: any[];
  xpReward: string | number;
  goldReward: string | number;
  isActive: boolean;
}

interface ProgressLike {
  questId: string;
  quest: QuestLike;
  status: string;
  progress: Record<string, number> | string;
  claimedAt?: string | null;
}

interface QuestObjectiveLike {
  id?: string;
  type?: string;
  target?: string;
  monsterName?: string;
  monsterId?: string;
  itemName?: string;
  amount?: number;
  quantity?: number;
  current?: number;
  description?: string;
}

function parseObj(raw: any): QuestObjectiveLike[] {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseProgress(raw: any): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, number>;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function objectiveKey(obj: QuestObjectiveLike): string {
  if (obj.id) return String(obj.id);
  return `${obj.type ?? "obj"}-${obj.monsterName ?? obj.itemName ?? obj.monsterId ?? obj.target ?? "?"}`;
}

function objectiveLabel(obj: QuestObjectiveLike): string {
  const target = obj.monsterName ?? obj.itemName ?? obj.target ?? "?";
  if (obj.type === "kill") return `Derrote ${target}`;
  if (obj.type === "collect") return `Colete ${target}`;
  return obj.description ?? target;
}

function QuestObjectiveBlock({ quest, progress }: { quest: QuestLike; progress: Record<string, number> }) {
  const objectives = parseObj(quest.objectives);
  return (
    <div className="space-y-1 mt-2">
      {objectives.map((obj, i) => {
        const amount = Number(obj.amount ?? obj.quantity ?? 1);
        const count = Math.min(amount, Number(progress[objectiveKey(obj)]) || Number(obj.current) || 0);
        const complete = count >= amount;
        return (
          <div key={`${objectiveKey(obj)}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            {complete ? (
              <CheckCircle2 size={11} className="text-green-400 shrink-0" />
            ) : (
              <span className="w-[11px] h-[11px] rounded-full border border-dark-600 shrink-0" />
            )}
            <span className={`truncate ${complete ? "text-green-300" : "text-gray-400"}`}>{objectiveLabel(obj)}</span>
            <span className={`ml-auto font-mono shrink-0 ${complete ? "text-green-300" : "text-gray-500"}`}>{count}/{amount}</span>
          </div>
        );
      })}
    </div>
  );
}

interface SeasonData {
  season: { id: string; name: string; description: string; startsAt: string; endsAt: string } | null;
  tiers: { id: string; level: number; freeRewards: any[]; premiumRewards: any[] }[];
  pass: { level: number; experience: number; isPremium: boolean; claimedTiers: string[] } | null;
}

function describeReward(r: any): { label: string; icon: any; premium: boolean } {
  switch (r?.type) {
    case "gold":
      return { label: `+${Number(r.value || 0).toLocaleString()}G`, icon: Coins, premium: false };
    case "experience":
      return { label: `+${Number(r.value || 0).toLocaleString()} XP`, icon: Zap, premium: false };
    case "classXp":
      return { label: `+${Number(r.value || 0).toLocaleString()} XP Classe`, icon: Star, premium: false };
    case "item":
      return { label: `${r.quantity || 1}x ${r.slug || r.itemName || r.name}`, icon: Gift, premium: false };
    case "gem":
      return { label: `+${Number(r.value || 0)} gemas`, icon: Gem, premium: true };
    default:
      return { label: "Recompensa", icon: Gift, premium: false };
  }
}

export function SeasonPage() {
  const [data, setData] = useState<SeasonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const [quests, setQuests] = useState<QuestLike[]>([]);
  const [progress, setProgress] = useState<ProgressLike[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    seasonsApi
      .me()
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadQuests = () => {
    Promise.all([questsApi.list(), questsApi.progress()])
      .then(([q, p]) => {
        setQuests((Array.isArray(q.data) ? q.data : []).filter((x: any) => x?.period));
        setProgress(Array.isArray(p.data) ? p.data : []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    loadQuests();
  }, []);

  const handleClaim = async (tierId: string) => {
    setClaiming(tierId);
    try {
      await seasonsApi.claim(tierId);
      toast.success("Recompensas do tier reivindicadas!");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Falha ao reivindicar");
    } finally {
      setClaiming(null);
    }
  };

  const handleQuestAction = async (questId: string, action: "accept" | "claim") => {
    setBusy(questId);
    try {
      await (action === "accept" ? questsApi.accept(questId) : questsApi.claim(questId));
      toast.success(action === "accept" ? "Quest aceita!" : "Recompensas recebidas (XP do passe + XP normal)!");
      window.dispatchEvent(new Event("quests-changed"));
      loadQuests();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Falha na quest");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!data?.season) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Trophy size={24} className="text-yellow-400" /> Season
        </h1>
        <div className="panel p-8 text-center text-gray-500">
          <Trophy size={48} className="mx-auto mb-3 opacity-50" />
          <p>Nenhuma temporada ativa no momento.</p>
        </div>
      </div>
    );
  }

  const pass = data.pass;
  const level = pass?.level ?? 1;
  const xpInto = (pass?.experience ?? 0) % PASS_XP_PER_LEVEL;
  const claimed = new Set(pass?.claimedTiers ?? []);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <Trophy size={24} className="text-yellow-400" /> {data.season.name}
      </h1>

      <div className="panel p-4">
        <p className="text-sm text-gray-400 mb-3">{data.season.description}</p>
        <p className="text-xs text-gray-500">
          Termina em {new Date(data.season.endsAt).toLocaleDateString()}
        </p>
      </div>

      <div className="panel p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-semibold">Seu passe</h2>
          <span className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-lg">
            Nível {level}
          </span>
        </div>
        <div className="h-2.5 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-300"
            style={{ width: `${(xpInto / PASS_XP_PER_LEVEL) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {xpInto.toLocaleString()} / {PASS_XP_PER_LEVEL.toLocaleString()} XP até o nível {level + 1} • Ganhe XP de passe concluindo quests diárias, semanais e mensais
        </p>
      </div>

      <div className="panel p-4">
        <h2 className="font-display font-semibold mb-1 flex items-center gap-2">
          <Star size={16} className="text-purple-400" /> Missões do Passe
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Cada missão concluída dá o XP inteiro dela para o seu passe. Diárias e semanais trocam sozinhas a cada ciclo.
        </p>
        <div className="space-y-5">
          {PERIODS.map((period) => {
            const periodQuests = quests.filter((q) => q.period === period.key);
            return (
              <div key={period.key}>
                <div className="flex items-center gap-2 mb-2">
                  <period.icon size={14} className={period.color} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${period.color}`}>{period.label}</span>
                  <span className="text-[10px] text-gray-500">{period.hint}</span>
                </div>
                {periodQuests.length === 0 ? (
                  <p className="text-xs text-gray-600">Nenhuma quest {period.label.toLowerCase()} ativa no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {periodQuests.map((q) => {
                      const p = progress.find((x) => x.questId === q.id);
                      const status = p?.status ?? "none";
                      const pr = parseProgress(p?.progress);
                      return (
                        <div key={q.id} className="rounded-lg bg-dark-900 border border-dark-600 p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white">{q.title}</p>
                              {q.description && (
                                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{q.description}</p>
                              )}
                              {status === "active" || status === "completed" ? (
                                <QuestObjectiveBlock quest={q} progress={pr} />
                              ) : null}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1.5">
                              <span className="flex items-center gap-1 text-[11px] text-purple-300">
                                <Zap size={11} /> +{Number(q.xpReward || 0).toLocaleString()} XP passe
                              </span>
                              {Number(q.goldReward || 0) > 0 && (
                                <span className="flex items-center gap-1 text-[11px] text-yellow-400">
                                  <Coins size={11} /> +{Number(q.goldReward || 0).toLocaleString()}G
                                </span>
                              )}
                              {status === "none" && (
                                <button
                                  onClick={() => handleQuestAction(q.id, "accept")}
                                  disabled={busy === q.id}
                                  className="btn-primary text-[11px] px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Play size={11} /> Aceitar
                                </button>
                              )}
                              {status === "active" && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                  <CalendarDays size={11} /> Em andamento
                                </span>
                              )}
                              {status === "completed" && (
                                <button
                                  onClick={() => handleQuestAction(q.id, "claim")}
                                  disabled={busy === q.id}
                                  className="btn-primary text-[11px] px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Check size={11} /> Receber
                                </button>
                              )}
                              {status === "claimed" && (
                                <span className="flex items-center gap-1 text-[11px] text-green-400">
                                  <CheckCircle2 size={11} /> Concluída
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.tiers.map((tier) => {
          const isClaimed = claimed.has(tier.id);
          const isLocked = level < tier.level;
          const freeRewards = tier.freeRewards?.length
            ? tier.freeRewards.map(describeReward)
            : [{ label: "—", icon: Gift, premium: false }];
          const premiumRewards = tier.premiumRewards?.length
            ? tier.premiumRewards.map(describeReward)
            : [];

          return (
            <div
              key={tier.id}
              className={`panel p-4 relative ${isClaimed ? "opacity-60" : ""} ${isLocked && !isClaimed ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-display font-bold text-lg text-yellow-400">Nível {tier.level}</span>
                {isClaimed ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check size={13} /> Reivindicado
                  </span>
                ) : isLocked ? (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Lock size={12} /> Requer nível {tier.level}
                  </span>
                ) : (
                  <button
                    onClick={() => handleClaim(tier.id)}
                    disabled={claiming === tier.id}
                    className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                  >
                    {claiming === tier.id ? "Reivindicando..." : "Reivindicar"}
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">Grátis</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {freeRewards.map((r, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-dark-800 border border-dark-600 rounded-lg px-2 py-1">
                    <r.icon size={12} className="text-green-400" /> {r.label}
                  </span>
                ))}
              </div>

              {premiumRewards.length > 0 && (
                <>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">Premium</p>
                  <div className="flex flex-wrap gap-1.5">
                    {premiumRewards.map((r, i) => (
                      <span key={i} className="flex items-center gap-1 text-xs bg-dark-800 border border-yellow-500/30 rounded-lg px-2 py-1">
                        <r.icon size={12} className="text-yellow-400" /> {r.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
