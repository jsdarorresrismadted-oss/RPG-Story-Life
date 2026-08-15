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
    title: 'Painel',
    items: [{ to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' }],
  },
  {
    title: 'Conteúdo do Jogo',
    items: [
      { to: '/classes', icon: <Sword size={18} />, label: 'Classes' },
      { to: '/skills', icon: <Zap size={18} />, label: 'Skills' },
      { to: '/items', icon: <Box size={18} />, label: 'Items' },
      { to: '/enchantments', icon: <Sparkles size={18} />, label: 'Encantamentos' },
      { to: '/monsters', icon: <Skull size={18} />, label: 'Monstros' },
      { to: '/maps', icon: <Map size={18} />, label: 'Mapas' },
      { to: '/events', icon: <CalendarDays size={18} />, label: 'Eventos' },
      { to: '/quests', icon: <ScrollText size={18} />, label: 'Quests' },
      { to: '/effects', icon: <Activity size={18} />, label: 'Effects' },
      { to: '/npcs', icon: <Contact size={18} />, label: 'NPCs' },
      { to: '/shops', icon: <ShoppingBag size={18} />, label: 'Lojas (NPCs)' },
      { to: '/craftRecipes', icon: <Hammer size={18} />, label: 'Craft (receitas)' },
    ],
  },
  {
    title: 'Loja & Gacha',
    items: [
      { to: '/shopProducts', icon: <ShoppingCart size={18} />, label: 'Loja do Game' },
      { to: '/boosters', icon: <Dices size={18} />, label: 'Gacha (Anéis/Colares)' },
      { to: '/gacha', icon: <Gem size={18} />, label: 'Gacha Config' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/seasons', icon: <Trophy size={18} />, label: 'Season Pass' },
      { to: '/statModels', icon: <Gauge size={18} />, label: 'Stat Models' },
      { to: '/patchNotes', icon: <Newspaper size={18} />, label: 'Patch Notes' },
      { to: '/users', icon: <Users size={18} />, label: 'Users' },
      { to: '/codes', icon: <Ticket size={18} />, label: 'Redeem Codes' },
      { to: '/guild-settings', icon: <Swords size={18} />, label: 'Guild Settings' },
      { to: '/limits', icon: <Scale size={18} />, label: 'Limits' },
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col h-screen fixed left-0 top-0 z-50">
      <div className="p-4 border-b border-dark-700">
        <h1 className="text-lg font-bold text-accent-400 flex items-center gap-2">
          <Sword size={20} />
          RPG Story Life
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-accent-600/20 text-accent-400 font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-dark-700'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-dark-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center text-xs font-bold">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
