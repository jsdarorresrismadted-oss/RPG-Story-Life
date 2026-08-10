import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_user");
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = new URL("./login", window.location.href).href;
      }
    }
    const data = error.response?.data;
    if (data?.error && !data.message) {
      error.response.data = { ...data, message: data.error };
    }
    return Promise.reject(error);
  }
);

export default api;

export const adminApi = {
  auth: {
    login: (username: string, password: string) =>
      api.post("/admin/auth/login", { username, password }),
    me: () => api.get("/admin/auth/me"),
  },
  settings: {
    guild: () => api.get("/admin/settings/guild"),
    updateGuild: (data: any) => api.put("/admin/settings/guild", data),
    limits: () => api.get("/admin/settings/limits"),
    updateLimits: (data: any) => api.put("/admin/settings/limits", data),
  },
  classes: {
    list: () => api.get("/admin/classes"),
    create: (data: any) => api.post("/admin/classes", data),
    update: (id: string, data: any) => api.put(`/admin/classes/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/classes/${id}`, { params }),
    generate: (data: { prompt: string; count?: number }) => api.post("/admin/classes/generate", data),
    aiConfig: () => api.get("/admin/ai/config"),
    activate: (id: string) => api.post(`/admin/classes/${id}/activate`),
    activateAll: () => api.post("/admin/classes/activate-all"),
  },
  items: {
    list: () => api.get("/admin/items"),
    create: (data: any) => api.post("/admin/items", data),
    update: (id: string, data: any) => api.put(`/admin/items/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/items/${id}`, { params }),
    generate: (data: any) => api.post("/admin/items/generate", data),
  },
  ai: {
    config: () => api.get("/admin/ai/config"),
    generateMonster: (prompt: string) => api.post("/admin/monsters/generate", { prompt }),
    generateRaid: (prompt: string) => api.post("/admin/raids/generate", { prompt }),
    generatePvp: (prompt: string) => api.post("/admin/pvp/generate", { prompt }),
  },
  monsters: {
    list: () => api.get("/admin/monsters"),
    create: (data: any) => api.post("/admin/monsters", data),
    update: (id: string, data: any) => api.put(`/admin/monsters/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/monsters/${id}`, { params }),
    drops: {
      list: (monsterId: string) => api.get(`/admin/monsters/${monsterId}/drops`),
      create: (monsterId: string, data: any) => api.post(`/admin/monsters/${monsterId}/drops`, data),
      update: (dropId: string, data: any) => api.put(`/admin/monsters/drops/${dropId}`, data),
      delete: (dropId: string) => api.delete(`/admin/monsters/drops/${dropId}`),
    },
  },
  maps: {
    list: () => api.get("/admin/maps"),
    create: (data: any) => api.post("/admin/maps", data),
    update: (id: string, data: any) => api.put(`/admin/maps/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/maps/${id}`, { params }),
  },
  quests: {
    list: () => api.get("/admin/quests"),
    create: (data: any) => api.post("/admin/quests", data),
    update: (id: string, data: any) => api.put(`/admin/quests/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/quests/${id}`, { params }),
  },
  skills: {
    list: (classId: string) => api.get(`/admin/classes/${classId}/skills`),
    create: (classId: string, data: any) => api.post(`/admin/classes/${classId}/skills`, data),
    update: (id: string, data: any) => api.put(`/admin/skills/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/skills/${id}`, { params }),
  },
  passives: {
    list: (classId: string) => api.get(`/admin/classes/${classId}/passives`),
    create: (classId: string, data: any) => api.post(`/admin/classes/${classId}/passives`, data),
    update: (id: string, data: any) => api.put(`/admin/passives/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/passives/${id}`, { params }),
  },
  statModels: {
    list: () => api.get("/admin/statmodels"),
    create: (data: any) => api.post("/admin/statmodels", data),
    update: (id: string, data: any) => api.put(`/admin/statmodels/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/statmodels/${id}`, { params }),
  },
  effects: {
    list: () => api.get("/admin/effects"),
    create: (data: any) => api.post("/admin/effects", data),
    update: (id: string, data: any) => api.put(`/admin/effects/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/effects/${id}`, { params }),
  },
  stats: () => api.get("/admin/stats"),
  users: {
    list: () => api.get("/admin/users"),
    get: (id: string) => api.get(`/admin/users/${id}`),
    update: (id: string, data: any) => api.put(`/admin/users/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/users/${id}`, { params }),
    characters: {
      update: (userId: string, characterId: string, data: any) =>
        api.put(`/admin/users/${userId}/characters/${characterId}`, data),
      rankMax: (userId: string, characterId: string) =>
        api.post(`/admin/users/${userId}/characters/${characterId}/rank-max`),
    },
    inventory: {
      list: (userId: string) => api.get(`/admin/users/${userId}/inventory`),
      add: (userId: string, data: any) => api.post(`/admin/users/${userId}/inventory`, data),
      remove: (userId: string, inventoryId: string) =>
        api.delete(`/admin/users/${userId}/inventory/${inventoryId}`),
    },
  },
  codes: {
    list: () => api.get("/admin/codes"),
    create: (data: any) => api.post("/admin/codes", data),
    update: (id: string, data: any) => api.put(`/admin/codes/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/codes/${id}`, { params }),
  },
  npcs: {
    list: () => api.get("/admin/npcs"),
    create: (data: any) => api.post("/admin/npcs", data),
    update: (id: string, data: any) => api.put(`/admin/npcs/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/npcs/${id}`, { params }),
  },
  shopItems: {
    list: () => api.get("/admin/shopitems"),
    create: (data: any) => api.post("/admin/shopitems", data),
    update: (id: string, data: any) => api.put(`/admin/shopitems/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/shopitems/${id}`, { params }),
  },
  mapNpcs: {
    list: () => api.get("/admin/mapnpcs"),
    create: (data: any) => api.post("/admin/mapnpcs", data),
    update: (id: string, data: any) => api.put(`/admin/mapnpcs/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/mapnpcs/${id}`, { params }),
  },
  mapMonsters: {
    list: () => api.get("/admin/mapmonsters"),
    create: (data: any) => api.post("/admin/mapmonsters", data),
    update: (id: string, data: any) => api.put(`/admin/mapmonsters/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/mapmonsters/${id}`, { params }),
  },
  enchantments: {
    list: () => api.get("/admin/enchantments"),
    create: (data: any) => api.post("/admin/enchantments", data),
    update: (id: string, data: any) => api.put(`/admin/enchantments/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/enchantments/${id}`, { params }),
    progression: (id: string) => api.get(`/admin/enchantments/${id}/progression`),
  },
  shopProducts: {
    list: () => api.get("/admin/shop-products"),
    create: (data: any) => api.post("/admin/shop-products", data),
    update: (id: string, data: any) => api.put(`/admin/shop-products/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/shop-products/${id}`, { params }),
  },
  patchNotes: {
    list: () => api.get("/admin/patch-notes"),
    create: (data: any) => api.post("/admin/patch-notes", data),
    update: (id: string, data: any) => api.put(`/admin/patch-notes/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/patch-notes/${id}`, { params }),
  },
  boosters: {
    list: () => api.get("/admin/boosters"),
    create: (data: any) => api.post("/admin/boosters", data),
    update: (id: string, data: any) => api.put(`/admin/boosters/${id}`, data),
    delete: (id: string, params?: any) => api.delete(`/admin/boosters/${id}`, { params }),
  },
  gachaConfig: {
    get: () => api.get("/admin/gacha-config"),
    update: (data: any) => api.put("/admin/gacha-config", data),
  },
  bulkDelete: (key: string, ids: string[], tipo: number) =>
    api.post("/admin/bulk-delete", { key, ids, tipo }),
};
