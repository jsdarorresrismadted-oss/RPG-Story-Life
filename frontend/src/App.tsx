import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { GameLayout } from './components/layout/GameLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { MapPage } from './pages/MapPage';
import { InventoryPage } from './pages/InventoryPage';
import { ClassPage } from './pages/ClassPage';
import { QuestPage } from './pages/QuestPage';
import { GuildPage } from './pages/GuildPage';
import { MarketPage } from './pages/MarketPage';
import { CombatPage } from './pages/CombatPage';
import { CreateCharacterPage } from './pages/CreateCharacterPage';
import { SettingsPage } from './pages/SettingsPage';
import { CodexPage } from './pages/CodexPage';
import { SupportPage } from './pages/SupportPage';
import { SeasonPage } from './pages/SeasonPage';
import { ShopPage } from './pages/ShopPage';
import { RankingPage } from './pages/RankingPage';
import CharPage from './pages/CharPage';
import { ArenaPage } from './pages/ArenaPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function CharacterGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const hasCharacter = !!user?.characters && user.characters.length > 0;
  if (!hasCharacter && location.pathname !== "/character/create") {
    return <Navigate to="/character/create" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/character/create" element={<ProtectedRoute><CreateCharacterPage /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><GameLayout /></ProtectedRoute>}>
        <Route index element={<CharacterGate><Navigate to="/dashboard" replace /></CharacterGate>} />
        <Route path="dashboard" element={<CharacterGate><DashboardPage /></CharacterGate>} />
        <Route path="map" element={<CharacterGate><MapPage /></CharacterGate>} />
        <Route path="map/:slug" element={<CharacterGate><MapPage /></CharacterGate>} />
        <Route path="inventory" element={<CharacterGate><InventoryPage /></CharacterGate>} />
        <Route path="classes" element={<CharacterGate><ClassPage /></CharacterGate>} />
        <Route path="class/:slug" element={<CharacterGate><ClassPage /></CharacterGate>} />
        <Route path="quests" element={<CharacterGate><QuestPage /></CharacterGate>} />
        <Route path="guild" element={<CharacterGate><GuildPage /></CharacterGate>} />
        <Route path="market" element={<CharacterGate><MarketPage /></CharacterGate>} />
        <Route path="combat" element={<CharacterGate><CombatPage /></CharacterGate>} />
        <Route path="combat/:monsterId" element={<CharacterGate><CombatPage /></CharacterGate>} />
        <Route path="settings" element={<CharacterGate><SettingsPage /></CharacterGate>} />
        <Route path="codex" element={<CharacterGate><CodexPage /></CharacterGate>} />
        <Route path="support" element={<CharacterGate><SupportPage /></CharacterGate>} />
        <Route path="season" element={<CharacterGate><SeasonPage /></CharacterGate>} />
        <Route path="shop" element={<CharacterGate><ShopPage /></CharacterGate>} />
        <Route path="arena" element={<CharacterGate><ArenaPage /></CharacterGate>} />
        <Route path="ranking" element={<CharacterGate><RankingPage /></CharacterGate>} />
        <Route path="player/:username" element={<CharacterGate><CharPage /></CharacterGate>} />
      </Route>
    </Routes>
  );
}
