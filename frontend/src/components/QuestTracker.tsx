import { useCallback, useEffect, useState } from "react";
import { questsApi } from "../services/api";
import { ScrollText, CheckCircle2, Clock } from "lucide-react";

interface QuestObjectiveLike {
  id?: string;
  type?: string;
  target?: string;
  monsterName?: string;
  monsterId?: string;
  amount?: number;
  quantity?: number;
  current?: number;
  description?: string;
}

interface TrackerQuest {
  id: string;
  title: string;
  objectives: QuestObjectiveLike[];
  progress: Record<string, number>;
}

function parseJsonArray(raw: any): QuestObjectiveLike[] {
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
  return `${obj.type ?? "obj"}-${obj.monsterName ?? obj.monsterId ?? obj.target ?? "?"}`;
}

function objectiveLabel(obj: QuestObjectiveLike): string {
  return obj.monsterName ?? obj.description ?? obj.target ?? obj.type ?? "Objetivo";
}

// Mostrador compacto de quests ativas — usado no mapa e durante o farm.
export function QuestTracker({ compact }: { compact?: boolean }) {
  const [quests, setQuests] = useState<TrackerQuest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await questsApi.progress();
      const raw: any[] = Array.isArray(data) ? data : [];
      const tracker: TrackerQuest[] = raw
        .filter((p) => p?.status === "active")
        .map((p) => ({
          id: p.id,
          title: p.quest?.title ?? "Quest",
          objectives: parseJsonArray(p.quest?.objectives),
          progress: parseProgress(p.progress),
        }));
      setQuests(tracker);
    } catch {
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener("quests-changed", onChanged);
    const t = setInterval(load, 30000);
    return () => {
      window.removeEventListener("quests-changed", onChanged);
      clearInterval(t);
    };
  }, [load]);

  if (loading) return null;
  if (quests.length === 0) return null;

  return (
    <div className={`panel p-4 ${compact ? "p-3" : ""}`}>
      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
        <ScrollText size={16} className="text-green-400" />
        Quests em andamento
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">{quests.length}</span>
      </h2>
      <div className="space-y-3">
        {quests.map((q) => {
          const total = q.objectives.length || 1;
          const done = q.objectives.filter((obj) => {
            const count = Number(q.progress[objectiveKey(obj)]) || Number(obj.current) || 0;
            return count >= Number(obj.amount ?? obj.quantity ?? 1);
          }).length;
          const pct = Math.round((done / total) * 100);
          return (
            <div key={q.id} className="rounded-lg bg-dark-900 border border-dark-600 p-2.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white flex-1 min-w-0 truncate" title={q.title}>{q.title}</p>
                <span className="text-[10px] text-gray-500 flex items-center gap-1 shrink-0">
                  <Clock size={10} /> {done}/{total}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {q.objectives.map((obj, i) => {
                  const amount = Number(obj.amount ?? obj.quantity ?? 1);
                  const count = Math.min(amount, Number(q.progress[objectiveKey(obj)]) || Number(obj.current) || 0);
                  const complete = count >= amount;
                  return (
                    <div key={`${objectiveKey(obj)}-${i}`} className="flex items-center gap-1.5 text-[11px]">
                      {complete ? (
                        <CheckCircle2 size={11} className="text-green-400 shrink-0" />
                      ) : (
                        <span className="w-[11px] h-[11px] rounded-full border border-dark-600 shrink-0" />
                      )}
                      <span className={`truncate ${complete ? "text-green-300" : "text-gray-400"}`} title={objectiveLabel(obj)}>
                        {objectiveLabel(obj)}
                      </span>
                      <span className={`ml-auto font-mono shrink-0 ${complete ? "text-green-300" : "text-gray-500"}`}>{count}/{amount}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-dark-800 border border-dark-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-green-400" : "bg-gradient-to-r from-green-500 to-emerald-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}