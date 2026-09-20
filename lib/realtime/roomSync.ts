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
// - Host-Only Authoritative Heartbeats & Playback Pulses
// - Two-Way PING/PONG RTT & Clock Skew Calibration (Eliminates raw wall-clock skew)
// - Exponential Moving Average (EMA, alpha=0.25) Signed Drift Filtering
// - Tiered Micro-Rate Tuning (1.03x/0.97x, 1.06x/0.94x, 1.08x/0.92x)
// - 6-Second Hard-Seek Cooldown & 3000ms Threshold (Eliminates jump loops)
// - Physical AudioElement ground truth check
// - Autoplay policy compliance with CARIÑO "Audio Unlock" handshake
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
    | 'CONNECTED'
    | 'PING'
    | 'PONG';
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
  t0?: number;
  t1?: number;
  targetUserId?: string;
}

interface RttSample {
  rtt: number;
  offset: number;
  timestamp: number;
}

class RoomSyncManager {
  public activeTransport: 'supabase-realtime' | 'server-sent-events' | 'unconnected' = 'unconnected';
  private broadcastChannel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private supabaseChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private initialPingTimeout: ReturnType<typeof setTimeout> | null = null;
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

  // Synchronization calibration state
  private estimatedClockOffset: number = 0; // Host clock - Listener clock (ms)
  private estimatedRtt: number = 50; // Bounded RTT estimate (ms)
  private rttSamples: RttSample[] = [];
  private smoothedDriftMs: number = 0; // Signed EMA drift: >0 means listener behind, <0 means listener ahead
  private lastHardSeekTime: number = 0; // Timestamp of last hard seek (for 6s cooldown)
  private hasInitialSync: boolean = false;

  /**
   * Helper: Determines if the local user is the authoritative Room Host
   */
  public checkIfHost(): boolean {
    const room = useRoomStore.getState().room;
    return useRoomStore.getState().isHost || Boolean(room && this.currentUserId && room.host_user_id === this.currentUserId);
  }

  /**
   * Calculates current authoritative room position in seconds based on elapsed time.
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

    // Reset calibration metrics on join
    this.smoothedDriftMs = 0;
    this.lastHardSeekTime = 0;
    this.hasInitialSync = false;
    this.estimatedClockOffset = 0;
    this.estimatedRtt = 50;
    this.rttSamples = [];

    usePlayerStore.getState().setRoomId(roomId);
    usePlayerStore.getState().setIsConnected(true);
    usePlayerStore.getState().setPlaybackRate(1.0);
    usePlayerStore.getState().setEstimatedDriftMs(0);

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

    // 4. Periodic Timers:
    // - Heartbeat (every 2000ms): Only executed if local client is Room Host
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 2000);

    // - Calibration Ping (every 10000ms): Only executed if local client is a Listener
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, 10000);

    // Initial calibration ping 500ms after channel initialization
    this.initialPingTimeout = setTimeout(() => {
      this.sendPing();
    }, 500);

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

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.initialPingTimeout) {
      clearTimeout(this.initialPingTimeout);
      this.initialPingTimeout = null;
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
    this.smoothedDriftMs = 0;
    this.lastHardSeekTime = 0;
    this.hasInitialSync = false;
    this.estimatedClockOffset = 0;
    this.estimatedRtt = 50;
    this.rttSamples = [];

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
    if (message.type !== 'HEARTBEAT' && message.type !== 'PRESENCE_PING' && message.type !== 'PING' && message.type !== 'PONG') {
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
   * Records a PONG response to calculate round-trip time and clock offset
   */
  private recordPongSample(t0: number, t1: number, t2: number) {
    const rtt = Math.max(0, t2 - t0);
    // Discard gross anomalies caused by background suspension or extreme network stalls
    if (rtt > 2000) return;

    // Clock offset = Host Clock - Listener Clock
    const offset = t1 - Math.round((t0 + t2) / 2);
    this.rttSamples.push({ rtt, offset, timestamp: t2 });

    if (this.rttSamples.length > 5) {
      this.rttSamples.shift();
    }

    // NTP Principle: The sample with the lowest RTT has the minimum path asymmetry uncertainty
    let best = this.rttSamples[0];
    for (const s of this.rttSamples) {
      if (s.rtt < best.rtt) {
        best = s;
      }
    }

    this.estimatedRtt = best.rtt;
    this.estimatedClockOffset = best.offset;
  }

  /**
   * Handles incoming message from peer
   */
  private handleIncomingMessage(msg: RoomSyncMessage, epoch?: number) {
    // 1. Explicit membership and session guards
    if (!msg || !this.isJoined || !this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;
    if (epoch !== undefined && epoch !== this.sessionEpoch) return;

    const activeRoomId = this.activeRoomId;
    const activeRoomCode = this.activeRoomCode;
    const currentUserId = this.currentUserId;

    // Check store-level room membership
    const currentRoom = useRoomStore.getState().room;
    if (!currentRoom || currentRoom.id !== activeRoomId) return;

    // 2. Ignore self messages
    if (msg.senderId === currentUserId) return;

    // 3. Ignore messages from other rooms
    if (msg.roomId && msg.roomId !== activeRoomId) return;
    if (msg.roomCode && msg.roomCode.toUpperCase() !== activeRoomCode) return;

    const audio = getAuthoritativeAudio();
    const now = Date.now();

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
      const isHost = this.checkIfHost();

      switch (msg.type) {
        case 'PING': {
          // Only the Host replies to calibration PINGs
          if (!isHost) return;
          this.broadcast({
            type: 'PONG',
            roomId: activeRoomId,
            roomCode: activeRoomCode,
            senderId: currentUserId,
            senderName: this.currentUserName,
            timestamp: Date.now(),
            t0: msg.t0 ?? msg.timestamp,
            t1: Date.now(),
            targetUserId: msg.senderId,
          });
          break;
        }

        case 'PONG': {
          // Only the targeted listener processes calibration PONG
          if (isHost) return;
          if (msg.targetUserId && msg.targetUserId !== this.currentUserId) return;
          if (msg.t0) {
            this.recordPongSample(msg.t0, msg.t1 ?? msg.timestamp, now);
          }
          break;
        }

        case 'TRACK_CHANGE': {
          if (msg.track) {
            player.setCurrentTrack(msg.track);

            const hostTimeInLocal = msg.timestamp - this.estimatedClockOffset;
            const elapsedSinceHostMs = msg.isPlaying ? Math.max(0, Math.min(3000, now - hostTimeInLocal)) : 0;
            const targetMs = (msg.positionMs || 0) + elapsedSinceHostMs;

            this.lastAuthoritativeTargetMs = targetMs;
            this.lastAuthoritativeTimestamp = now;
            this.smoothedDriftMs = 0; // Reset EMA on track change
            this.hasInitialSync = false;
            this.lastHardSeekTime = now;
            player.setPlaybackRate(1.0);

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
          const hostTimeInLocal = msg.timestamp - this.estimatedClockOffset;
          const elapsedSinceHostMs = Math.max(0, Math.min(3000, now - hostTimeInLocal));
          const targetMs = (msg.positionMs || 0) + elapsedSinceHostMs;

          this.lastAuthoritativeTargetMs = targetMs;
          this.lastAuthoritativeTimestamp = now;

          if (!player.isAudioUnlocked) {
            console.log('[RoomSync] Received PLAY but audio is locked awaiting user gesture.');
            player.setNeedsAudioUnlock(true);
            player.setSyncStatus('audio-locked');
            player.setIsPlaying(true);
          } else {
            const rawDrift = targetMs - currentLocalMs;
            this.smoothedDriftMs = rawDrift;
            this.hasInitialSync = true;

            if (!player.isPlaying) {
              player.setIsPlaying(true);
            }

            if (Math.abs(rawDrift) > 3000) {
              this.lastHardSeekTime = now;
              player.seekTo(targetMs / 1000);
              player.setPlaybackRate(1.0);
              this.smoothedDriftMs = 0;
              this.updateDriftMetrics(0, 'synced');
            } else {
              this.correctDrift(this.smoothedDriftMs, currentLocalMs, targetMs);
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
          this.smoothedDriftMs = 0;

          // When paused, playbackRate returns to normal
          player.setPlaybackRate(1.0);
          player.setSyncStatus('synced');
          player.setEstimatedDriftMs(0);
          break;
        }

        case 'SEEK': {
          const hostTimeInLocal = msg.timestamp - this.estimatedClockOffset;
          const elapsedSinceHostMs = msg.isPlaying ? Math.max(0, Math.min(3000, now - hostTimeInLocal)) : 0;
          const targetMs = (msg.positionMs || 0) + elapsedSinceHostMs;

          this.lastAuthoritativeTargetMs = targetMs;
          this.lastAuthoritativeTimestamp = now;

          player.seekTo(targetMs / 1000);
          this.smoothedDriftMs = 0; // Reset EMA on seek
          this.lastHardSeekTime = now; // Lockout hard seeks for 6s after intentional seek
          player.setPlaybackRate(1.0);

          if (msg.isPlaying !== undefined) {
            player.setIsPlaying(msg.isPlaying);
          }

          if (player.audioPaused && player.isPlaying) {
            player.setSyncStatus('audio-locked');
          } else {
            player.setSyncStatus('synced');
            player.setEstimatedDriftMs(0);
          }
          break;
        }

        case 'HEARTBEAT': {
          // 1. Host NEVER corrects drift from incoming heartbeats (eliminates feedback loop)
          if (isHost) return;

          // 2. Only accept authoritative heartbeats from the designated Room Host
          const room = useRoomStore.getState().room;
          if (room && room.host_user_id && msg.senderId !== room.host_user_id) {
            return;
          }

          if (msg.isPlaying) {
            // Convert Host's timestamp into Listener's clock domain using calibrated offset
            const hostTimeInLocal = msg.timestamp - this.estimatedClockOffset;
            // Bounded elapsed time since host sample
            const elapsedSinceHostMs = Math.max(0, Math.min(5000, now - hostTimeInLocal));
            const targetMs = (msg.positionMs || 0) + elapsedSinceHostMs;

            this.lastAuthoritativeTargetMs = targetMs;
            this.lastAuthoritativeTimestamp = now;

            // Ground truth check: does actual audio element agree?
            if (!player.isAudioUnlocked || player.audioPaused) {
              player.setSyncStatus('audio-locked');
              player.setNeedsAudioUnlock(true);
            } else {
              // Signed drift: positive means listener is behind host (needs to speed up)
              // negative means listener is ahead of host (needs to slow down)
              const rawSignedDrift = targetMs - currentLocalMs;

              // Apply Exponential Moving Average (alpha = 0.25)
              if (!this.hasInitialSync || this.smoothedDriftMs === 0) {
                this.smoothedDriftMs = rawSignedDrift;
                this.hasInitialSync = true;
              } else {
                this.smoothedDriftMs = (0.25 * rawSignedDrift) + (0.75 * this.smoothedDriftMs);
              }

              this.correctDrift(this.smoothedDriftMs, currentLocalMs, targetMs);
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
   * Controls playback rate smoothly and guards against hard-seek thrashing
   */
  private correctDrift(smoothedDrift: number, localMs: number, targetMs: number) {
    const player = usePlayerStore.getState();
    const audio = getAuthoritativeAudio();

    // Strict audio reality check: if audio element is paused, cannot be synced!
    if (audio && audio.paused && player.isPlaying) {
      player.setSyncStatus('audio-locked');
      return;
    }

    const absDrift = Math.abs(smoothedDrift);
    const now = Date.now();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. HARD SEEK SAFETY CHECK (Only for extreme desync > 3000ms)
    // ─────────────────────────────────────────────────────────────────────────
    if (absDrift > 3000) {
      // 6-second cooldown check: prevent repeated hard seek loops
      if (now - this.lastHardSeekTime < 6000) {
        // During cooldown, apply maximum rate adjustment without interrupting audio
        const rate = smoothedDrift > 0 ? 1.08 : 0.92;
        player.setPlaybackRate(rate);
        this.updateDriftMetrics(smoothedDrift, 'correcting');
        return;
      }

      this.lastHardSeekTime = now;
      player.setSyncStatus('correcting');
      player.seekTo(targetMs / 1000);
      player.setPlaybackRate(1.0);
      this.smoothedDriftMs = 0; // Reset EMA
      this.updateDriftMetrics(0, 'correcting');
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. TIERED PLAYBACK RATE CONTROLLER
    // | Signed drift             | Playback Rate | Action                        |
    // | abs < 180ms              | 1.00          | In sync, undisturbed audio    |
    // | 180–600ms behind (+drf)  | 1.03          | Gentle catch-up               |
    // | 180–600ms ahead (-drf)   | 0.97          | Gentle slow-down              |
    // | 600–1500ms behind (+drf) | 1.06          | Moderate catch-up             |
    // | 600–1500ms ahead (-drf)  | 0.94          | Moderate slow-down            |
    // | 1500–3000ms behind (+drf)| 1.08          | High catch-up (no hard seek)  |
    // | 1500–3000ms ahead (-drf) | 0.92          | High slow-down (no hard seek) |
    // ─────────────────────────────────────────────────────────────────────────

    if (absDrift < 180) {
      player.setPlaybackRate(1.0);
      this.updateDriftMetrics(smoothedDrift, 'synced');
      return;
    }

    if (absDrift <= 600) {
      const rate = smoothedDrift > 0 ? 1.03 : 0.97;
      player.setPlaybackRate(rate);
      this.updateDriftMetrics(smoothedDrift, 'drifting');
      return;
    }

    if (absDrift <= 1500) {
      const rate = smoothedDrift > 0 ? 1.06 : 0.94;
      player.setPlaybackRate(rate);
      this.updateDriftMetrics(smoothedDrift, 'drifting');
      return;
    }

    // 1500ms - 3000ms: Strong non-disruptive rate correction
    const rate = smoothedDrift > 0 ? 1.08 : 0.92;
    player.setPlaybackRate(rate);
    this.updateDriftMetrics(smoothedDrift, 'correcting');
  }

  private updateDriftMetrics(drift: number, statusOverride?: SyncStatus) {
    const player = usePlayerStore.getState();
    const absDrift = Math.round(Math.abs(drift));
    player.setEstimatedDriftMs(absDrift);

    const audio = getAuthoritativeAudio();
    if (audio && audio.paused && player.isPlaying) {
      player.setSyncStatus('audio-locked');
      useRoomStore.getState().setSyncMetrics?.('audio-locked', absDrift);
      return;
    }

    let status: SyncStatus = statusOverride || 'synced';
    if (!statusOverride) {
      if (absDrift >= 1500) status = 'correcting';
      else if (absDrift >= 180) status = 'drifting';
    }

    player.setSyncStatus(status);
    useRoomStore.getState().setSyncMetrics?.(status, absDrift);
  }

  /**
   * Periodically broadcasts authoritative playback state (Host ONLY)
   */
  private sendHeartbeat() {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;

    // RULE: ONLY the room Host broadcasts periodic heartbeats!
    if (!this.checkIfHost()) return;

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

  /**
   * Periodically pings the Host to calibrate RTT and clock offset (Listeners ONLY)
   */
  private sendPing() {
    if (!this.activeRoomId || !this.activeRoomCode || !this.currentUserId) return;

    // Listeners send pings to Host; Host never pings itself
    if (this.checkIfHost()) return;

    this.broadcast({
      type: 'PING',
      roomId: this.activeRoomId,
      roomCode: this.activeRoomCode,
      senderId: this.currentUserId,
      senderName: this.currentUserName,
      timestamp: Date.now(),
      t0: Date.now(),
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
      this.smoothedDriftMs = 0;
      this.hasInitialSync = false;
      this.lastHardSeekTime = Date.now();
      player.setPlaybackRate(1.0);

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
