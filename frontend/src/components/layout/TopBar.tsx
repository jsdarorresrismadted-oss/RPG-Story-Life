import { useEffect, useState } from "react";
import { User } from "../../types";
import { Menu, MessageSquare, LogOut, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { guildApi } from "../../services/api";
import { useTranslation } from "react-i18next";

interface TopBarProps {
  user: User | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onLogout: () => void;
}

export function TopBar({ user, sidebarOpen, onToggleSidebar, onToggleChat, onLogout }: TopBarProps) {
  const { t } = useTranslation("common");
  const [guildTag, setGuildTag] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    guildApi.mine()
      .then(({ data }) => {
        if (cancelled) return;
        setGuildTag(data?.guild?.tag ?? null);
        setGuildName(data?.guild?.name ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const isStaff = user?.role === "admin" || user?.role === "owner";
  const isVip = !!user?.vipUntil && new Date(user.vipUntil).getTime() > Date.now();

  return (
    <header className="h-14 bg-dark-900/90 backdrop-blur-md border-b border-dark-700 flex items-center px-4 gap-3 z-50">
      <button onClick={onToggleSidebar} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
        {sidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
      </button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-display text-lg font-bold glow-text hidden sm:inline">RPG Story Life</span>
        {guildTag && (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5" title={guildName || undefined}>
            [{guildTag}]
          </span>
        )}
        {isStaff && (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">
            Staff
          </span>
        )}
        {isVip && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
            <Crown size={11} className="text-amber-400" /> VIP
          </span>
        )}
      </div>

      {user && (
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 rounded-md">
              <span className="text-yellow-400 font-mono text-xs sm:text-sm">{(user.gold ?? 0).toLocaleString()}</span>
              <span className="text-yellow-500">G</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-cyan-500/10 rounded-md" title="SF Coins">
              <span className="text-cyan-400 font-mono text-xs sm:text-sm">{user.sfCoins ?? 0}</span>
              <span className="text-cyan-500">♦</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-orange-500/10 rounded-md" title="PVP Coins">
              <span className="text-orange-400 font-mono text-xs sm:text-sm">{user.pvpCoins ?? 0}</span>
              <span className="text-orange-500">⚔</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-md" title="Guild Coins">
              <span className="text-emerald-400 font-mono text-xs sm:text-sm">{user.gc ?? 0}</span>
              <span className="text-emerald-500">GC</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 rounded-md">
              <span className="text-purple-400 font-mono text-xs sm:text-sm">Lv.{user.level ?? 1}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-2 py-1 hover:bg-dark-700 rounded-lg transition-colors cursor-pointer">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
                {(user.displayName || user.username)?.[0] ?? "?"}
              </div>
            )}
            <span className="text-sm hidden sm:inline">{user.displayName || user.username}</span>
          </div>

          <button onClick={onToggleChat} className="p-2 hover:bg-dark-700 rounded-lg transition-colors" title={t("chat", { defaultValue: "Chat" })}>
            <MessageSquare size={18} />
          </button>

          <button onClick={onLogout} className="p-2 hover:bg-dark-700 rounded-lg transition-colors text-gray-400 hover:text-red-400">
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
