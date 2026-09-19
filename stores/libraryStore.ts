import { create } from 'zustand';
import type { Song, Playlist, UserProfile } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO Library Store
// Central reactive state for songs, playlists, recently played, favourites,
// user profile, search query, and modal visibility.
// ─────────────────────────────────────────────────────────────────────────────

interface LibraryStore {
  // ── Data ─────────────────────────────────────────────────────────────────────
  songs: Song[];
  playlists: Playlist[];
  recentlyPlayed: Song[];
  favouriteSongIds: string[];
  inFlightFavoriteIds: string[];
  userProfile: UserProfile;

  // ── Loading & Errors ─────────────────────────────────────────────────────────
  isLoadingSongs: boolean;
  isLoadingPlaylists: boolean;
  songsError: string | null;
  playlistsError: string | null;

  // ── Search ───────────────────────────────────────────────────────────────────
  searchQuery: string;

  // ── Modals ───────────────────────────────────────────────────────────────────
  isAccountModalOpen: boolean;
  isCockpitModalOpen: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────────
  setSongs: (songs: Song[]) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setRecentlyPlayed: (songs: Song[]) => void;
  addToRecentlyPlayed: (song: Song) => void;
  toggleFavourite: (songId: string) => Promise<void>;
  isFavourite: (songId: string) => boolean;
  loadFavoritesFromServer: () => Promise<void>;
  setUserProfile: (profile: Partial<UserProfile>) => void;
  setIsAccountModalOpen: (open: boolean) => void;
  setIsCockpitModalOpen: (open: boolean) => void;
  setIsLoadingSongs: (loading: boolean) => void;
  setIsLoadingPlaylists: (loading: boolean) => void;
  setSongsError: (error: string | null) => void;
  setPlaylistsError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  addSong: (song: Song) => void;
  updateSong: (id: string, updates: Partial<Song>) => void;
  removeSong: (id: string) => void;
  addPlaylist: (playlist: Playlist) => void;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  removePlaylist: (id: string) => void;
  reset: () => void;
}

// Helpers for localStorage persistence
const getStoredFavourites = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('carino_fav_song_ids');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const getStoredRecentlyPlayed = (): Song[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('carino_recent_songs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const getStoredProfile = (): UserProfile => {
  const defaultProfile: UserProfile = {
    name: 'Cariño Listener',
    avatar_url: null,
    gender: 'Prefer not to say',
    date_of_birth: '2000-01-01',
  };
  if (typeof window === 'undefined') return defaultProfile;
  try {
    const raw = localStorage.getItem('carino_user_profile');
    return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
};

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  songs: [],
  playlists: [],
  recentlyPlayed: getStoredRecentlyPlayed(),
  favouriteSongIds: getStoredFavourites(),
  inFlightFavoriteIds: [],
  userProfile: getStoredProfile(),
  isLoadingSongs: false,
  isLoadingPlaylists: false,
  songsError: null,
  playlistsError: null,
  searchQuery: '',
  isAccountModalOpen: false,
  isCockpitModalOpen: false,

  setSongs: (songs) => set({ songs }),
  setPlaylists: (playlists) => set({ playlists }),
  setRecentlyPlayed: (songs) => {
    set({ recentlyPlayed: songs });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('carino_recent_songs', JSON.stringify(songs)); } catch {}
    }
  },

  addToRecentlyPlayed: (song) => {
    const { recentlyPlayed } = get();
    const filtered = recentlyPlayed.filter((s) => s.id !== song.id);
    const updated = [song, ...filtered].slice(0, 30);
    set({ recentlyPlayed: updated });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('carino_recent_songs', JSON.stringify(updated)); } catch {}
    }
  },

  toggleFavourite: async (songId) => {
    const { favouriteSongIds, inFlightFavoriteIds } = get();
    if (inFlightFavoriteIds.includes(songId)) {
      return;
    }

    const exists = favouriteSongIds.includes(songId);
    const updated = exists
      ? favouriteSongIds.filter((id) => id !== songId)
      : [songId, ...favouriteSongIds.filter((id) => id !== songId)];

    // 1. Optimistic UI update + in-flight lock to avoid duplicate requests/races
    set({
      favouriteSongIds: updated,
      inFlightFavoriteIds: [...inFlightFavoriteIds, songId],
    });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('carino_fav_song_ids', JSON.stringify(updated));
      } catch {}
    }

    // 2. Server persistence sync with rollback on failure
    try {
      const res = await fetch('/api/favorites', {
        method: exists ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update favorite (${res.status})`);
      }

      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.songIds)) {
        set({ favouriteSongIds: data.songIds });
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('carino_fav_song_ids', JSON.stringify(data.songIds));
          } catch {}
        }
      }
    } catch (err) {
      console.error('[libraryStore] Failed to persist favorite toggle, rolling back:', err);
      // Restore previous state
      set({ favouriteSongIds });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('carino_fav_song_ids', JSON.stringify(favouriteSongIds));
        } catch {}
      }
    } finally {
      set((state) => ({
        inFlightFavoriteIds: state.inFlightFavoriteIds.filter((id) => id !== songId),
      }));
    }
  },

  isFavourite: (songId) => {
    return get().favouriteSongIds.includes(songId);
  },

  loadFavoritesFromServer: async () => {
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.songIds)) {
        set({ favouriteSongIds: data.songIds });
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('carino_fav_song_ids', JSON.stringify(data.songIds));
          } catch {}
        }
      }
    } catch {
      // Graceful fallback to client cache on network error
    }
  },

  setUserProfile: (updates) => {
    const current = get().userProfile;
    const updated = { ...current, ...updates };
    set({ userProfile: updated });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('carino_user_profile', JSON.stringify(updated)); } catch {}
    }
  },

  setIsAccountModalOpen: (open) => set({ isAccountModalOpen: open }),
  setIsCockpitModalOpen: (open) => set({ isCockpitModalOpen: open }),
  setIsLoadingSongs: (loading) => set({ isLoadingSongs: loading }),
  setIsLoadingPlaylists: (loading) => set({ isLoadingPlaylists: loading }),
  setSongsError: (error) => set({ songsError: error }),
  setPlaylistsError: (error) => set({ playlistsError: error }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  addSong: (song) => {
    const { songs } = get();
    set({ songs: [song, ...songs.filter((s) => s.id !== song.id)] });
  },

  updateSong: (id, updates) => {
    const { songs } = get();
    set({
      songs: songs.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  },

  removeSong: (id) => {
    const { songs, recentlyPlayed, favouriteSongIds } = get();
    set({
      songs: songs.filter((s) => s.id !== id),
      recentlyPlayed: recentlyPlayed.filter((s) => s.id !== id),
      favouriteSongIds: favouriteSongIds.filter((favId) => favId !== id),
    });
  },

  addPlaylist: (playlist) => {
    const { playlists } = get();
    set({ playlists: [playlist, ...playlists.filter((p) => p.id !== playlist.id)] });
  },

  updatePlaylist: (id, updates) => {
    const { playlists } = get();
    set({
      playlists: playlists.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    });
  },

  removePlaylist: (id) => {
    const { playlists } = get();
    set({ playlists: playlists.filter((p) => p.id !== id) });
  },

  reset: () =>
    set({
      songs: [],
      playlists: [],
      recentlyPlayed: [],
      favouriteSongIds: [],
      inFlightFavoriteIds: [],
      userProfile: {
        name: 'Anshuman',
        avatar_url: null,
        gender: 'Prefer not to say',
        date_of_birth: '2000-01-01',
      },
      isLoadingSongs: false,
      isLoadingPlaylists: false,
      songsError: null,
      playlistsError: null,
      searchQuery: '',
      isAccountModalOpen: false,
      isCockpitModalOpen: false,
    }),
}));
