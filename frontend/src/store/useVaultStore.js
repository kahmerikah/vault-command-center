import { create } from "zustand";
import { persist } from "zustand/middleware";

const IDLE_TIMEOUT_MS = 1000 * 60 * 30;

export const useVaultStore = create(
  persist(
    (set, get) => ({
      accessToken: "",
      refreshToken: "",
      user: null,
      modules: [],
      dashboard: null,
      authChecked: false,
      hasHydrated: false,
      lastActiveAt: Date.now(),
      setAuth: ({ accessToken, refreshToken, user }) =>
        set({
          accessToken: accessToken || "",
          refreshToken: refreshToken || "",
          user: user || null,
          authChecked: true,
          lastActiveAt: Date.now(),
        }),
      touchActivity: () => set({ lastActiveAt: Date.now() }),
      markAuthChecked: () => set({ authChecked: true }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      clearAuth: () =>
        set({
          accessToken: "",
          refreshToken: "",
          user: null,
          modules: [],
          dashboard: null,
          authChecked: true,
          lastActiveAt: Date.now(),
        }),
      hasIdleExpired: () => Date.now() - get().lastActiveAt > IDLE_TIMEOUT_MS,
      setModules: (modules) => set({ modules }),
      setDashboard: (dashboard) => set({ dashboard }),
    }),
    {
      name: "somb-vault-auth",
      onRehydrateStorage: () => (state, error) => {
        if (!error) {
          state?.setHasHydrated?.(true);
        }
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        lastActiveAt: state.lastActiveAt,
      }),
    }
  )
);
