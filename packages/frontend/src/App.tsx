import { Routes, Route, Navigate } from "react-router-dom";
import { GameLayout } from "./layouts/GameLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { CharacterSelectPage } from "./pages/CharacterSelectPage";
import { GamePage } from "./pages/GamePage";
import { useAuthStore } from "./stores/authStore";
import { useSocket } from "./hooks/useSocket";

export function App() {
  const { token, isAuthenticated, initializeAuth } = useAuthStore();
  const { connect } = useSocket();

  // Initialize auth on mount
  React.useEffect(() => {
    initializeAuth();
  }, []);

  // Connect socket when authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <CharacterSelectPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}