import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { contentApi, leaderboardApi } from "../services/api";
import { ScrollText, Sword, Trophy, Zap, TrendingUp, Skull, Crown, Medal } from "lucide-react";

interface PatchNote {
  id: string;
  title: string;
  content: string;
  version: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RankEntry {
  position: number;
  username: string;
  displayName: string;
  characterName: string;
  className: string | null;
  classSlug: string | null;
  classIcon: string | null;
  level: number;
  experience: number;
  pvpKills: number;
  gold: number;
  diamonds: number;
  isVip: boolean;
}

interface Leaderboard {
  entries: RankEntry[];
  myRank: number | null;
}

function PositionBadge({ position }: { position: number }) {
  if (position === 1) return <span className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shrink-0"><Crown size={14} className="text-white" /></span>;
  if (position === 2) return <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shrink-0"><Medal size={14} className="text-white" /></span>;
  if (position === 3) return <span className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-700 flex items-center justify-center shrink-0"><Medal size={14} className="text-white" /></span>;
  return <span className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center text-xs font-mono text-gray-400 shrink-0">{position}</span>;
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const [notes, setNotes] = useState<PatchNote[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);

  useEffect(() => {
    contentApi.patchNotes().then(({ data }) => setNotes(Array.isArray(data) ? data : [])).catch(() => {});
    leaderboardApi.list()
      .then(({ data }) => setLeaderboard(data && Array.isArray(data.entries) ? data : null))
      .catch(() => {});
  }, []);

  const hasCharacter = !!user?.characters && user.characters.length > 0;
  const character = hasCharacter ? user!.characters![0] : null;
  const classSlug = character?.class?.slug;

  const pvpKills = (character as any)?.pvpKills ?? 0;
  const gold = Number(user?.gold ?? 0);
  const diamonds = user?.diamonds ?? 0;
  const level = character?.level ?? user?.level ?? 1;

  const rankCards = [
    { label: "Nível", value: level.toLocaleString(), icon: Trophy, color: "from-purple-500 to-purple-600" },
    { label: "Ouro", value: gold.toLocaleString(), icon: TrendingUp, color: "from-yellow-500 to-yellow-600" },
    { label: "Diamantes", value: diamonds.toLocaleString(), icon: Zap, color: "from-cyan-500 to-cyan-600" },
    { label: "Kills PvP", value: pvpKills.toLocaleString(), icon: Skull, color: "from-red-500 to-orange-500" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">
            Welcome back, <span className="glow-text">{user?.displayName}</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Your adventure continues...</p>
        </div>
        <Link to={hasCharacter ? (classSlug ? `/class/${classSlug}` : "/classes") : "/character/create"} className="btn-primary flex items-center gap-2">
          <Sword size={16} /> Classes
        </Link>
      </div>

      {!hasCharacter && (
        <Link to="/character/create" className="card-hover block border-purple-500/40 bg-gradient-to-r from-purple-600/10 to-blue-600/10 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0">
              <Sword size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-display font-bold text-lg">Crie seu personagem</h2>
              <p className="text-sm text-gray-400">
                Escolha uma das classes iniciais e comece a jornada!
              </p>
            </div>
            <span className="btn-primary text-sm">Criar agora</span>
          </div>
        </Link>
      )}

      {hasCharacter && character && (
        <div className="panel p-4 border-cyan-500/30 bg-cyan-500/5">
          <div className="flex items-center gap-3">
            <Sword size={20} className="text-cyan-400" />
            <div className="flex-1">
              <p className="text-sm text-gray-400">Personagem selecionado</p>
              <p className="font-display font-bold">
                {character.name}{" "}
                <span className="text-sm text-purple-400 font-mono">Lv.{character.level}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {character.class?.name || "Sem classe"}
              </p>
              {(character.experience !== undefined || character.experienceToNext) &&
                (character.atMaxLevel ? (
                  <div className="mt-2 max-w-xs">
                    <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">Nível máximo alcançado</p>
                  </div>
                ) : (
                  <div className="mt-2 max-w-xs">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>XP para o próximo level</span>
                      <span className="font-mono">{character.experience ?? 0} / {character.experienceToNext ?? 150}</span>
                    </div>
                    <div className="stat-bar h-1.5">
                      <div
                        className="stat-bar-fill bg-gradient-to-r from-purple-500 to-blue-500"
                        style={{ width: `${Math.min(100, ((character.experience ?? 0) / (character.experienceToNext ?? 150)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
            <span className="text-sm text-gray-400">Level {character.level}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {rankCards.map((card) => (
          <div key={card.label} className="panel p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
              <card.icon size={20} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{card.value}</p>
              <p className="text-xs text-gray-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
            <ScrollText size={18} className="text-cyan-400" /> Patch Notes
          </h2>
          {notes.length === 0 ? (
            <div className="panel p-6 text-center">
              <p className="text-sm text-gray-500">Sem atualizações por enquanto.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="panel p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-display font-semibold text-purple-300">{note.title}</p>
                    {note.version && (
                      <span className="text-xs font-mono text-gray-500">v{note.version}</span>
                    )}
                  </div>
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap mt-2 font-sans leading-relaxed">{note.content}</pre>
                  <p className="text-[10px] text-gray-600 mt-2">
                    {new Date(note.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Trophy size={18} className="text-purple-400" /> Ranking Global
            </h2>
            {leaderboard && leaderboard.myRank !== null && (
              <span className="text-xs px-2 py-1 rounded-md bg-purple-500/15 text-purple-300">
                Sua posição: #{leaderboard.myRank}
              </span>
            )}
          </div>
          {!leaderboard ? (
            <div className="panel p-6 text-center">
              <p className="text-sm text-gray-500">Carregando ranking...</p>
            </div>
          ) : leaderboard.entries.length === 0 ? (
            <div className="panel p-6 text-center">
              <p className="text-sm text-gray-500">Nenhum jogador rankeado ainda.</p>
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="divide-y divide-dark-700 max-h-[420px] overflow-y-auto">
                {leaderboard.entries.map((entry) => {
                  const isMe = entry.username === user?.username;
                  return (
                    <Link
                      key={entry.username}
                      to={`/player/${encodeURIComponent(entry.username)}`}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-dark-800/60 transition-colors ${
                        isMe ? "bg-purple-500/10 border-l-2 border-l-purple-400" : ""
                      }`}
                    >
                      <PositionBadge position={entry.position} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.characterName}
                          {isMe && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 align-middle">
                              Você
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {entry.username}
                          {entry.className && <span className="text-purple-400"> • {entry.className}</span>}
                          {entry.isVip && <span className="text-yellow-400"> • VIP</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-semibold">Lv.{entry.level}</p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1 justify-end">
                          <Skull size={9} className="text-red-400" /> {entry.pvpKills}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
