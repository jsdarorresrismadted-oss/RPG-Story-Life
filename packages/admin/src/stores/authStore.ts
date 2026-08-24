import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (username: string, password: string) => {
        const { data } = await api.post("/api/admin/auth/login", { username, password });
        set({
          token: data.accessToken,
          user: data.user,
          isAuthenticated: true,
        });
      },

      logout: async () => {
        await api.post("/api/admin/auth/logout");
        set({ token: null, user: null, isAuthenticated: false });
      },

      initializeAuth: async () => {
        try {
          const token = get().token;
          if (!token) {
            set({ isLoading: false });
            return;
          }

          const { data } = await api.get("/api/admin/auth/me");
          set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },

      refreshAccessToken: async () => {
        try {
          const { data } = await api.post("/api/admin/auth/refresh");
          set({ token: data.accessToken });
        } catch {
          get().logout();
        }
      },
    }),
    {
      name: "rpg-admin-auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      },
    }
  )
);

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await useAuthStore.getState().refreshAccessToken();
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);