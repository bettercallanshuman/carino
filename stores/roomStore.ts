import { create } from 'zustand';
import type { Room, RoomMember, RoomState, SyncStatus, Song } from '@/types';
import { roomSync } from '@/lib/realtime/roomSync';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO Room Store
// State management for active listening session, participants & sync metrics.
// ─────────────────────────────────────────────────────────────────────────────

interface RoomStore {
  // ── Room Data ────────────────────────────────────────────────────────────────
  room: Room | null;
  members: RoomMember[];
  roomState: RoomState | null;

  // ── Local Identity ───────────────────────────────────────────────────────────
  userId: string | null;
  displayName: string | null;
  isHost: boolean;

  // ── Connection & Sync Metrics ────────────────────────────────────────────────
  isJoining: boolean;
  joinError: string | null;
  syncStatus: SyncStatus;
  driftMs: number;

  // ── Actions ──────────────────────────────────────────────────────────────────
  setRoom: (room: Room | null) => void;
  setMembers: (members: RoomMember[]) => void;
  setRoomState: (state: RoomState | null) => void;
  setUserId: (id: string | null) => void;
  setDisplayName: (name: string | null) => void;
  setIsHost: (isHost: boolean) => void;
  setIsJoining: (joining: boolean) => void;
  setJoinError: (error: string | null) => void;
  setSyncMetrics: (status: SyncStatus, driftMs: number) => void;
  addMember: (member: RoomMember) => void;
  removeMember: (userId: string) => void;
  reset: () => void;

  // ── Async Operations ────────────────────────────────────────────────────────
  ensureIdentity: (preferredName?: string) => { userId: string; displayName: string };
  createRoom: (preferredName?: string) => Promise<{ success: boolean; room?: Room; error?: string }>;
  joinRoom: (code: string, preferredName?: string) => Promise<{ success: boolean; room?: Room; error?: string }>;
  leaveRoom: () => Promise<void>;
  fetchRoom: (codeOrId: string) => Promise<boolean>;
}

const initialState = {
  room: null,
  members: [],
  roomState: null,
  userId: null,
  displayName: null,
  isHost: false,
  isJoining: false,
  joinError: null,
  syncStatus: 'disconnected' as SyncStatus,
  driftMs: 0,
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  ...initialState,

  setRoom: (room) => set({ room }),
  setMembers: (members) => set({ members }),
  setRoomState: (roomState) => set({ roomState }),
  setUserId: (userId) => set({ userId }),
  setDisplayName: (displayName) => set({ displayName }),
  setIsHost: (isHost) => set({ isHost }),
  setIsJoining: (isJoining) => set({ isJoining }),
  setJoinError: (joinError) => set({ joinError }),
  setSyncMetrics: (syncStatus, driftMs) => set({ syncStatus, driftMs }),

  addMember: (member) => {
    const { members } = get();
    if (members.find((m) => m.user_id === member.user_id)) return;
    set({ members: [...members, member] });
  },

  removeMember: (userId) => {
    const { members } = get();
    set({ members: members.filter((m) => m.user_id !== userId) });
  },

  reset: () => {
    roomSync.leaveRoom();
    set(initialState);
  },

  ensureIdentity: (preferredName?: string): { userId: string; displayName: string } => {
    // Check authoritative authenticated user session first
    const authUser = useAuthStore.getState().user;
    if (authUser?.id) {
      const authId: string = authUser.id;
      const authName: string = authUser.display_name || preferredName || 'Cariño Listener';
      set({ userId: authId, displayName: authName });
      return { userId: authId, displayName: authName };
    }

    let finalId = get().userId;
    let finalName = preferredName || get().displayName;

    if (typeof window !== 'undefined') {
      if (!finalId) {
        const storedId = localStorage.getItem('carino_user_id');
        if (storedId) {
          finalId = storedId;
        } else {
          finalId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          localStorage.setItem('carino_user_id', finalId);
        }
      }

      if (!finalName) {
        const storedName = localStorage.getItem('carino_display_name');
        finalName = storedName || 'Cariño Listener';
      }
    }

    const resolvedId: string = finalId || 'server_usr';
    const resolvedName: string = finalName || 'Cariño Listener';

    set({ userId: resolvedId, displayName: resolvedName });
    return { userId: resolvedId, displayName: resolvedName };
  },

  createRoom: async (preferredName?: string) => {
    set({ isJoining: true, joinError: null });
    const { userId, displayName } = get().ensureIdentity(preferredName);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUserId: userId,
          displayName,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create room');
      }

      const data = await res.json();
      const room: Room = data.room;
      const members: RoomMember[] = data.members || [];
      const roomState: RoomState = data.room_state;

      set({
        room,
        members,
        roomState,
        isHost: true,
        isJoining: false,
        joinError: null,
      });

      // Hook up realtime
      roomSync.joinRoom({
        roomId: room.id,
        roomCode: room.room_code,
        userId,
        displayName,
      });

      return { success: true, room };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create room';
      set({ isJoining: false, joinError: msg });
      return { success: false, error: msg };
    }
  },

  joinRoom: async (code: string, preferredName?: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      set({ joinError: 'Please enter a 6-character room code' });
      return { success: false, error: 'Room code required' };
    }

    set({ isJoining: true, joinError: null });
    const { userId, displayName } = get().ensureIdentity(preferredName);

    try {
      // 1. Lookup room
      const res = await fetch(`/api/rooms?code=${encodeURIComponent(cleanCode)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Room "${cleanCode}" not found`);
      }

      const data = await res.json();
      const room: Room = data.room;
      const initialMembers: RoomMember[] = data.members || [];
      const roomState: RoomState = data.room_state;

      // 2. Register membership
      const joinRes = await fetch(`/api/rooms/${room.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName }),
      });

      let allMembers = initialMembers;
      if (joinRes.ok) {
        const joinData = await joinRes.json();
        if (joinData.members) allMembers = joinData.members;
      }

      const isHost = room.host_user_id === userId;

      set({
        room,
        members: allMembers,
        roomState,
        isHost,
        isJoining: false,
        joinError: null,
      });

      // Hook up realtime
      roomSync.joinRoom({
        roomId: room.id,
        roomCode: room.room_code,
        userId,
        displayName,
      });

      // Apply initial roomState to playerStore
      if (roomState?.current_song_id) {
        const librarySongs = useLibraryStore.getState().songs;
        let matchedSong = librarySongs.find((s: Song) => s.id === roomState.current_song_id);
        if (!matchedSong) {
          try {
            const songsRes = await fetch('/api/songs');
            if (songsRes.ok) {
              const loadedSongs = await songsRes.json();
              useLibraryStore.getState().setSongs(loadedSongs);
              matchedSong = loadedSongs.find((s: { id: string }) => s.id === roomState.current_song_id);
            }
          } catch {
            // ignore
          }
        }

        if (matchedSong) {
          const player = usePlayerStore.getState();
          player.setCurrentTrack(matchedSong);
          player.setQueue([matchedSong], roomState.queue_index ?? 0);

          let targetSeconds = (roomState.position_ms || 0) / 1000;
          if (roomState.is_playing && roomState.updated_at) {
            const elapsed = Math.max(0, Date.now() - new Date(roomState.updated_at).getTime()) / 1000;
            targetSeconds += elapsed;
          }

          if (isHost || player.isAudioUnlocked) {
            player.seekTo(targetSeconds);
            player.setIsPlaying(roomState.is_playing);
          } else {
            // Listener needs user activation to start audio playback
            player.setCurrentTime(targetSeconds);
            player.setIsPlaying(roomState.is_playing);
            player.setNeedsAudioUnlock(roomState.is_playing);
            player.setSyncStatus(roomState.is_playing ? 'audio-locked' : 'ready');
          }
        }
      }

      return { success: true, room };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join room';
      set({ isJoining: false, joinError: msg });
      return { success: false, error: msg };
    }
  },

  leaveRoom: async () => {
    const { room, userId } = get();

    // 1. Immediately leave realtime synchronization and reset local room store
    // This instantly stops incoming and outgoing room playback events
    roomSync.leaveRoom();
    set(initialState);

    // 2. Notify backend of departure asynchronously
    if (room && userId) {
      try {
        await fetch(`/api/rooms/${room.id}/members?userId=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
      } catch {
        // ignore network error on departure
      }
    }
  },

  fetchRoom: async (codeOrId: string) => {
    try {
      const isCode = codeOrId.length <= 8 && !codeOrId.includes('-');
      const url = isCode
        ? `/api/rooms?code=${encodeURIComponent(codeOrId.toUpperCase())}`
        : `/api/rooms/${encodeURIComponent(codeOrId)}`;

      const res = await fetch(url);
      if (!res.ok) return false;

      const data = await res.json();
      const room: Room = data.room;
      const members: RoomMember[] = data.members || [];
      const roomState: RoomState = data.room_state;

      const { userId } = get();
      const isHost = userId ? room.host_user_id === userId : false;

      set({
        room,
        members,
        roomState,
        isHost,
      });

      return true;
    } catch {
      return false;
    }
  },
}));
