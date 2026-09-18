import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Song, SyncStatus } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO Player Store
// Single source of truth for all playback state.
// Audio engine lives in AudioEngine component — this store is the state layer.
// ─────────────────────────────────────────────────────────────────────────────

interface PlayerStore {
  // ── Track & Queue ───────────────────────────────────────────────────────────
  currentTrack: Song | null;
  queue: Song[];
  queueIndex: number;

  // ── Playback ────────────────────────────────────────────────────────────────
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  isBuffering: boolean;
  seekTarget: number | null;
  playbackError: string | null;
  repeatMode: 'off' | 'once' | 'infinite';

  // ── UI ──────────────────────────────────────────────────────────────────────
  isExpanded: boolean;

  // ── Sync & Audio Readiness ──────────────────────────────────────────────────
  roomId: string | null;
  isConnected: boolean;
  syncStatus: SyncStatus;
  estimatedDriftMs: number;
  playbackRate: number;
  isAudioUnlocked: boolean;
  needsAudioUnlock: boolean;
  audioPaused: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────────
  setCurrentTrack: (track: Song | null) => void;
  setQueue: (queue: Song[], startIndex?: number) => void;
  setQueueIndex: (index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setIsBuffering: (buffering: boolean) => void;
  seekTo: (time: number) => void;
  clearSeekTarget: () => void;
  setPlaybackError: (err: string | null) => void;
  setRepeatMode: (mode: 'off' | 'once' | 'infinite') => void;
  cycleRepeatMode: () => void;
  setIsExpanded: (expanded: boolean) => void;
  setRoomId: (roomId: string | null) => void;
  setIsConnected: (connected: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setEstimatedDriftMs: (drift: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsAudioUnlocked: (unlocked: boolean) => void;
  setNeedsAudioUnlock: (needs: boolean) => void;
  setAudioPaused: (paused: boolean) => void;

  // ── Composite Actions ────────────────────────────────────────────────────────
  playTrackFromQueue: (index: number) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  reset: () => void;
}

const initialState = {
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  isBuffering: false,
  seekTarget: null,
  playbackError: null,
  repeatMode: 'off' as 'off' | 'once' | 'infinite',
  isExpanded: false,
  roomId: null,
  isConnected: false,
  syncStatus: 'synced' as SyncStatus,
  estimatedDriftMs: 0,
  playbackRate: 1.0,
  isAudioUnlocked: false,
  needsAudioUnlock: false,
  audioPaused: true,
};

export const usePlayerStore = create<PlayerStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setCurrentTrack: (track) => set({ currentTrack: track, playbackError: null }),
    setQueue: (queue, startIndex = 0) =>
      set({
        queue,
        queueIndex: startIndex,
        currentTrack: queue[startIndex] ?? null,
        currentTime: 0,
        isPlaying: queue.length > 0,
        playbackError: null,
      }),
    setQueueIndex: (index) => set({ queueIndex: index }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    setMuted: (muted) => set({ muted }),
    setIsBuffering: (buffering) => set({ isBuffering: buffering }),
    seekTo: (time) => set({ seekTarget: time, currentTime: time }),
    clearSeekTarget: () => set({ seekTarget: null }),
    setPlaybackError: (err) => set({ playbackError: err }),
    setRepeatMode: (mode) => set({ repeatMode: mode }),
    cycleRepeatMode: () => {
      const current = get().repeatMode;
      const nextMode =
        current === 'off' ? 'once' : current === 'once' ? 'infinite' : 'off';
      set({ repeatMode: nextMode });
    },
    setIsExpanded: (expanded) => set({ isExpanded: expanded }),
    setRoomId: (roomId) => set({ roomId }),
    setIsConnected: (connected) => set({ isConnected: connected }),
    setSyncStatus: (status) => set({ syncStatus: status }),
    setEstimatedDriftMs: (drift) => set({ estimatedDriftMs: drift }),
    setPlaybackRate: (rate) => set({ playbackRate: rate }),
    setIsAudioUnlocked: (unlocked) => set({ isAudioUnlocked: unlocked }),
    setNeedsAudioUnlock: (needs) => set({ needsAudioUnlock: needs }),
    setAudioPaused: (paused) => set({ audioPaused: paused }),

    playTrackFromQueue: (index) => {
      const { queue } = get();
      const track = queue[index];
      if (!track) return;
      set({ queueIndex: index, currentTrack: track, currentTime: 0, isPlaying: true, playbackError: null });
    },

    goToNext: () => {
      const { queue, queueIndex, isPlaying } = get();
      const nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) return;
      const track = queue[nextIndex];
      set({ queueIndex: nextIndex, currentTrack: track, currentTime: 0, isPlaying, playbackError: null });
    },

    goToPrevious: () => {
      const { queue, queueIndex, isPlaying } = get();
      const prevIndex = queueIndex - 1;
      if (prevIndex < 0) return;
      const track = queue[prevIndex];
      set({ queueIndex: prevIndex, currentTrack: track, currentTime: 0, isPlaying, playbackError: null });
    },

    reset: () => set(initialState),
  }))
);
