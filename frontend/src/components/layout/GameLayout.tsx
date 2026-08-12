import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../../services/api";
import { connectSocket, disconnectSocket, getSocket } from "../../services/socket";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ChatPanel } from "./ChatPanel";
import { OnboardingModal } from "../OnboardingModal";
import { PvpChallengeToast } from "../PvpChallengeToast";
import { CombatResumeBanner } from "../CombatResumeBanner";
import { useGameStore } from "../../store/gameStore";

export function GameLayout() {
  const { user, logout, accessToken, setUser } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const setCharacter = useGameStore((s) => s.setCharacter);

  useEffect(() => {
    if (!accessToken) return;
    connectSocket(accessToken);
    return () => disconnectSocket();
  }, [accessToken]);

  // Sync user data with the server on boot (persisted store may be stale)
  useEffect(() => {
    if (!accessToken) return;
    authApi
      .me()
      .then(({ data }) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  }, [accessToken, setUser]);

  useEffect(() => {
    const first = user?.characters?.[0];
    if (!first?.id) return;
    setCharacter(first);
    const socket = getSocket();
    const select = () => socket?.emit("character:select", first.id);
    if (socket?.connected) {
      select();
    } else {
      socket?.once("connect", select);
    }
    return () => {
      socket?.off("connect", select);
    };
  }, [user?.characters, setCharacter]);

  return (
    <div className="h-screen flex flex-col bg-dark-950 overflow-hidden">
      <TopBar
        user={user}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleChat={() => setChatOpen(!chatOpen)}
        onLogout={logout}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>

        {chatOpen && <ChatPanel />}
      </div>
      {user?.characters && user.characters.length > 0 && <OnboardingModal />}
      <PvpChallengeToast />
      <CombatResumeBanner />
    </div>
  );
}
