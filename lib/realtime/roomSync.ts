import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { usePlayerStore } from '@/stores/playerStore';
import { useRoomStore } from '@/stores/roomStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { getAuthoritativeAudio, logAudioDiagnostic } from '@/components/player/AudioEngine';
import type { Song, SyncStatus } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Realtime Synchronization Engine
// Dual Transport:
// 1. Supabase Realtime Broadcast & Presence (production & configured accounts)
// 2. Server-Sent Events (SSE) + BroadcastChannel (local dev, incognito & cross-browser)
// Fully enforces:
// - Physical AudioElement ground truth check (never report 'synced' if audio.paused)
// - Autoplay policy compliance with CARIÑO "Audio Unlock" handshake
// - Authoritative catch-up timestamp calculation on unlock
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomSyncMessage {
  type:
    | 'PLAY'
    | 'PAUSE'
    | 'SEEK'
    | 'TRACK_CHANGE'
    | 'QUEUE_UPDATE'
    | 'HEARTBEAT'
    | 'PRESENCE_PING'
    | 'CONNECTED';
  roomId: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  positionMs?: number;
  isPlaying?: boolean;
  track?: Song | null;
  queue?: Song[];
  queueIndex?: number;
}

class RoomSyncManager {
  public activeTransport: 'supabase-realtime' | 'server-sent-events' | 'unconnected' = 'unconnected';
  private broadcastChannel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private supabaseChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubStoreFns: (() => void)[] = [];
  private isProcessingRemoteAction = false;
  private activeRoomCode: string | null = null;
  private activeRoomId: string | null = null;
  private currentUserId: string | null = null;
  private currentUserName: string = 'Listener';
  private isJoined = false;
  private sessionEpoch = 0;

  // Authoritative tracking timestamps for catch-up calculations
  private lastAuthoritativeTargetMs: number = 0;
  private lastAuthoritativeTimestamp: number = 0;

  /**
   * Calculates current authoritative room position in seconds based on transit time.
   */
  public getComputedAuthoritativeTime(): number {
    if (!this.lastAuthoritativeTargetMs) return 0;
    const isPlaying = usePlayerStore.getState().isPlaying;
    const elapsedMs = isPlaying ? Math.max(0, Date.now() - this.lastAuthoritativeTimestamp) : 0;
    return (this.lastAuthoritativeTargetMs + elapsedMs) / 1000;
  }

  /**
   * Initializes real-time channels for the given room
   */
  public joinRoom(params: {
    roomId: string;
    roomCode: string;
    userId: string;
    displayName: string;
  }) {
    this.leaveRoom(); // ensure clean state

    this.sessionEpoch++;
    const currentEpoch = this.sessionEpoch;

    const { roomId, roomCode, userId, displayName } = params;
    this.activeRoomId = roomId;
    this.activeRoomCode = roomCode.toUpperCase();
    this.currentUserId = userId;
    this.currentUserName = displayName;
    this.isJoined = true;

    usePlayerStore.getState().setRoomId(roomId);
    usePlayerStore.getState().setIsConnected(true);

    // Initial sync status: if audio element is paused, report ready/locked, NOT synced!
    const audio = getAuthoritativeAudio();
    if (audio && !audio.paused) {
      usePlayerStore.getState().setSyncStatus('synced');
    } else {
      usePlayerStore.getState().setSyncStatus('ready');
    }

    // 1. Setup Local Cross-Tab BroadcastChannel (same browser profile fast path)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channelName = `carino_room_${this.activeRoomCode}`;
        this.broadcastChannel = new BroadcastChannel(channelName);
        this.broadcastChannel.onmessage = (event: MessageEvent<RoomSyncMessage>) => {
          if (!this.isJoined || this.sessionEpoch !== currentEpoch) return;
          this.handleIncomingMessage(event.data, currentEpoch);
        };
      } catch (err) {
        console.warn('[RoomSync] BroadcastChannel init error:', err);
      }
    }

    // 2. Setup Primary Realtime Transport
    if (isSupabaseConfigured() && typeof window !== 'undefined') {
      // ── Supabase Realtime Transport ──────────────────────────────────────────
      this.activeTransport = 'supabase-realtime';
      try {
        const supabase = createClient();
        const chan = supabase.channel(`room:${this.activeRoomCode}`, {
          config: { broadcast: { self: false } },
        });

        chan.on('broadcast', { event: 'sync' }, ({ payload }) => {
          if (!this.isJoined || this.sessionEpoch !== currentEpoch) return;
          this.handleIncomingMessage(payload as RoomSyncMessage, currentEpoch);
        });

        chan.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            usePlayerStore.getState().setIsConnected(true);
          }
        });

        this.supabaseChannel = chan;
      } catch (err) {
        console.warn('[RoomSync] Supabase Realtime subscription error:', err);
      }
    } else if (typeof window !== 'undefined' && 'EventSource' in window) {
      // ── Server-Sent Events (SSE) Transport (cross-browser / incognito dev mode)
      this.activeTransport = 'server-sent-events';
      try {
        const sseUrl = `/api/rooms/${this.activeRoomId}/events`;
        const es = new EventSource(sseUrl);
        let hadError = false;

        es.onopen = () => {
          if (hadError) {
            hadError = false;
            console.log('[RoomSync] SSE reconnected. Resyncing state...');
            this.resyncWithServerState();
          }
        };

        es.onmessage = (event) => {
          if (!this.isJoined || this.sessionEpoch !== currentEpoch) return;
          try {
            const data: RoomSyncMessage = JSON.parse(event.data);
            if (data && data.type !== 'CONNECTED') {
              this.handleIncomingMessage(data, currentEpoch);
            }
          } catch (e) {
            console.warn('[RoomSync] SSE JSON parse error:', e);
          }
        };

        es.onerror = () => {
          hadError = true;
          // SSE automatically reconnects
        };

        this.eventSource = es;
      } catch (err) {
        console.warn('[RoomSync] EventSource init error:', err);
      }
    }

    console.log(
      `[RoomSync] Connected to room ${this.activeRoomCode} via transport: ${this.activeTransport}`
    );

    // 3. Setup Automatic Player Store Subscriptions
    const unsubPlaying = usePlayerStore.subscribe(
      (state) => state.isPlaying,
      (isPlaying) => {
        if (this.isProcessingRemoteAction || !this.activeRoomId) return;
        if (isPlaying) {
          this.triggerPlay();
        } else {
          this.triggerPause();
        }
      }
    );

    const unsubSeek = usePlayerStore.subscribe(
      (state) => state.seekTarget,
      (seekTarget) => {
        if (this.isProcessingRemoteAction || !this.activeRoomId || seekTarget === null) return;
        this.triggerSeek(seekTarget);
      }
    );

    const unsubTrack = usePlayerStore.subscribe(
      (state) => state.currentTrack,
      (currentTrack) => {
        if (this.isProcessingRemoteAction || !this.activeRoomId || !currentTrack) return;
        this.triggerTrackChange(currentTrack);
      }
    );

    this.unsubStoreFns = [unsubPlaying, unsubSeek, unsubTrack];

    // 4. Start Periodic Heartbeat (every 2.5s)
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 2500);

    // Announce presence
    this.broadcast({
      type: 'PRESENCE_PING',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      positionMs: Math.round(usePlayerStore.getState().currentTime * 1000),
      isPlaying: usePlayerStore.getState().isPlaying,
    });
  }

  /**
   * Cleans up all active subscriptions and timers
   */
  public leaveRoom() {
    this.isJoined = false;
    this.sessionEpoch++;

    this.unsubStoreFns.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    this.unsubStoreFns = [];

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.onmessage = null;
        this.eventSource.onerror = null;
        this.eventSource.onopen = null;
        this.eventSource.close();
      } catch {
        // ignore
      }
      this.eventSource = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.onmessage = null;
        this.broadcastChannel.close();
      } catch {
        // ignore
      }
      this.broadcastChannel = null;
    }

    if (this.supabaseChannel) {
      try {
        const supabase = createClient();
        supabase.removeChannel(this.supabaseChannel);
      } catch {
        // ignore
      }
      this.supabaseChannel = null;
    }

    this.activeRoomCode = null;
    this.activeRoomId = null;
    this.currentUserId = null;
    this.activeTransport = 'unconnected';
    this.lastAuthoritativeTargetMs = 0;
    this.lastAuthoritativeTimestamp = 0;

    usePlayerStore.getState().setRoomId(null);
    usePlayerStore.getState().setIsConnected(false);
    usePlayerStore.getState().setSyncStatus('disconnected');
    usePlayerStore.getState().setEstimatedDriftMs(0);
    usePlayerStore.getState().setPlaybackRate(1.0);
    usePlayerStore.getState().setNeedsAudioUnlock(false);
  }

  /**
   * Broadcast message to all room peers
   */
  public broadcast(message: RoomSyncMessage) {
    if (!this.isJoined || !this.activeRoomCode || !this.activeRoomId || !this.currentUserId) return;

    // Echo prevention: only send if we are not actively applying an incoming remote message
    if (this.isProcessingRemoteAction) return;

    // 1. Send via local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (err) {
        console.warn('[RoomSync] BroadcastChannel postMessage error:', err);
      }
    }

    // 2. Send via Supabase Realtime (if configured)
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'sync',
          payload: message,
        });
      } catch (err) {
        console.warn('[RoomSync] Supabase broadcast error:', err);
      }
    }

    // 3. Send via SSE HTTP POST (for cross-browser / incognito dev mode)
    if (this.activeTransport === 'server-sent-events' && this.activeRoomId) {
      fetch(`/api/rooms/${this.activeRoomId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }).catch((err) => {
        console.warn('[RoomSync] SSE POST broadcast error:', err);
      });
    }

    // Update server state asynchronously for persistence
    if (message.type !== 'HEARTBEAT' && message.type !== 'PRESENCE_PING') {
      this.persistStateToServer(message);
    }
  }

  /**
   * Persist playback state to backend API
   */
  private async persistStateToServer(message: RoomSyncMessage) {
    if (!this.isJoined || !this.activeRoomId) return;

    try {
      const payload: Record<string, unknown> = {};
      if (message.positionMs !== undefined) payload.position_ms = message.positionMs;
      if (message.isPlaying !== undefined) payload.is_playing = message.isPlaying;
      if (message.track) payload.current_song_id = message.track.id;
      if (message.queueIndex !== undefined) payload.queue_index = message.queueIndex;

      await fetch(`/api/rooms/${this.activeRoomId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[RoomSync] Failed to persist room state to server:', err);
    }
  }

  /**
   * Handles incoming message from peer
   */
  private handleIncomingMessage(msg: RoomSyncMessage, epoch?: number) {
    // 1. Explicit membership and session guards
    if (!msg || !this.isJoined || !this.activeRoomId || !this.activeRoomCode) return;
    if (epoch !== undefined && epoch !== this.sessionEpoch) return;

    // Check store-level room membership
    const currentRoom = useRoomStore.getState().room;
    if (!currentRoom || currentRoom.id !== this.activeRoomId) return;

    // 2. Ignore self messages
    if (msg.senderId === this.currentUserId) return;

    // 3. Ignore messages from other rooms
    if (msg.roomId && msg.roomId !== this.activeRoomId) return;
    if (msg.roomCode && msg.roomCode.toUpperCase() !== this.activeRoomCode) return;

    const audio = getAuthoritativeAudio();
    const now = Date.now();
    const transitDelay = Math.max(0, Math.min(5000, now - msg.timestamp));

    logAudioDiagnostic(`REMOTE_EVENT: ${msg.type}`, audio, {
      eventType: msg.type,
      senderId: msg.senderId,
      senderName: msg.senderName,
      msgPositionMs: msg.positionMs,
      msgIsPlaying: msg.isPlaying,
      msgTrack: msg.track?.title,
      transport: this.activeTransport,
    });

    this.isProcessingRemoteAction = true;

    try {
      const player = usePlayerStore.getState();
      const currentLocalMs = Math.round(player.currentTime * 1000);

      switch (msg.type) {
        case 'TRACK_CHANGE': {
          if (msg.track) {
            player.setCurrentTrack(msg.track);
            const targetMs = (msg.positionMs || 0) + (msg.isPlaying ? transitDelay : 0);
            this.lastAuthoritativeTargetMs = targetMs;
            this.lastAuthoritativeTimestamp = now;

            if (!player.isAudioUnlocked) {
              // Audio is locked — prepare target position and show unlock prompt
              player.setNeedsAudioUnlock(true);
              player.setSyncStatus('audio-locked');
              if (msg.isPlaying !== undefined) {
                player.setIsPlaying(msg.isPlaying);
              }
            } else {
              player.seekTo(targetMs / 1000);
              if (msg.isPlaying !== undefined) {
                player.setIsPlaying(msg.isPlaying);
              }
            }
          }
          if (msg.queue && Array.isArray(msg.queue)) {
            player.setQueue(msg.queue, msg.queueIndex ?? 0);
          }
          break;
        }

        case 'QUEUE_UPDATE': {
          if (msg.queue && Array.isArray(msg.queue)) {
            player.setQueue(msg.queue, msg.queueIndex ?? player.queueIndex);
          }
          break;
        }

        case 'PLAY': {
          const targetMs = (msg.positionMs || 0) + transitDelay;
          this.lastAuthoritativeTargetMs = targetMs;
          this.lastAuthoritativeTimestamp = now;

          if (!player.isAudioUnlocked) {
            // Autoplay restriction: browser will reject programmatic play() without user gesture
            console.log('[RoomSync] Received PLAY but audio is locked awaiting user gesture.');
            player.setNeedsAudioUnlock(true);
            player.setSyncStatus('audio-locked');
            player.setIsPlaying(true);
          } else {
            const drift = Math.abs(currentLocalMs - targetMs);
            this.updateDriftMetrics(drift);

            if (!player.isPlaying) {
              player.setIsPlaying(true);
            }

            if (drift >= 1500) {
              player.seekTo(targetMs / 1000);
            }
          }
          break;
        }

        case 'PAUSE': {
          if (player.isPlaying) {
            player.setIsPlaying(false);
          }
          if (msg.positionMs !== undefined) {
            player.seekTo(msg.positionMs / 1000);
          }
          this.lastAuthoritativeTargetMs = msg.positionMs || currentLocalMs;
          this.lastAuthoritativeTimestamp = now;

          // If paused, state and audio are aligned
          player.setSyncStatus('synced');
          player.setEstimatedDriftMs(0);
          break;
        }

        case 'SEEK': {
          const targetMs = (msg.positionMs || 0) + (msg.isPlaying ? transitDelay : 0);
          this.lastAuthoritativeTargetMs = targetMs;
          this.lastAuthoritativeTimestamp = now;

          player.seekTo(targetMs / 1000);
          if (msg.isPlaying !== undefined) {
            player.setIsPlaying(msg.isPlaying);
          }

          if (player.audioPaused && player.isPlaying) {
            player.setSyncStatus('audio-locked');
          } else {
            player.setSyncStatus('synced');
          }
          break;
        }

        case 'HEARTBEAT': {
          if (msg.isPlaying) {
            const targetMs = (msg.positionMs || 0) + transitDelay;
            this.lastAuthoritativeTargetMs = targetMs;
            this.lastAuthoritativeTimestamp = now;

            // Ground truth check: does actual audio element agree?
            if (!player.isAudioUnlocked || player.audioPaused) {
              player.setSyncStatus('audio-locked');
              player.setNeedsAudioUnlock(true);
            } else {
              const drift = Math.abs(currentLocalMs - targetMs);
              this.correctDrift(drift, currentLocalMs, targetMs);
            }
          }
          break;
        }

        case 'PRESENCE_PING': {
          useRoomStore.getState().addMember({
            room_id: this.activeRoomId,
            user_id: msg.senderId,
            display_name: msg.senderName,
            joined_at: new Date().toISOString(),
          });
          break;
        }
      }
    } finally {
      this.isProcessingRemoteAction = false;
    }
  }

  /**
   * Drift micro-correction engine
   */
  private correctDrift(drift: number, localMs: number, targetMs: number) {
    const player = usePlayerStore.getState();
    const audio = getAuthoritativeAudio();

    // Strict audio reality check: if audio element is paused, cannot be synced!
    if (audio && audio.paused && player.isPlaying) {
      player.setSyncStatus('audio-locked');
      return;
    }

    this.updateDriftMetrics(drift);

    // Case 1: In sync (< 250ms) -> do not touch audio to avoid audio glitches
    if (drift < 250) {
      player.setSyncStatus('synced');
      player.setPlaybackRate(1.0);
      return;
    }

    // Case 2: Moderate drift (250ms - 1500ms) -> smooth rate tuning
    if (drift < 1500) {
      player.setSyncStatus('correcting');
      const isBehind = localMs < targetMs;
      player.setPlaybackRate(isBehind ? 1.04 : 0.96);
      return;
    }

    // Case 3: Significant drift (>= 1500ms) -> instant hard seek
    player.setSyncStatus('correcting');
    player.seekTo(targetMs / 1000);
    player.setPlaybackRate(1.0);
  }

  private updateDriftMetrics(drift: number) {
    const player = usePlayerStore.getState();
    player.setEstimatedDriftMs(Math.round(drift));

    const audio = getAuthoritativeAudio();
    if (audio && audio.paused && player.isPlaying) {
      player.setSyncStatus('audio-locked');
      useRoomStore.getState().setSyncMetrics?.('audio-locked', Math.round(drift));
      return;
    }

    let status: SyncStatus = 'synced';
    if (drift >= 1500) status = 'correcting';
    else if (drift >= 250) status = 'drifting';

    player.setSyncStatus(status);
    useRoomStore.getState().setSyncMetrics?.(status, Math.round(drift));
  }

  private sendHeartbeat() {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;

    const player = usePlayerStore.getState();
    if (!player.isPlaying) return;

    this.broadcast({
      type: 'HEARTBEAT',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      positionMs: Math.round(player.currentTime * 1000),
      isPlaying: player.isPlaying,
    });
  }

  // ── Public Helper Action Dispatchers ─────────────────────────────────────

  public triggerPlay(positionMs?: number) {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    const pos = positionMs ?? Math.round(usePlayerStore.getState().currentTime * 1000);
    this.broadcast({
      type: 'PLAY',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      positionMs: pos,
      isPlaying: true,
    });
  }

  public triggerPause(positionMs?: number) {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    const pos = positionMs ?? Math.round(usePlayerStore.getState().currentTime * 1000);
    this.broadcast({
      type: 'PAUSE',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      positionMs: pos,
      isPlaying: false,
    });
  }

  public triggerSeek(positionSeconds: number) {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    const isPlaying = usePlayerStore.getState().isPlaying;
    this.broadcast({
      type: 'SEEK',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      positionMs: Math.round(positionSeconds * 1000),
      isPlaying,
    });
  }

  public triggerTrackChange(track: Song | null, queueIndex?: number, queue?: Song[]) {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    this.broadcast({
      type: 'TRACK_CHANGE',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      track,
      queueIndex: queueIndex ?? usePlayerStore.getState().queueIndex,
      queue: queue ?? usePlayerStore.getState().queue,
      positionMs: 0,
      isPlaying: true,
    });
  }

  public triggerQueueUpdate(queue: Song[], queueIndex?: number) {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    this.broadcast({
      type: 'QUEUE_UPDATE',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      queue,
      queueIndex: queueIndex ?? usePlayerStore.getState().queueIndex,
    });
  }

  /**
   * Resynchronizes local player with authoritative server room state.
   * Useful when reconnecting after a network drop or waking up from sleep.
   */
  public async resyncWithServerState() {
    if (!this.isJoined || !this.activeRoomId) return;
    const epoch = this.sessionEpoch;
    try {
      const res = await fetch(`/api/rooms/${this.activeRoomId}`);
      if (!res.ok || !this.isJoined || this.sessionEpoch !== epoch) return;
      const data = await res.json();
      if (!this.isJoined || this.sessionEpoch !== epoch) return;
      const roomState = data.room_state || data.roomState;
      if (!roomState || !this.isJoined || this.sessionEpoch !== epoch) return;

      const player = usePlayerStore.getState();

      let targetSeconds = (roomState.position_ms || 0) / 1000;
      if (roomState.is_playing && roomState.updated_at) {
        const elapsed = Math.max(0, Date.now() - new Date(roomState.updated_at).getTime()) / 1000;
        targetSeconds += elapsed;
      }

      this.lastAuthoritativeTargetMs = Math.round(targetSeconds * 1000);
      this.lastAuthoritativeTimestamp = Date.now();

      if (
        roomState.current_song_id &&
        (!player.currentTrack || player.currentTrack.id !== roomState.current_song_id)
      ) {
        const librarySongs = useLibraryStore.getState().songs;
        let matched = librarySongs.find((s) => s.id === roomState.current_song_id);
        if (!matched) {
          try {
            const songsRes = await fetch('/api/songs');
            if (songsRes.ok) {
              const loadedSongs = await songsRes.json();
              useLibraryStore.getState().setSongs(loadedSongs);
              matched = loadedSongs.find((s: Song) => s.id === roomState.current_song_id);
            }
          } catch {
            // ignore
          }
        }
        if (matched) {
          player.setCurrentTrack(matched);
        }
      }

      if (player.isAudioUnlocked) {
        player.seekTo(targetSeconds);
        player.setIsPlaying(roomState.is_playing);
      } else {
        player.seekTo(targetSeconds);
        player.setNeedsAudioUnlock(true);
        player.setSyncStatus('audio-locked');
      }
    } catch (e) {
      console.warn('[RoomSync] Failed to resync with server state:', e);
    }
  }
}

export const roomSync = new RoomSyncManager();
