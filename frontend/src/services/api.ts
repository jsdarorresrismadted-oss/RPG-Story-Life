import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  register: (data: { username: string; password: string; email?: string }) =>
    api.post("/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post("/auth/login", data),
  logout: () =>
    api.post("/auth/logout"),
  me: () =>
    api.get("/auth/me"),
  updateMe: (data: { displayName?: string; avatar?: string }) =>
    api.put("/auth/me", data),
};

export const charactersApi = {
  index: () => api.get("/characters/index"),
  create: (data: { name: string; classId: string; gender?: "male" | "female" | "other" }) =>
    api.post("/characters", data),
  my: () => api.get("/characters/my"),
  rankUp: () => api.post("/characters/rank-up"),
  publicProfile: (username: string) => api.get(`/characters/${encodeURIComponent(username)}/public`),
};

export const redeemApi = {
  redeem: (code: string) => api.post("/redeem", { code }),
};

export const classesApi = {
  list: () => api.get("/classes"),
  characterClass: (characterId: string) => api.get(`/characters/${characterId}/class`),
  listClasses: (characterId: string) => api.get(`/characters/${characterId}/classes`),
  switchClass: (characterId: string, classId: string) =>
    api.post(`/characters/${characterId}/class`, { classId }),
};

export const contentApi = {
  get: () => api.get("/content"),
  patchNotes: () => api.get("/patch-notes"),
};

export const itemsApi = {
  list: (params?: any) => api.get("/items", { params }),
  enchantments: () => api.get("/enchantments"),
};

export const inventoryApi = {
  list: () => api.get("/inventory"),
  equip: (data: { inventoryId: string; characterId: string }) =>
    api.post("/inventory/equip", data),
  unequip: (data: { inventoryId: string; characterId: string }) =>
    api.post("/inventory/unequip", data),
  enchant: (data: { inventoryId: string; enchantmentId: string }) =>
    api.post("/inventory/enchant", data),
  removeEnchant: (data: { inventoryId: string }) =>
    api.post("/inventory/enchant/remove", data),
  enchantments: () => api.get("/inventory/enchantments"),
};

export const mapsApi = {
  list: () => api.get("/maps"),
  get: (slug: string) => api.get(`/maps/${slug}`),
  updatePin: (id: string, left: number, top: number) => api.put(`/maps/${id}/pin`, { left, top }),
};

export const monstersApi = {
  get: (id: string) => api.get(`/monsters/${id}`),
};

export const combatApi = {
  active: () => api.get("/combat/active"),
};

export const questsApi = {
  accept: (id: string) => api.post(`/quests/${id}/accept`),
  abandon: (id: string) => api.post(`/quests/${id}/abandon`),
  progress: () => api.get("/quests/progress"),
  claim: (id: string) => api.post(`/quests/${id}/claim`),
};

export const guildApi = {
  list: () => api.get("/guilds"),
  rankings: () => api.get("/guilds/rankings"),
  requirements: () => api.get("/guilds/requirements"),
  get: (id: string) => api.get(`/guilds/${id}`),
  create: (data: { name: string; tag: string; description: string }) =>
    api.post("/guilds", data),
  join: (id: string) => api.post(`/guilds/${id}/join`),
  leave: (id: string) => api.delete(`/guilds/${id}/leave`),
  mine: () => api.get("/user/guild"),
  promote: (id: string, userId: string) => api.post(`/guilds/${id}/promote`, { userId }),
  demote: (id: string, userId: string) => api.post(`/guilds/${id}/demote`, { userId }),
  kick: (id: string, userId: string) => api.delete(`/guilds/${id}/members/${userId}`),
  deposit: (id: string, amount: number) => api.post(`/guilds/${id}/deposit`, { amount }),
  rankUpMember: (id: string, userId: string) => api.post(`/guilds/${id}/members/${userId}/rank-up`),
  shop: (id: string) => api.get(`/guilds/${id}/shop`),
  buyShopItem: (id: string, shopItemId: string) => api.post(`/guilds/${id}/shop/${shopItemId}/buy`),
    quests: (id: string) => api.get(`/guilds/${id}/quests`),
    claimQuest: (id: string, questId: string) => api.post(`/guilds/${id}/quests/${questId}/claim`),
  };

export const marketApi = {
  list: (params?: any) => api.get("/market", { params }),
  buy: (listingId: string) => api.post(`/market/buy/${listingId}`),
  sell: (data: { inventoryId: string; price: number; quantity?: number }) =>
    api.post("/market/sell", data),
  sellNow: (data: { inventoryId: string; quantity?: number }) =>
    api.post("/market/sell-now", data),
};

export const seasonsApi = {
  me: () => api.get("/seasons/me"),
  claim: (tierId: string) => api.post(`/seasons/active/claim/${tierId}`),
};

export const adminApi = {
  exportContent: () => api.get("/admin/export"),
  importContent: (data: any) => api.post("/admin/import", data),
};

export const shopApi = {
  list: () => api.get("/shop"),
  purchase: (productId: string) => api.post(`/shop/purchase/${productId}`),
  orders: () => api.get("/shop/orders"),
};

export const npcApi = {
  get: (id: string) => api.get(`/npcs/${id}`),
  buy: (id: string, data: { itemId?: string; enchantmentId?: string; quantity?: number }) =>
    api.post(`/npcs/${id}/buy`, data),
};

export const gachaApi = {
  info: (npcId: string) => api.get(`/npcs/${npcId}/gacha`),
  roll: (npcId: string) => api.post(`/npcs/${npcId}/gacha/roll`),
  my: () => api.get("/gacha/my"),
  equip: (id: string) => api.post(`/gacha/boosters/${id}/equip`),
  unequip: (id: string) => api.post(`/gacha/boosters/${id}/unequip`),
};

export const raidApi = {
  status: () => api.get("/raid/status"),
};

export const craftApi = {
  list: () => api.get("/craft"),
  craft: (id: string) => api.post(`/craft/${id}/craft`),
};

export const leaderboardApi = {
  list: () => api.get("/leaderboard"),
};

export const pvpApi = {
  arena: () => api.get("/pvp/arena"),
  active: () => api.get("/pvp/arena/active"),
  challenge: () => api.post("/pvp/arena/challenge"),
  pending: () => api.get("/pvp/arena/pending"),
  respond: (challengeId: string, accept: boolean) => api.post(`/pvp/arena/pending/${challengeId}/respond`, { accept }),
  cancel: (challengeId: string) => api.post(`/pvp/arena/pending/${challengeId}/cancel`),
  flee: (matchId: string) => api.post(`/pvp/arena/${matchId}/flee`),
};
