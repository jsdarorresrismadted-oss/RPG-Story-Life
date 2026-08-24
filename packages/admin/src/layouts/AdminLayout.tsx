import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Sword,
  Users,
  Zap,
  Skull,
  Map,
  ScrollText,
  Box,
  Activity,
  Wrench,
  Swords,
  Ticket,
  LogOut,
  Scale,
  Gauge,
  Contact,
  ShoppingBag,
  Sparkles,
  ShoppingCart,
  Newspaper,
  Dices,
  Gem,
  Hammer,
  CalendarDays,
  Trophy,
  Brain,
  MessageSquare,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
  {
    to: "/items",
    icon: <Sword size={18} />,
    label: "Itens",
  },
  { to: "/npcs", icon: <Users size={18} />, label: "NPCs" },
  { to: "/quests", icon: <ScrollText size={18} />, label: "Quests" },
  { to: "/maps", icon: <Map size={18} />, label: "Mapas" },
  { to: "/monsters", icon: <Skull size={18} />, label: "Monstros" },
  { to: "/classes", icon: <Sword size={18} />, label: "Classes" },
  { to: "/skills", icon: <Zap size={18} />, label: "Skills" },
  { to: "/effects", icon: <Activity size={18} />, label: "Efeitos" },
  { to: "/enchantments", icon: <Gem size={18} />, label: "Encantamentos" },
  { to: "/shops", icon: <ShoppingBag size={18} />, label: "Shops" },
  { to: "/events", icon: <CalendarDays size={18} />, label: "Eventos" },
  { to: "/worldbosses", icon: <Skull size={18} />, label: "World Bosses" },
  { to: "/guilds", icon: <Swords size={18} />, label: "Guilds" },
  { to: "/users", icon: <Users size={18} />, label: "Users" },
  { to: "/codes", icon: <Ticket size={18} />, label: "Redeem Codes" },
  { to: "/limits", icon: <Scale size={18} />, label: "Limits" },
  { to: "/gacha", icon: <Dices size={18} />, label: "Gacha" },
  { to: "/seasons", icon: <Trophy size={18} />, label: "Season Pass" },
  { to: "/ai", icon: <Brain size={18} />, label: "AI Game Master" },
  { to: "/ai/chat", icon: <MessageSquare size={18} />, label: "AI Chat" },
  { to: "/worldbosses", icon: <Skull size={18} />, label: "World Bosses" },
  { to: "/patch-notes", icon: <Newspaper size={18} />, label: "Patch Notes" },
  { to: "/guild-settings", icon: <Swords size={18} />, label: "Guild Settings" },
];

export function AdminLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full bg-gray-800 border-r border-gray-700 transition-all duration-300 z-40 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⚔️</span>
              </div>
              <span className="text-xl font-bold text-yellow-400">Admin Panel</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            {collapsed ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-yellow-400/20 text-yellow-400"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )}

          {/* Logout */}
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-red-400 transition-colors"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sair</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 ml-${collapsed ? "16" : "64"} min-h-screen bg-gray-900 transition-all duration-300`}
      >
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <h1 className="text-2xl font-bold text-yellow-400">{document.title || "Admin Panel"}</h1>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </main>
    </div>
  );
}

export default AdminLayout;