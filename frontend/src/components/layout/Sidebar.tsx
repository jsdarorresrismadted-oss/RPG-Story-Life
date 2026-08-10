import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Map, Sword, Backpack, ScrollText,
  Settings, Shield, MessageCircle, BookOpen, Trophy, ShoppingBag, Lock, Swords, Users, BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { questsApi } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { useGameStore } from "../../store/gameStore";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const { user } = useAuthStore();
  const inCombat = useGameStore((s) => s.inCombat);
  const { t } = useTranslation("sidebar");
  const [hasActiveQuest, setHasActiveQuest] = useState(false);

  const checkQuests = () => {
    questsApi
      .progress()
      .then(({ data }) => {
        const active = Array.isArray(data)
          ? data.some((p: any) => p.status === "active")
          : false;
        setHasActiveQuest(active);
      })
      .catch(() => setHasActiveQuest(false));
  };

  useEffect(() => {
    checkQuests();
    window.addEventListener("quests-changed", checkQuests);
    return () => window.removeEventListener("quests-changed", checkQuests);
  }, []);

  if (!isOpen) return null;

  const blocked = inCombat;
  const block = (e: React.MouseEvent) => {
    if (!blocked) return;
    e.preventDefault();
    toast.error("Você está em combate — termine a luta para navegar.");
  };

  const navItems = [
    { to: "/map", icon: Map, label: t("map") },
    { to: "/classes", icon: Sword, label: t("classes") },
    { to: "/inventory", icon: Backpack, label: t("inventory") },
    { to: "/guild", icon: Users, label: t("guild") },
    { to: "/ranking", icon: BarChart3, label: t("ranking") },
    { to: "/season", icon: Trophy, label: t("season") },
    { to: "/shop", icon: ShoppingBag, label: t("shop") },
    { to: "/arena", icon: Swords, label: t("arena") },
    ...(hasActiveQuest ? [{ to: "/quests", icon: ScrollText, label: t("quests") }] : []),
  ];

  return (
    <nav className="w-56 bg-dark-900/80 backdrop-blur-md border-r border-dark-700 flex flex-col py-4 overflow-y-auto shrink-0">
      {blocked && (
        <div className="px-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <Lock size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-300">Em combate — navegação bloqueada</p>
          </div>
        </div>
      )}
      <div className="px-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-dark-800 rounded-lg border border-dark-600">
          <Shield size={16} className="text-purple-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">Connected</p>
            <p className="text-xs font-mono text-green-400">Server #1</p>
          </div>
        </div>
      </div>

      <div className="space-y-1 px-2">
        <NavLink
          to="/"
          end
          onClick={block}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
              isActive
                ? "bg-gradient-to-r from-purple-600/20 to-blue-600/10 text-purple-300 border border-purple-500/20"
                : blocked
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-gray-200 hover:bg-dark-800/50"
            }`
          }
        >
          <LayoutDashboard size={18} />
          <span>{t("dashboard")}</span>
        </NavLink>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={block}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-purple-600/20 to-blue-600/10 text-purple-300 border border-purple-500/20"
                  : blocked
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:text-gray-200 hover:bg-dark-800/50"
              }`
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="mt-auto px-2 pt-4 border-t border-dark-700">
        <div className="space-y-1">
          <NavLink
            to="/settings"
            onClick={block}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive ? "text-purple-300 bg-dark-800/50" : blocked ? "text-gray-600 cursor-not-allowed" : "text-gray-400 hover:text-gray-200 hover:bg-dark-800/50"
              }`
            }
          >
            <Settings size={18} />
            <span>{t("settings")}</span>
          </NavLink>
          <NavLink
            to="/codex"
            onClick={block}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive ? "text-purple-300 bg-dark-800/50" : blocked ? "text-gray-600 cursor-not-allowed" : "text-gray-400 hover:text-gray-200 hover:bg-dark-800/50"
              }`
            }
          >
            <BookOpen size={18} />
            <span>{t("codex")}</span>
          </NavLink>
          <NavLink
            to="/support"
            onClick={block}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive ? "text-purple-300 bg-dark-800/50" : blocked ? "text-gray-600 cursor-not-allowed" : "text-gray-400 hover:text-gray-200 hover:bg-dark-800/50"
              }`
            }
          >
            <MessageCircle size={18} />
            <span>{t("support")}</span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
