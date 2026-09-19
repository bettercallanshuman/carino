import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO UI Store
// Lightweight reactive store for transient layout & drawer surfaces.
// Keeps libraryStore strictly scoped to music catalog, favorites & playlists.
// Zero coupling to playback or protected systems.
// ─────────────────────────────────────────────────────────────────────────────

interface UIStore {
  isLyricsDrawerOpen: boolean;
  setIsLyricsDrawerOpen: (open: boolean) => void;
  toggleLyricsDrawer: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isLyricsDrawerOpen: false,
  setIsLyricsDrawerOpen: (open: boolean) => set({ isLyricsDrawerOpen: open }),
  toggleLyricsDrawer: () => set((state) => ({ isLyricsDrawerOpen: !state.isLyricsDrawerOpen })),
}));
