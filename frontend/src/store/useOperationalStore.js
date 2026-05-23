/**
 * useOperationalStore — runtime operational context
 * Persisted to sessionStorage (not localStorage) so it clears on tab close.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useOperationalStore = create(
  persist(
    (set, get) => ({
      // Command palette
      commandOpen: false,
      openCommand: () => set({ commandOpen: true }),
      closeCommand: () => set({ commandOpen: false }),
      toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),

      // Continuity context (synced from /os/context)
      context: {
        upcoming_events: [],
        unread_notifications: 0,
        open_tasks: 0,
        active_properties: 0,
        recent_activity: [],
      },
      contextLastFetched: null,
      setContext: (context) => set({ context, contextLastFetched: Date.now() }),

      // Recently viewed entities — {kind, id, title, url}[]
      recentlyViewed: [],
      pushRecentlyViewed: (entity) => {
        const { recentlyViewed } = get();
        const filtered = recentlyViewed.filter(
          (e) => !(e.kind === entity.kind && e.id === entity.id)
        );
        set({ recentlyViewed: [entity, ...filtered].slice(0, 12) });
      },
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),

      // Membership
      membership: null,
      setMembership: (membership) => set({ membership }),

      // Active module context (for continuity bar active module display)
      activeModule: null,
      setActiveModule: (mod) => set({ activeModule: mod }),
    }),
    {
      name: "somb-vault-ops",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        recentlyViewed: state.recentlyViewed,
        membership: state.membership,
      }),
    }
  )
);
