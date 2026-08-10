import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { leaderboardApi } from "../services/api";
import { LeaderboardEntry } from "../types";
import { Trophy, Swords, Crown, Gem } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RankingPage() {
  const { t } = useTranslation("dashboard");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leaderboardApi.list()
      .then(({ data }) => {
        setEntries(data.entries);
        setMyRank(data.myRank);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  const medal = (pos: number) => {
    if (pos === 1) return <span className="text-amber-400"><Crown size={16} /></span>;
    if (pos === 2) return <span className="text-gray-300">🥈</span>;
    if (pos === 3) return <span className="text-amber-700">🥉</span>;
    return <span className="text-gray-600 font-mono text-sm w-6 text-center">{pos}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Trophy size={24} className="text-amber-400" /> {t("global_ranking", { defaultValue: "Ranking Global" })}
        </h1>
        {myRank && <span className="text-sm text-gray-400">{t("my_rank", { defaultValue: "Sua posição" })}: <b className="text-purple-300">#{myRank}</b></span>}
      </div>

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[48px_1fr_70px_90px_90px] sm:grid-cols-[48px_1fr_90px_120px_140px] gap-2 px-4 py-3 border-b border-dark-600 text-xs font-bold uppercase tracking-wider text-gray-500">
          <span>#</span>
          <span>{t("col_player", { defaultValue: "Player" })}</span>
          <span className="text-center">{t("col_level", { defaultValue: "Level" })}</span>
          <span className="text-center">{t("col_pvp", { defaultValue: "PvP (kills)" })}</span>
          <span className="text-right">{t("col_force", { defaultValue: "Força" })}</span>
        </div>

        <div className="divide-y divide-dark-700/50">
          {entries.map((e) => (
            <Link
              key={e.username}
              to={`/player/${e.username}`}
              className="grid grid-cols-[48px_1fr_70px_90px_90px] sm:grid-cols-[48px_1fr_90px_120px_140px] gap-2 px-4 py-3 items-center hover:bg-dark-800/50 transition-colors"
            >
              <span className="flex items-center justify-center">{medal(e.position)}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{e.displayName}</p>
                  {e.isVip && <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1 py-px">VIP</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {e.characterName} • {e.className}
                </p>
              </div>
              <span className="text-center font-mono text-sm">{e.level}</span>
              <span className="text-center font-mono text-sm flex items-center justify-center gap-1">
                <Swords size={12} className="text-red-400" /> {e.pvpKills}
              </span>
              <span className="text-right font-display font-bold text-sm flex items-center justify-end gap-1 text-purple-300">
                <Gem size={12} className="text-purple-400" /> {e.force.toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
