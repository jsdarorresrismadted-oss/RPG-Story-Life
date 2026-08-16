import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import CodesPage from "./pages/CodesPage";
import GuildSettingsPage from "./pages/GuildSettingsPage";
import LimitsPage from "./pages/LimitsPage";
import SkillsPage from "./pages/SkillsPage";
import EffectsPage from "./pages/EffectsPage";
import ShopsPage from "./pages/ShopsPage";
import EnchantmentsPage from "./pages/EnchantmentsPage";
import MonsterPage from "./pages/MonstersPage";
import NpcsPage from "./pages/NpcsPage";
import QuestsPage from "./pages/QuestsPage";
import MapsPage from "./pages/MapsPage";
import EventsPage from "./pages/EventsPage";
import GachaPage from "./pages/GachaPage";
import SeasonsPage from "./pages/SeasonsPage";
import CrudPage from "./pages/CrudPage";
import { crudConfigs } from "./crudConfigs";
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        {crudConfigs.map((config) => (
          <Route
            key={config.key}
            path={`/${config.key}`}
            element={<CrudPage config={config} />}
          />
        ))}
        <Route path="/enchantments" element={<EnchantmentsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/effects" element={<EffectsPage />} />
        <Route path="/shops" element={<ShopsPage />} />
        <Route path="/monsters" element={<MonsterPage />} />
        <Route path="/npcs" element={<NpcsPage />} />
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/maps" element={<MapsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/codes" element={<CodesPage />} />
        <Route path="/guild-settings" element={<GuildSettingsPage />} />
        <Route path="/gacha" element={<GachaPage />} />
        <Route path="/seasons" element={<SeasonsPage />} />
        <Route path="/limits" element={<LimitsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
