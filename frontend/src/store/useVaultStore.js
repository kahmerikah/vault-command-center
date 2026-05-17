import { create } from "zustand";

export const useVaultStore = create((set) => ({
  token: "",
  user: null,
  modules: [],
  dashboard: null,
  setAuth: (token, user) => set({ token, user }),
  clearAuth: () => set({ token: "", user: null }),
  setModules: (modules) => set({ modules }),
  setDashboard: (dashboard) => set({ dashboard }),
}));
