import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Sword,
  Map,
  Skull,
  ScrollText,
  Box,
  Users as UsersIcon,
  Sparkles,
  Trophy,
  Brain,
  TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";

interface Stats {
  users: number;
  characters: number;
  items: number;
  monsters: number;
  maps: number;
  quests: number;
  npcs: number;
  guilds: number;
  events: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [
        usersRes,
        charsRes,
        itemsRes,
        monstersRes,
        mapsRes,
        questsRes,
        npcsRes,
        guildsRes,
        eventsRes,
      ] = await Promise.all([
        api.get("/api/admin/users?limit=1"),
        api.get("/api/characters/my"),
        api.get("/api/admin/items?limit=1"),
        api.get("/api/admin/monsters?limit=1"),
        api.get("/api/admin/maps?limit=1"),
        api.get("/api/admin/quests?limit=1"),
        api.get("/api/admin/npcs?limit=1"),
        api.get("/api/admin/guilds?limit=1"),
        api.get("/api/admin/events?limit=1"),
      ]);

      setStats({
        users: usersRes.data.total || 0,
        characters: 0, // Would need separate endpoint
        items: itemsRes.data.total || 0,
        monsters: monstersRes.data.total || 0,
        maps: mapsRes.data.total || 0,
        quests: questsRes.data.total || 0,
        npcs: npcsRes.data.total || 0,
        guilds: guildsRes.data.total || 0,
        events: eventsRes.data.total || 0,
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const statsCards = [
    { label: "Usuários", value: stats?.users || 0, icon: Users, color: "text-blue-400", bg: "bg-blue-400/20" },
    { label: "Itens", value: stats?.items || 0, icon: Box, color: "text-purple-400", bg: "bg-purple-400/20" },
    { label: "Monstros", value: stats?.monsters || 0, icon: Skull, color: "text-red-400", bg: "bg-red-400/20" },
    { label: "Mapas", value: stats?.maps || 0, icon: Map, color: "text-green-400", bg: "bg-green-400/20" },
    { label: "Quests", value: stats?.quests || 0, icon: ScrollText, color: "text-yellow-400", bg: "bg-yellow-400/20" },
    { label: "NPCs", value: stats?.npcs || 0, icon: UsersIcon, color: "text-cyan-400", bg: "bg-cyan-400/20" },
    { label: "Guilds", value: stats?.guilds || 0, icon: UsersIcon, color: "text-orange-400", bg: "bg-orange-400/20" },
    { label: "Eventos", value: stats?.events || 0, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-400/20" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-400 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-yellow-400">Dashboard</h1>
        <div className="text-gray-400">Visão geral do jogo</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        {statsCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="bg-gray-800 border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{label}</p>
                  <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-lg ${bg}`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-yellow-400">AI Master Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-gray-300">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
              <span>AI Master rodando (Ciclo ativo)</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-700 p-3 rounded">
                <p className="text-gray-400">Ciclos executados</p>
                <p className="text-2xl font-bold text-white">0</p>
              </div>
              <div className="bg-gray-700 p-3 rounded">
                <p className="text-gray-400">Ações executadas</p>
                <p className="text-2xl font-bold text-white">0</p>
              </div>
              <div className="bg-gray-700 p-3 rounded">
                <p className="text-gray-400">Último ciclo</p>
                <p className="text-2xl font-bold text-white">-</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-yellow-400">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a href="/ai" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <Brain className="w-5 h-5 text-yellow-400" />
              <span>Ir para AI Master</span>
            </a>
            <a href="/items" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <Sword className="w-5 h-5 text-purple-400" />
              <span>Gerenciar Itens</span>
            </a>
            <a href="/maps" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <Map className="w-5 h-5 text-green-400" />
              <span>Gerenciar Mapas</span>
            </a>
            <a href="/quests" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-yellow-400" />
              <span>Gerenciar Quests</span>
            </a>
            <a href="/monsters" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <Skull className="w-5 h-5 text-red-400" />
              <span>Gerenciar Monstros</span>
            </a>
            <a href="/npcs" className="block p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>Gerenciar NPCs</span>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}