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
  toggleFavourite: (songId: string) => void;
  isFavourite: (songId: string) => boolean;
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

  toggleFavourite: (songId) => {
    const { favouriteSongIds } = get();
    const exists = favouriteSongIds.includes(songId);
    const updated = exists
      ? favouriteSongIds.filter((id) => id !== songId)
      : [songId, ...favouriteSongIds];
    set({ favouriteSongIds: updated });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('carino_fav_song_ids', JSON.stringify(updated)); } catch {}
    }
  },

  isFavourite: (songId) => {
    return get().favouriteSongIds.includes(songId);
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
