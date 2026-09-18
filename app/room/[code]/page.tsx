'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { ExpandedPlayer } from '@/components/player/ExpandedPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { CoverImage } from '@/components/ui/CoverImage';
import { useRoomStore } from '@/stores/roomStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAuthStore } from '@/stores/authStore';
import { getSongs } from '@/lib/supabase/songs';
import { getCoverUrl } from '@/lib/supabase/storage';
import { useCatalogSync } from '@/lib/realtime/catalogSync';
import { roomSync } from '@/lib/realtime/roomSync';
import { unlockAuthoritativeAudio } from '@/components/player/AudioEngine';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Active Shared-Listening Room Page
// Full synchronization: Play, Pause, Seek, Queue, Next/Previous, Drift Correction.
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface RoomCodePageProps {
  params: Promise<{ code: string }>;
}

export default function RoomCodePage({ params }: RoomCodePageProps) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.code.toUpperCase();
  const router = useRouter();

  // Store state
  const room = useRoomStore((state) => state.room);
  const members = useRoomStore((state) => state.members);
  const roomState = useRoomStore((state) => state.roomState);
  const isHost = useRoomStore((state) => state.isHost);
  const joinRoom = useRoomStore((state) => state.joinRoom);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const fetchRoom = useRoomStore((state) => state.fetchRoom);
  const syncStatus = usePlayerStore((state) => state.syncStatus);
  const estimatedDriftMs = usePlayerStore((state) => state.estimatedDriftMs);
  const isAudioUnlocked = usePlayerStore((state) => state.isAudioUnlocked);
  const needsAudioUnlock = usePlayerStore((state) => state.needsAudioUnlock);
  const userProfile = useLibraryStore((state) => state.userProfile);
  const authUser = useAuthStore((state) => state.user);

  // Playback state
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration) || (currentTrack?.duration_seconds ?? 0);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const goToNext = usePlayerStore((state) => state.goToNext);
  const goToPrevious = usePlayerStore((state) => state.goToPrevious);
  const seekTo = usePlayerStore((state) => state.seekTo);

  // Catalog
  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);

  // UI state
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const isLeavingRef = useRef(false);

  // Mount real-time catalog synchronization in room
  useCatalogSync();

  // 1. Load songs if needed
  useEffect(() => {
    async function loadCatalog() {
      if (songs.length === 0) {
        try {
          const loaded = await getSongs();
          setSongs(loaded);
        } catch {
          // ignore
        }
      }
    }
    loadCatalog();
  }, [songs.length, setSongs]);

  // Clean up and leave room when navigating away from the room page
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  // 2. Ensure connection to room
  useEffect(() => {
    if (isLeavingRef.current) return;
    let isMounted = true;

    async function initializeRoom() {
      if (isLeavingRef.current) return;
      const activeRoomCode = useRoomStore.getState().room?.room_code?.toUpperCase();
      if (activeRoomCode !== roomCode) {
        setIsInitialLoading(true);
        const authUser = useAuthStore.getState().user;
        const displayName = authUser?.display_name || userProfile?.name || '';
        const res = await joinRoom(roomCode, displayName);
        if (isMounted && !isLeavingRef.current) {
          setIsInitialLoading(false);
          if (!res.success) {
            router.push('/room');
          }
        }
      } else {
        setIsInitialLoading(false);
      }
    }

    initializeRoom();

    return () => {
      isMounted = false;
    };
  }, [roomCode, userProfile?.name, joinRoom, router]);

  // 3. Keep room participants dynamically in sync
  useEffect(() => {
    if (!room?.id || isLeavingRef.current) return;
    const interval = setInterval(() => {
      if (!isLeavingRef.current) {
        fetchRoom(roomCode);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [room?.id, roomCode, fetchRoom]);

  // Copy code handler
  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Copy invite link handler
  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/room/${roomCode}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Leave room handler
  const handleLeave = async () => {
    isLeavingRef.current = true;
    await leaveRoom();
    router.push('/room');
  };

  // Play / Pause toggle with room broadcast
  const handleTogglePlay = () => {
    if (!currentTrack) return;
    const nextState = !isPlaying;
    setIsPlaying(nextState);
  };

  // Seek handler with room broadcast
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSeconds = percent * duration;
    seekTo(targetSeconds);
  };

  // Start playing a song from library in the room
  const handlePlaySongInRoom = (song: Song) => {
    setQueue([song], 0);
    setIsPlaying(true);
    setIsCatalogOpen(false);
  };

  // Add song to shared room queue
  const handleAddToRoomQueue = (song: Song) => {
    const updatedQueue = [...queue, song];
    usePlayerStore.getState().setQueue(updatedQueue, queueIndex);
    roomSync.triggerQueueUpdate(updatedQueue, queueIndex);
  };

  // Audio Unlock handler: establishes browser autoplay permission within user gesture
  const handleUnlockAudio = async () => {
    let targetSeconds: number | undefined;
    if (roomState) {
      if (roomState.is_playing && roomState.updated_at) {
        const elapsedSec = Math.max(0, Date.now() - new Date(roomState.updated_at).getTime()) / 1000;
        targetSeconds = Math.max(0, (roomState.position_ms / 1000) + elapsedSec);
      } else {
        targetSeconds = (roomState.position_ms || 0) / 1000;
      }
    } else {
      targetSeconds = roomSync.getComputedAuthoritativeTime() || currentTime;
    }

    await unlockAuthoritativeAudio(targetSeconds);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const coverUrl = currentTrack ? getCoverUrl(currentTrack.cover_url || currentTrack.cover_path) : null;

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Room', href: '/room' }, { label: roomCode }]} />

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px 100px 32px',
            maxWidth: '1080px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          {isInitialLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '360px',
                gap: '16px',
                color: '#8E8E93',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '3px solid rgba(255, 255, 255, 0.1)',
                  borderTopColor: '#EC4899',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p style={{ fontSize: '14px', fontWeight: 600 }}>Connecting to Room {roomCode}...</p>
            </div>
          ) : (
            <>
              {/* ── Room Top Bar ──────────────────────────────────────────────── */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: '#121214',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '28px',
                }}
              >
                {/* Left: Room Code & Copy Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      background: '#1A1A1E',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 600, letterSpacing: '0.04em' }}>
                      ROOM CODE {isHost ? '• HOST' : ''}
                    </span>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#FFFFFF',
                        fontFamily: 'monospace',
                        letterSpacing: '0.12em',
                      }}
                    >
                      {roomCode}
                    </span>
                  </div>

              <button
                onClick={handleCopyCode}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background 0.15s ease',
                }}
                className="press"
              >
                {copiedCode ? '✓ Copied Code' : 'Copy Code'}
              </button>

              <button
                onClick={handleCopyLink}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background 0.15s ease',
                }}
                className="press"
              >
                {copiedLink ? '✓ Copied Invite Link' : 'Copy Invite Link'}
              </button>
            </div>

            {/* Right: Sync Status Badge & Leave Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Sync Status Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  background:
                    syncStatus === 'audio-locked'
                      ? 'rgba(236, 72, 153, 0.15)'
                      : syncStatus === 'ready'
                      ? 'rgba(59, 130, 246, 0.12)'
                      : syncStatus === 'synced'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : syncStatus === 'correcting'
                      ? 'rgba(251, 191, 36, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${
                    syncStatus === 'audio-locked'
                      ? 'rgba(236, 72, 153, 0.4)'
                      : syncStatus === 'ready'
                      ? 'rgba(59, 130, 246, 0.3)'
                      : syncStatus === 'synced'
                      ? 'rgba(34, 197, 94, 0.45)'
                      : syncStatus === 'correcting'
                      ? 'rgba(251, 191, 36, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                  }`,
                  color:
                    syncStatus === 'audio-locked'
                      ? '#F472B6'
                      : syncStatus === 'ready'
                      ? '#60A5FA'
                      : syncStatus === 'synced'
                      ? '#22C55E'
                      : syncStatus === 'correcting'
                      ? '#FBBF24'
                      : '#F87171',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background:
                      syncStatus === 'audio-locked'
                        ? '#EC4899'
                        : syncStatus === 'ready'
                        ? '#3B82F6'
                        : syncStatus === 'synced'
                        ? '#22C55E'
                        : syncStatus === 'correcting'
                        ? '#FBBF24'
                        : '#EF4444',
                    boxShadow:
                      syncStatus === 'audio-locked'
                        ? '0 0 8px #EC4899'
                        : syncStatus === 'ready'
                        ? '0 0 8px #3B82F6'
                        : syncStatus === 'synced'
                        ? '0 0 10px #22C55E'
                        : syncStatus === 'correcting'
                        ? '0 0 8px #FBBF24'
                        : '0 0 8px #EF4444',
                  }}
                />
                {syncStatus === 'audio-locked' && 'Audio Locked (Tap to Listen)'}
                {syncStatus === 'ready' && 'Audio Ready'}
                {syncStatus === 'synced' && `Synced (< ${Math.max(12, estimatedDriftMs)}ms drift)`}
                {syncStatus === 'correcting' && `Catching Up (${estimatedDriftMs}ms)`}
                {syncStatus === 'drifting' && `Drifting (${estimatedDriftMs}ms)`}
                {syncStatus === 'disconnected' && 'Connecting...'}
              </div>

              {/* Leave Room Button */}
              <button
                onClick={handleLeave}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  borderRadius: '9999px',
                  padding: '7px 16px',
                  color: '#EF4444',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                className="press"
              >
                Leave Room
              </button>
            </div>
          </div>

          {/* ── CARIÑO Audio Unlock Handshake Banner ─────────────────────── */}
          {(needsAudioUnlock || (!isAudioUnlocked && !isHost && (isPlaying || roomState?.is_playing || currentTrack))) && (
            <div
              style={{
                width: '100%',
                padding: '18px 22px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                border: '1px solid rgba(236, 72, 153, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '24px',
                boxShadow: '0 8px 28px rgba(236, 72, 153, 0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: '#EC4899',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: '#FFFFFF',
                    boxShadow: '0 0 16px rgba(236, 72, 153, 0.6)',
                    flexShrink: 0,
                  }}
                >
                  🎧
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 3px 0', letterSpacing: '-0.01em' }}>
                    Tap to start listening
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#E4E4E7', margin: 0 }}>
                    {isPlaying || roomState?.is_playing
                      ? 'The host is playing. Tap to join the live session in sync.'
                      : 'Tap once to enable real-time audio playback for this session.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleUnlockAudio}
                style={{
                  padding: '11px 22px',
                  borderRadius: '9999px',
                  background: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                  boxShadow: '0 4px 16px rgba(255, 255, 255, 0.3)',
                  transition: 'transform 0.15s ease',
                }}
                className="press"
              >
                <span>▶</span>
                <span>Start Listening</span>
              </button>
            </div>
          )}

          {/* ── Grid: Main Stage (Left) & Room Info / Queue (Right) ────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.8fr',
              gap: '24px',
            }}
          >
            {/* ── Left Column: Now Playing Hero ────────────────────────────── */}
            <div
              style={{
                background: '#121214',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '32px 28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Subtle ambient glow */}
              <div
                style={{
                  position: 'absolute',
                  top: '-40px',
                  width: '280px',
                  height: '280px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(236, 72, 153, 0.15) 0%, transparent 70%)',
                  filter: 'blur(30px)',
                  pointerEvents: 'none',
                }}
              />

              {/* Large Cover Art */}
              <div
                style={{
                  width: '240px',
                  height: '240px',
                  borderRadius: '16px',
                  background: '#1A1A1E',
                  overflow: 'hidden',
                  position: 'relative',
                  marginBottom: '24px',
                  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
                }}
              >
                {coverUrl ? (
                  <CoverImage
                    src={coverUrl}
                    alt={currentTrack?.title || 'Cover art'}
                    fill
                    sizes="240px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#636366',
                    }}
                  >
                    <span style={{ fontSize: '48px' }}>🎵</span>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>No Track Playing</span>
                  </div>
                )}
              </div>

              {/* Track Title & Artist */}
              <h2
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  margin: '0 0 6px 0',
                  letterSpacing: '-0.02em',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentTrack ? currentTrack.title : 'Ready to listen together'}
              </h2>
              <p
                style={{
                  fontSize: '14px',
                  color: '#8E8E93',
                  margin: '0 0 24px 0',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentTrack ? `${currentTrack.artist}${currentTrack.album ? ` • ${currentTrack.album}` : ''}` : 'Pick a song from the library to start'}
              </p>

              {/* Synchronized Timeline Scrub Bar */}
              <div style={{ width: '100%', maxWidth: '420px', marginBottom: '24px' }}>
                <div
                  onClick={handleSeek}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    position: 'relative',
                    cursor: currentTrack ? 'pointer' : 'default',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      background: '#FFFFFF',
                      borderRadius: '3px',
                      transition: 'width 0.1s linear',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#8E8E93',
                    fontFamily: 'monospace',
                    marginTop: '6px',
                  }}
                >
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Playback Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
                {/* Previous */}
                <button
                  onClick={goToPrevious}
                  disabled={!currentTrack}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: currentTrack ? '#FFFFFF' : '#48484A',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    transition: 'transform 0.1s ease',
                  }}
                  className="press"
                  aria-label="Previous track"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="19 20 9 12 19 4 19 20" />
                    <line x1="5" y1="19" x2="5" y2="5" />
                  </svg>
                </button>

                {/* Main Synchronized Play/Pause Button */}
                <button
                  onClick={handleTogglePlay}
                  disabled={!currentTrack}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    color: '#000000',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    opacity: currentTrack ? 1 : 0.5,
                    boxShadow: '0 4px 20px rgba(255, 255, 255, 0.25)',
                    transition: 'transform 0.15s ease',
                  }}
                  className="press"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={goToNext}
                  disabled={!currentTrack}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: currentTrack ? '#FFFFFF' : '#48484A',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    transition: 'transform 0.1s ease',
                  }}
                  className="press"
                  aria-label="Next track"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                </button>
              </div>

              {/* Add Song to Room Button */}
              <button
                onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                style={{
                  padding: '10px 22px',
                  borderRadius: '9999px',
                  background: isCatalogOpen ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.15s ease',
                }}
                className="press"
              >
                <span>➕</span>
                <span>{isCatalogOpen ? 'Close Library Picker' : 'Choose Song From Library'}</span>
              </button>

              {/* In-Room Library Drawer */}
              {isCatalogOpen && (
                <div
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '16px',
                    borderRadius: '14px',
                    background: '#18181B',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#8E8E93', margin: '0 0 10px 0' }}>
                    SELECT A TRACK TO PLAY SYNCHRONOUSLY
                  </p>
                  {songs.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#636366' }}>No songs in library yet.</p>
                  ) : (
                    songs.map((song) => {
                      const itemCover = getCoverUrl(song.cover_url || song.cover_path);
                      return (
                        <div
                          key={song.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: currentTrack?.id === song.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            marginBottom: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                              {itemCover ? (
                                <CoverImage src={itemCover} alt={song.title} fill sizes="36px" style={{ objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🎵</div>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {song.title}
                              </p>
                              <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {song.artist}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => handlePlaySongInRoom(song)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                background: '#FFFFFF',
                                color: '#000000',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              className="press"
                            >
                              Play Now
                            </button>
                            <button
                              onClick={() => handleAddToRoomQueue(song)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              className="press"
                            >
                              + Queue
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* ── Right Column: Partner Presence & Room Queue ──────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Partner Presence Card */}
              <div
                style={{
                  background: '#121214',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '18px',
                  padding: '22px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>
                    Listening Together ({members.length})
                  </h3>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#34D399',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34D399' }} />
                    LIVE
                  </span>
                </div>

                {/* Member List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {members.map((m) => {
                    const isMe = authUser?.id === m.user_id;
                    const rawAvatar = (isMe ? (authUser?.avatar_url || userProfile?.avatar_url) : null) || m.avatar_url;
                    const avatarUrl = rawAvatar ? getCoverUrl(rawAvatar) : null;
                    const displayName = (isMe ? (authUser?.display_name || userProfile?.name) : null) || m.display_name || 'Listener';
                    const isHost = room && m.user_id === room.host_user_id;

                    return (
                      <div
                        key={m.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: '#18181B',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#FFFFFF',
                              }}
                            >
                              {(displayName || 'L').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                              {displayName}
                            </p>
                            <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0' }}>
                              {isHost ? 'Host' : 'Listener'}
                            </p>
                          </div>
                        </div>

                        <div style={{ fontSize: '11px', color: '#34D399', fontWeight: 600 }}>
                          Active
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty state / Invite placeholder if alone in room */}
                  {members.length === 1 && (
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: '10px',
                        background: 'rgba(236, 72, 153, 0.06)',
                        border: '1px dashed rgba(236, 72, 153, 0.3)',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ fontSize: '12.5px', color: '#F472B6', fontWeight: 600, margin: '0 0 8px 0' }}>
                        Waiting for your partner to join...
                      </p>
                      <p style={{ fontSize: '11.5px', color: '#8E8E93', margin: '0 0 12px 0' }}>
                        Share code <strong style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{roomCode}</strong> or send the invite link.
                      </p>
                      <button
                        onClick={handleCopyLink}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '9999px',
                          background: '#EC4899',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        className="press"
                      >
                        {copiedLink ? '✓ Link Copied!' : 'Share Invite Link'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Shared Room Queue Card */}
              <div
                style={{
                  background: '#121214',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '18px',
                  padding: '22px 20px',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>
                    Shared Queue ({queue.length})
                  </h3>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                  {queue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 10px', color: '#636366' }}>
                      <p style={{ fontSize: '13px', margin: 0 }}>Queue is empty</p>
                      <p style={{ fontSize: '11px', color: '#48484A', margin: '4px 0 0' }}>Add songs from your library</p>
                    </div>
                  ) : (
                    queue.map((track, idx) => {
                      const isCurrent = idx === queueIndex;
                      const trackCover = getCoverUrl(track.cover_url || track.cover_path);
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          onClick={() => {
                            usePlayerStore.getState().playTrackFromQueue(idx);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: isCurrent ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                          className="press"
                        >
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: isCurrent ? '#FFFFFF' : 'transparent',
                              color: isCurrent ? '#000000' : '#636366',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isCurrent ? '10px' : '11px',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {isCurrent ? '▶' : idx + 1}
                          </div>
                          <div style={{ width: '32px', height: '32px', borderRadius: '6px', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                            {trackCover ? (
                              <CoverImage src={trackCover} alt={track.title} fill sizes="32px" style={{ objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🎵</div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: isCurrent ? '#FFFFFF' : '#D1D1D6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {track.title}
                            </p>
                            <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {track.artist}
                            </p>
                          </div>
                          <div style={{ fontSize: '11px', color: '#636366', fontFamily: 'monospace' }}>
                            {formatTime(track.duration_seconds)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
      <RightPanel />
      <MiniPlayer />
      <ExpandedPlayer />
      <BottomNav />
      <AccountModal />
      <CockpitModal />
    </>
  );
}
