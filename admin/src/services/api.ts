import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = new URL('./login', window.location.href).href;
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/admin/auth/login', { username, password }),
  logout: () => api.post('/admin/auth/logout'),
  me: () => api.get('/admin/auth/me'),
};

export const dashboardApi = {
  getStats: () => api.get('/admin/dashboard/stats'),
  getActivityLog: () => api.get('/admin/dashboard/activity'),
};

export const itemsApi = {
  getAll: (params?: any) => api.get('/admin/items', { params }),
  getById: (id: string) => api.get(`/admin/items/${id}`),
  create: (data: any) => api.post('/admin/items', data),
  update: (id: string, data: any) => api.put(`/admin/items/${id}`, data),
  delete: (id: string) => api.delete(`/admin/items/${id}`),
  bulkCreate: (items: any[]) => api.post('/admin/items/bulk', { items }),
};

export const classesApi = {
  getAll: (params?: any) => api.get('/admin/classes', { params }),
  getById: (id: string) => api.get(`/admin/classes/${id}`),
  create: (data: any) => api.post('/admin/classes', data),
  update: (id: string, data: any) => api.put(`/admin/classes/${id}`, data),
  delete: (id: string) => api.delete(`/admin/classes/${id}`),
};

export const skillsApi = {
  getAll: (params?: any) => api.get('/admin/skills', { params }),
  getById: (id: string) => api.get(`/admin/skills/${id}`),
  create: (data: any) => api.post('/admin/skills', data),
  update: (id: string, data: any) => api.put(`/admin/skills/${id}`, data),
  delete: (id: string) => api.delete(`/admin/skills/${id}`),
};

export const monstersApi = {
  getAll: (params?: any) => api.get('/admin/monsters', { params }),
  getById: (id: string) => api.get(`/admin/monsters/${id}`),
  create: (data: any) => api.post('/admin/monsters', data),
  update: (id: string, data: any) => api.put(`/admin/monsters/${id}`, data),
  delete: (id: string) => api.delete(`/admin/monsters/${id}`),
};

export const mapsApi = {
  getAll: (params?: any) => api.get('/admin/maps', { params }),
  getById: (id: string) => api.get(`/admin/maps/${id}`),
  create: (data: any) => api.post('/admin/maps', data),
  update: (id: string, data: any) => api.put(`/admin/maps/${id}`, data),
  delete: (id: string) => api.delete(`/admin/maps/${id}`),
};

export const npcsApi = {
  getAll: (params?: any) => api.get('/admin/npcs', { params }),
  getById: (id: string) => api.get(`/admin/npcs/${id}`),
  create: (data: any) => api.post('/admin/npcs', data),
  update: (id: string, data: any) => api.put(`/admin/npcs/${id}`, data),
  delete: (id: string) => api.delete(`/admin/npcs/${id}`),
};

export const questsApi = {
  getAll: (params?: any) => api.get('/admin/quests', { params }),
  getById: (id: string) => api.get(`/admin/quests/${id}`),
  create: (data: any) => api.post('/admin/quests', data),
  update: (id: string, data: any) => api.put(`/admin/quests/${id}`, data),
  delete: (id: string) => api.delete(`/admin/quests/${id}`),
};

export const lootTablesApi = {
  getAll: (params?: any) => api.get('/admin/loot-tables', { params }),
  getById: (id: string) => api.get(`/admin/loot-tables/${id}`),
  create: (data: any) => api.post('/admin/loot-tables', data),
  update: (id: string, data: any) => api.put(`/admin/loot-tables/${id}`, data),
  delete: (id: string) => api.delete(`/admin/loot-tables/${id}`),
};

export const eventsApi = {
  getAll: (params?: any) => api.get('/admin/events', { params }),
  getById: (id: string) => api.get(`/admin/events/${id}`),
  create: (data: any) => api.post('/admin/events', data),
  update: (id: string, data: any) => api.put(`/admin/events/${id}`, data),
  delete: (id: string) => api.delete(`/admin/events/${id}`),
};

export const buffsApi = {
  getAll: (params?: any) => api.get('/admin/buffs', { params }),
  getById: (id: string) => api.get(`/admin/buffs/${id}`),
  create: (data: any) => api.post('/admin/buffs', data),
  update: (id: string, data: any) => api.put(`/admin/buffs/${id}`, data),
  delete: (id: string) => api.delete(`/admin/buffs/${id}`),
};

export const craftingApi = {
  getAll: (params?: any) => api.get('/admin/crafting', { params }),
  getById: (id: string) => api.get(`/admin/crafting/${id}`),
  create: (data: any) => api.post('/admin/crafting', data),
  update: (id: string, data: any) => api.put(`/admin/crafting/${id}`, data),
  delete: (id: string) => api.delete(`/admin/crafting/${id}`),
};

export const titlesApi = {
  getAll: (params?: any) => api.get('/admin/titles', { params }),
  getById: (id: string) => api.get(`/admin/titles/${id}`),
  create: (data: any) => api.post('/admin/titles', data),
  update: (id: string, data: any) => api.put(`/admin/titles/${id}`, data),
  delete: (id: string) => api.delete(`/admin/titles/${id}`),
};

export const achievementsApi = {
  getAll: (params?: any) => api.get('/admin/achievements', { params }),
  getById: (id: string) => api.get(`/admin/achievements/${id}`),
  create: (data: any) => api.post('/admin/achievements', data),
  update: (id: string, data: any) => api.put(`/admin/achievements/${id}`, data),
  delete: (id: string) => api.delete(`/admin/achievements/${id}`),
};

export const playersApi = {
  search: (query: string) => api.get('/admin/players/search', { params: { query } }),
  getById: (id: string) => api.get(`/admin/players/${id}`),
  ban: (id: string, reason: string) => api.post(`/admin/players/${id}/ban`, { reason }),
  unban: (id: string) => api.post(`/admin/players/${id}/unban`),
  mute: (id: string, duration: number) => api.post(`/admin/players/${id}/mute`, { duration }),
  warn: (id: string, message: string) => api.post(`/admin/players/${id}/warn`, { message }),
  giveItem: (id: string, itemId: string, quantity: number) =>
    api.post(`/admin/players/${id}/give-item`, { itemId, quantity }),
  giveGold: (id: string, amount: number) =>
    api.post(`/admin/players/${id}/give-gold`, { amount }),
  giveXp: (id: string, amount: number) =>
    api.post(`/admin/players/${id}/give-xp`, { amount }),
};

export const guildsApi = {
  getAll: (params?: any) => api.get('/admin/guilds', { params }),
  getById: (id: string) => api.get(`/admin/guilds/${id}`),
  disband: (id: string) => api.delete(`/admin/guilds/${id}`),
  moderateChat: (id: string, action: string) =>
    api.post(`/admin/guilds/${id}/moderate`, { action }),
};

export const auditApi = {
  getAll: (params?: any) => api.get('/admin/audit', { params }),
};

export const systemApi = {
  getConfig: () => api.get('/admin/system/config'),
  updateConfig: (data: any) => api.put('/admin/system/config', data),
  toggleMaintenance: () => api.post('/admin/system/maintenance'),
  updateSeason: (data: any) => api.put('/admin/system/season', data),
};

export const aiApi = {
  adjust: (domain: string, prompt: string) => api.post('/admin/ai/adjust', { domain, prompt }),
  adjustApply: (domain: string, updates: any[], deletes: any[]) =>
    api.post('/admin/ai/adjust/apply', { domain, updates, deletes }),
};

export default api;
