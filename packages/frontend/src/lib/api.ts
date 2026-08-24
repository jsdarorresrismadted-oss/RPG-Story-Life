import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // token inválido/expirado — limpar localmente
      localStorage.removeItem("rpg-auth");
    }
    return Promise.reject(error);
  }
);
