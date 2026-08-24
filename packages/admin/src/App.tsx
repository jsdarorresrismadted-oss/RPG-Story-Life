import { Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "./layouts/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ItemsPage } from "./pages/ItemsPage";
import { NpcsPage } from "./pages/NpcsPage";
import { QuestsPage } from "./pages/QuestsPage";
import { MapsPage } from "./pages/MapsPage";
import { MonstersPage } from "./pages/MonstersPage";
import { ClassesPage } from "./pages/ClassesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { EffectsPage } from "./pages/EffectsPage";
import { EnchantmentsPage } from "./pages/EnchantmentsPage";
import { ShopsPage } from "./pages/ShopsPage";
import { EventsPage } from "./pages/EventsPage";
import { WorldBossesPage } from "./pages/WorldBossesPage";
import { GuildsPage } from "./pages/GuildsPage";
import { GuildSettingsPage } from "./pages/GuildSettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { CodesPage } from "./pages/CodesPage";
import { LimitsPage } from "./pages/LimitsPage";
import { GachaPage } from "./pages/GachaPage";
import { SeasonsPage } from "./pages/SeasonsPage";
import { AiHubPage } from "./pages/AiHubPage";
import { AiChatPage } from "./pages/AiChatPage";
import { PatchNotesPage } from "./pages/PatchNotesPage";
import { useAuthStore } from "./stores/authStore";

export function App() {
  const { isAuthenticated, initializeAuth } = useAuthStore();

  React.useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={isAuthenticated ? <AdminLayout /> : <Navigate to="/login" replace />}
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/npcs" element={<NpcsPage />} />
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/maps" element={<MapsPage />} />
        <Route path="/monsters" element={<MonstersPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/effects" element={<EffectsPage />} />
        <Route path="/enchantments" element={<EnchantmentsPage />} />
        <Route path="/shops" element={<ShopsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/worldbosses" element={<WorldBossesPage />} />
        <Route path="/guilds" element={<GuildsPage />} />
        <Route path="/guild-settings" element={<GuildSettingsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/codes" element={<CodesPage />} />
        <Route path="/limits" element={<LimitsPage />} />
        <Route path="/gacha" element={<GachaPage />} />
        <Route path="/seasons" element={<SeasonsPage />} />
        <Route path="/ai" element={<AiHubPage />} />
        <Route path="/ai/chat" element={<AiChatPage />} />
        <Route path="/patch-notes" element={<PatchNotesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}