import { NavLink } from 'react-router-dom';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [{ to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' }],
  },
  {
    title: 'Game',
    items: [
      { to: '/classes', icon: <Sword size={18} />, label: 'Classes' },
      { to: '/items', icon: <Box size={18} />, label: 'Items' },
      { to: '/skills', icon: <Zap size={18} />, label: 'Skills' },
      { to: '/effects', icon: <Activity size={18} />, label: 'Effects' },
      { to: '/statModels', icon: <Gauge size={18} />, label: 'Stat Models' },
    ],
  },
  {
    title: 'World',
    items: [
      { to: '/maps', icon: <Map size={18} />, label: 'Maps' },
      { to: '/monsters', icon: <Skull size={18} />, label: 'Monsters' },
      { to: '/npcs', icon: <Contact size={18} />, label: 'NPCs' },
      { to: '/quests', icon: <ScrollText size={18} />, label: 'Quests' },
      { to: '/events', icon: <CalendarDays size={18} />, label: 'Events' },
    ],
  },
  {
    title: 'Economy',
    items: [
      { to: '/shops', icon: <ShoppingBag size={18} />, label: 'Lojas (NPCs)' },
      { to: '/craftRecipes', icon: <Hammer size={18} />, label: 'Craft (receitas)' },
      { to: '/enchantments', icon: <Sparkles size={18} />, label: 'Encantamentos' },
      { to: '/shopProducts', icon: <ShoppingCart size={18} />, label: 'Loja do Game' },
      { to: '/boosters', icon: <Dices size={18} />, label: 'Gacha (Anéis/Colares)' },
      { to: '/gacha', icon: <Gem size={18} />, label: 'Gacha Config' },
    ],
  },
  {
    title: 'Players',
    items: [
      { to: '/users', icon: <Users size={18} />, label: 'Users' },
      { to: '/codes', icon: <Ticket size={18} />, label: 'Redeem Codes' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/seasons', icon: <Trophy size={18} />, label: 'Season Pass' },
      { to: '/limits', icon: <Scale size={18} />, label: 'Limits' },
      { to: '/patchNotes', icon: <Newspaper size={18} />, label: 'Patch Notes' },
      { to: '/guild-settings', icon: <Swords size={18} />, label: 'Guild Settings' },
    ],
  },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <aside
      className={`bg-dark-900 border-r border-dark-700 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="p-4 border-b border-dark-700 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Sword size={20} className="text-accent-400 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-accent-400 truncate">RPG Story Life</h1>
              <p className="text-[10px] text-gray-500 truncate">Admin Panel</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className={`text-gray-500 hover:text-white transition-colors ${collapsed ? 'mx-auto' : ''}`}
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-accent-600/20 text-accent-400 font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-dark-700'
                    }`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-dark-700">
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center text-xs font-bold shrink-0">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
