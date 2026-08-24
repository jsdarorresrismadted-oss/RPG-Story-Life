import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  role: string;
  createdAt: string;
}

interface Character {
  id: string;
  name: string;
  level: number;
  class: { name: string; slug: string; icon?: string };
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  characters: Character[];
  selectedCharacter: Character | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setCharacters: (characters: Character[]) => void;
  selectCharacter: (character: Character) => void;
  refreshAccessToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      characters: [],
      selectedCharacter: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (username: string, password: string) => {
        const { data } = await api.post("/api/auth/login", { username, password });
        const { user, accessToken } = data;

        set({
          token: accessToken,
          refreshToken: data.refreshToken, // from cookie
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      register: async (username: string, email: string, password: string, displayName?: string) => {
        const { data } = await api.post("/api/auth/register", { username, email, password, displayName });
        const { user, accessToken } = data;

        set({
          token: accessToken,
          user,
          isAuthenticated: true,
        });
      },

      logout: async () => {
        await api.post("/api/auth/logout");
        set({
          token: null,
          refreshToken: null,
          user: null,
          characters: [],
          selectedCharacter: null,
          isAuthenticated: false,
        });
      },

      initializeAuth: async () => {
        try {
          // Check if we have a stored token
          const token = get().token;
          if (!token) {
            set({ isLoading: false });
            return;
          }

          const { data } = await api.get("/api/auth/me");
          set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
          // Token invalid, clear auth
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },

      setCharacters: (characters: any[]) => set({ characters }),

      selectCharacter: (character: any) => set({ selectedCharacter: character }),

      refreshAccessToken: async () => {
        try {
          const { data } = await api.post("/api/auth/refresh");
          set({ token: data.accessToken });
        } catch {
          get().logout();
        }
      },
    }),
    {
      name: "rpg-auth",
      partialize: (state) => {
        return {
          token: state.token,
          refreshToken: state.refreshToken,
          user: state.user,
        };
      },
    }
  )
);

// API client
import axios from "axios";

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