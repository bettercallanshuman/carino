// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Domain Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Library ──────────────────────────────────────────────────────────────────

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number;
  audio_path: string;
  cover_path: string;
  created_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  cover_path: string | null;
  created_at: string;
}

export interface PlaylistTrack {
  playlist_id: string;
  song_id: string;
  position: number;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  room_code: string;
  host_user_id: string;
  playlist_id: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface RoomState {
  room_id: string;
  current_song_id: string | null;
  queue_index: number;
  is_playing: boolean;
  position_ms: number;
  state_version: number;
  updated_at: string;
}

// ── Player ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'synced' | 'drifting' | 'correcting' | 'disconnected';

export interface PlayerState {
  currentTrack: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  isExpanded: boolean;
  roomId: string | null;
  isConnected: boolean;
  syncStatus: SyncStatus;
  estimatedDriftMs: number;
  isBuffering: boolean;
}

// ── Realtime Sync ─────────────────────────────────────────────────────────────

export interface SyncPayload {
  type: 'STATE_SYNC';
  revision: number;
  trackId: string;
  queueIndex: number;
  positionMs: number;
  isPlaying: boolean;
  targetStartAt: number;
}

export interface PlaybackHeartbeat {
  type: 'PLAYBACK_HEARTBEAT';
  revision: number;
  positionMs: number;
  isPlaying: boolean;
}

// ── Realtime Events ───────────────────────────────────────────────────────────

export type RealtimeEventType =
  | 'PLAY_REQUEST'
  | 'PAUSE_REQUEST'
  | 'SEEK_REQUEST'
  | 'NEXT_REQUEST'
  | 'PREVIOUS_REQUEST'
  | 'QUEUE_REQUEST'
  | 'STATE_SYNC'
  | 'PLAYBACK_HEARTBEAT'
  | 'ROOM_JOIN'
  | 'ROOM_LEAVE';

export interface RealtimeEvent {
  type: RealtimeEventType;
  senderId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface SeekPayload {
  positionMs: number;
}

export interface QueuePayload {
  queue: Song[];
  queueIndex: number;
}

// ── Presence ──────────────────────────────────────────────────────────────────

export interface PresenceState {
  userId: string;
  displayName: string;
  roomId: string | null;
  isPlaying: boolean;
  onlineAt: string;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface UploadSongInput {
  title: string;
  artist: string;
  album?: string;
  audioFile: File;
  coverFile: File;
}

export interface UploadResult {
  success: boolean;
  song?: Song;
  error?: string;
}
