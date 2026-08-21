import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { PageHeader, Button, Card, Badge } from "../components/ui";
import {
  Users,
  Shield,
  Package,
  Swords,
  ScrollText,
  Skull,
  RefreshCw,
  Gamepad2,
  Sparkles,
  Map as MapIcon,
  Contact,
  Hammer,
  ShoppingBag,
  CalendarDays,
} from "lucide-react";

interface Stats {
  totalUsers?: number;
  totalCharacters?: number;
  totalGuilds?: number;
  totalClasses?: number;
  totalItems?: number;
  totalMonsters?: number;
  totalMaps?: number;
  totalQuests?: number;
  totalSkills?: number;
  totalEffects?: number;
  totalStatModels?: number;
  totalNpcs?: number;
  totalCrafts?: number;
  totalShops?: number;
  totalEvents?: number;
  activePlayers?: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | undefined;
  icon: any;
  color: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold font-mono">{value ?? "-"}</p>
        <p className="text-xs text-gray-400 truncate">{label}</p>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.stats();
      setStats(data);
    } catch {
      setStats({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sections = [
    {
      title: "Players",
      cards: [
        { label: "Users", value: stats.totalUsers, icon: Users, color: "from-blue-500 to-blue-600" },
        { label: "Characters", value: stats.totalCharacters, icon: Gamepad2, color: "from-purple-500 to-purple-600" },
        { label: "Guilds", value: stats.totalGuilds, icon: Swords, color: "from-amber-500 to-amber-600" },
      ],
    },
    {
      title: "Game",
      cards: [
        { label: "Classes", value: stats.totalClasses, icon: Shield, color: "from-green-500 to-green-600" },
        { label: "Items", value: stats.totalItems, icon: Package, color: "from-cyan-500 to-cyan-600" },
        { label: "Skills", value: stats.totalSkills, icon: Sparkles, color: "from-yellow-500 to-yellow-600" },
        { label: "Effects", value: stats.totalEffects, icon: Sparkles, color: "from-pink-500 to-pink-600" },
        { label: "Stat Models", value: stats.totalStatModels, icon: Shield, color: "from-lime-500 to-lime-600" },
      ],
    },
    {
      title: "World",
      cards: [
        { label: "Maps", value: stats.totalMaps, icon: MapIcon, color: "from-emerald-500 to-emerald-600" },
        { label: "Monsters", value: stats.totalMonsters, icon: Skull, color: "from-red-500 to-red-600" },
        { label: "NPCs", value: stats.totalNpcs, icon: Contact, color: "from-teal-500 to-teal-600" },
        { label: "Quests", value: stats.totalQuests, icon: ScrollText, color: "from-indigo-500 to-indigo-600" },
        { label: "Events", value: stats.totalEvents, icon: CalendarDays, color: "from-rose-500 to-rose-600" },
      ],
    },
    {
      title: "Economy",
      cards: [
        { label: "Shops", value: stats.totalShops, icon: ShoppingBag, color: "from-orange-500 to-orange-600" },
        { label: "Crafts", value: stats.totalCrafts, icon: Hammer, color: "from-slate-500 to-slate-600" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do conteúdo do jogo"
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      <div className="flex items-center gap-2 text-sm">
        <Badge tone="green">● {stats.activePlayers ?? 0} online</Badge>
        <span className="text-gray-500">usuários ativos no momento</span>
      </div>

      {loading && !stats.totalUsers ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-600 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">
              {section.title}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {section.cards.map((c) => (
                <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
