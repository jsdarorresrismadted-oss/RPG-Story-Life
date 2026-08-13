import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/api';
import type { Character } from '../types';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: string;
  avatar?: string | null;
  level?: number;
  gold?: number;
  sfCoins?: number;
  pvpCoins?: number;
  gc?: number;
  vipUntil?: string | null;
  vipOwned?: boolean;
  experience?: number;
  isOnline?: boolean;
  createdAt?: string;
  characters?: Character[];
}

interface AuthStore {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; password: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authApi.login({ username, password });
          set({
            isAuthenticated: true,
            user: data.user,
            accessToken: data.token,
            refreshToken: data.token,
            isLoading: false,
          });
        } catch (err: any) {
          set({ isLoading: false, error: err.response?.data?.error || err.message || 'Falha no login' });
          throw err;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const { data: res } = await authApi.register(data);
          set({
            isAuthenticated: true,
            user: res.user,
            accessToken: res.token,
            refreshToken: res.token,
            isLoading: false,
          });
        } catch (err: any) {
          set({ isLoading: false, error: err.response?.data?.error || err.message || 'Falha no registro' });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Ignore network errors on logout
        }
        set({ isAuthenticated: false, user: null, accessToken: null, refreshToken: null, error: null });
      },

      setAuth: (user, accessToken) =>
        set({ isAuthenticated: true, user, accessToken, refreshToken: accessToken, error: null }),
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      updateToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'rpg-auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
