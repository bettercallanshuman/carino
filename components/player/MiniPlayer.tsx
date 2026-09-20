'use client';

import { useState, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useUIStore } from '@/stores/uiStore';
import { getCoverUrl } from '@/lib/supabase/storage';
import { CoverImage } from '@/components/ui/CoverImage';
import { AddToPlaylistModal } from '@/components/player/AddToPlaylistModal';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Persistent Floating MiniPlayer
// Evolved to a shorter (62px), floating, translucent surface:
// - ALL FOUR CORNERS ROUNDED (16px)
// - Inset from viewport edges (floating above bottom edge / mobile nav)
// - Translucent dark backdrop with backdrop blur (24px)
// - Full playback & favourites functionality preserved (AudioEngine authority intact)
// - Clean responsive hierarchy:
//   * Desktop: Rich controls with shuffle, repeat, scrub bar, volume, lyrics toggle, expand
//   * Mobile: Streamlined, touch-friendly layout (track info, prev, play/pause, next, fav, lyrics, expand)
// - Lyrics Drawer toggle button integrated
// - Cariño monochrome brand symbol replaces generic emoji placeholder
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

interface MiniPlayerProps {
  demo?: boolean;
}

export function MiniPlayer(props: MiniPlayerProps = {}) {
  void props;
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isProgressHovered, setIsProgressHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Store subscriptions
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration) || (currentTrack?.duration_seconds ?? 0);
  const volume = usePlayerStore((state) => state.volume);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const goToNext = usePlayerStore((state) => state.goToNext);
  const goToPrevious = usePlayerStore((state) => state.goToPrevious);
  const setIsExpanded = usePlayerStore((state) => state.setIsExpanded);
  const seekTo = usePlayerStore((state) => state.seekTo);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const cycleRepeatMode = usePlayerStore((state) => state.cycleRepeatMode);

  // Favourites integration
  const favouriteSongIds = useLibraryStore((state) => state.favouriteSongIds);
  const toggleFavourite = useLibraryStore((state) => state.toggleFavourite);

  // Lyrics Drawer integration
  const isLyricsDrawerOpen = useUIStore((state) => state.isLyricsDrawerOpen);
  const toggleLyricsDrawer = useUIStore((state) => state.toggleLyricsDrawer);

  const isCurrentFav = currentTrack ? favouriteSongIds.includes(currentTrack.id) : false;

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const isProgressFocused = isProgressHovered || isDragging;
  const activePercent = isDragging && dragPercent !== null ? dragPercent * 100 : progressPercent;
  const displayedCurrentTime = isDragging && dragPercent !== null ? dragPercent * duration : currentTime;
  const coverUrl = currentTrack ? getCoverUrl(currentTrack.cover_url || currentTrack.cover_path) : null;

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const calcPct = (clientX: number) => Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const initialPct = calcPct(e.clientX);
    setIsDragging(true);
    setDragPercent(initialPct);

    const onPointerMove = (moveEvt: PointerEvent) => {
      setDragPercent(calcPct(moveEvt.clientX));
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      const finalPct = calcPct(upEvt.clientX);
      seekTo(finalPct * duration);
      setIsDragging(false);
      setDragPercent(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      <div
        className="player-area"
        onClick={() => {
          if (isMobile) {
            setIsExpanded(true);
          }
        }}
        style={{
          background: isMobile ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 18, 20, 0.86)',
          backdropFilter: isMobile ? 'blur(20px)' : 'blur(24px)',
          WebkitBackdropFilter: isMobile ? 'blur(20px)' : 'blur(24px)',
          border: isMobile ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: isMobile
            ? '0 4px 20px rgba(0, 0, 0, 0.35)'
            : '0 12px 36px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4)',
          // All four corners rounded
          borderRadius: isMobile ? '18px' : '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'flex-start' : 'space-between',
          padding: isMobile ? '0 10px 0 8px' : '0 16px',
          height: isMobile ? '56px' : 'var(--player-h)',
          position: 'fixed',
          bottom: isMobile ? 'calc(var(--safe-bottom-nav, 0px) + 76px)' : '24px',
          left: isMobile ? '12px' : 'calc(var(--sidebar-w) + 24px)',
          right: isMobile ? '12px' : isLyricsDrawerOpen ? 'calc(380px + 24px)' : '24px',
          margin: '0 auto',
          maxWidth: isMobile ? '500px' : '740px',
          width: isMobile ? 'calc(100% - 24px)' : undefined,
          userSelect: 'none',
          zIndex: 40,
          overflow: 'hidden',
          cursor: isMobile ? 'pointer' : 'default',
          transition: 'left 0.32s cubic-bezier(0.16, 1, 0.3, 1), right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {isMobile ? (
          /* ── MOBILE MINIPLAYER: Artwork + Title/Artist + Play/Pause + Lyrics + Bottom Progress Line ── */
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                height: '100%',
                padding: '0 12px',
                gap: '12px',
              }}
            >
              {/* LEFT: Artwork + Track Title + Singer/Artist Name */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#1A1A1A',
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {coverUrl ? (
                    <CoverImage
                      src={coverUrl}
                      alt={currentTrack?.title || 'Cover art'}
                      fill
                      sizes="40px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/carino-symbol.svg"
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          opacity: 0.35,
                          filter: 'grayscale(100%)',
                        }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0, flex: 1, paddingRight: '4px' }}>
                  <p
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: 0,
                      letterSpacing: '-0.01em',
                      lineHeight: 1.25,
                    }}
                  >
                    {currentTrack ? currentTrack.title : 'No song selected'}
                  </p>
                  <p
                    style={{
                      fontSize: '11.5px',
                      color: '#8E8E93',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: '2px 0 0',
                      lineHeight: 1.2,
                    }}
                  >
                    {currentTrack ? currentTrack.artist : 'Select a track to play'}
                  </p>
                </div>
              </div>

              {/* RIGHT: Play/Pause + Lyrics/Karaoke */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexShrink: 0,
                }}
              >
                {/* Play / Pause */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlaying(!isPlaying);
                  }}
                  disabled={!currentTrack}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  title={isPlaying ? 'Pause' : 'Play'}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: currentTrack ? '#FFFFFF' : '#333333',
                    color: '#000000',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    boxShadow: currentTrack ? '0 2px 10px rgba(255, 255, 255, 0.25)' : 'none',
                    flexShrink: 0,
                  }}
                >
                  {isPlaying ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>

                {/* Lyrics / Karaoke Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLyricsDrawer();
                  }}
                  aria-label="Toggle Lyrics Drawer"
                  title={isLyricsDrawerOpen ? 'Close Lyrics Drawer' : 'Open Lyrics Drawer'}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isLyricsDrawerOpen ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                    border: isLyricsDrawerOpen ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                    color: isLyricsDrawerOpen ? '#FFFFFF' : '#A1A1AA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* BOTTOM EDGE: Playback Progress Line */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                handleTrackPointerDown(e);
              }}
              role="progressbar"
              aria-label="Playback seek bar"
              aria-valuenow={activePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '10px',
                display: 'flex',
                alignItems: 'flex-end',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '2.5px',
                  background: 'rgba(255, 255, 255, 0.16)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${activePercent}%`,
                    background: '#FFFFFF',
                    position: 'relative',
                    transition: isDragging ? 'none' : 'width 0.15s linear',
                    boxShadow: '0 0 6px rgba(255, 255, 255, 0.5)',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* ── DESKTOP MINIPLAYER (Unchanged) ─────────────────────────────── */
          <>
            {/* ── Subdued Content Layer during Hover/Drag ──────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                height: '100%',
                opacity: isProgressFocused ? 0.22 : 1,
                filter: isProgressFocused ? 'blur(1.5px)' : 'none',
                transition: 'opacity 0.2s ease, filter 0.2s ease',
                pointerEvents: isProgressFocused ? 'none' : 'auto',
              }}
            >
              {/* ── Left: Cover Artwork + Title + Artist ─────────────────────────── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '240px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    background: '#1A1A1A',
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {coverUrl ? (
                    <CoverImage
                      src={coverUrl}
                      alt={currentTrack?.title || 'Cover art'}
                      fill
                      sizes="42px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/carino-symbol.svg"
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          opacity: 0.35,
                          filter: 'grayscale(100%)',
                        }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: 0,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {currentTrack ? currentTrack.title : 'No song selected'}
                  </p>
                  <p
                    style={{
                      fontSize: '11.5px',
                      color: '#8E8E93',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: '1px 0 0',
                    }}
                  >
                    {currentTrack ? currentTrack.artist : 'Select a track to play'}
                  </p>
                </div>
              </div>

              {/* ── Center: Controls & Progress ──────────────────────────────────── */}
              <div
                style={{
                  flex: 1,
                  maxWidth: '480px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '0 12px',
                }}
              >
                {/* Controls Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Shuffle (Desktop only) */}
                  <button
                    onClick={() => setIsShuffle(!isShuffle)}
                    style={{
                      color: isShuffle ? '#FFFFFF' : '#8E8E93',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                    }}
                    aria-label="Shuffle"
                    title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                  </button>

                  {/* Previous */}
                  <button
                    onClick={goToPrevious}
                    disabled={!currentTrack}
                    style={{
                      color: currentTrack ? '#FFFFFF' : '#48484A',
                      background: 'transparent',
                      border: 'none',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: currentTrack ? 'pointer' : 'default',
                      transition: 'transform 0.1s ease',
                    }}
                    aria-label="Previous track"
                    title="Previous"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="19 20 9 12 19 4 19 20" />
                      <line x1="5" y1="19" x2="5" y2="5" />
                    </svg>
                  </button>

                  {/* Play / Pause — dominant white circular button */}
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    disabled={!currentTrack}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: currentTrack ? '#FFFFFF' : '#333333',
                      color: '#000000',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: currentTrack ? 'pointer' : 'default',
                      transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                      boxShadow: currentTrack ? '0 2px 10px rgba(255, 255, 255, 0.25)' : 'none',
                      flexShrink: 0,
                    }}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                  </button>

                  {/* Next */}
                  <button
                    onClick={goToNext}
                    disabled={!currentTrack}
                    style={{
                      color: currentTrack ? '#FFFFFF' : '#48484A',
                      background: 'transparent',
                      border: 'none',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: currentTrack ? 'pointer' : 'default',
                      transition: 'transform 0.1s ease',
                    }}
                    aria-label="Next track"
                    title="Next"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 4 15 12 5 20 5 4" />
                      <line x1="19" y1="5" x2="19" y2="19" />
                    </svg>
                  </button>

                  {/* Repeat Mode (Desktop only) */}
                  <button
                    onClick={cycleRepeatMode}
                    disabled={!currentTrack}
                    style={{
                      position: 'relative',
                      color: repeatMode !== 'off' ? '#FFFFFF' : '#8E8E93',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: currentTrack ? 'pointer' : 'default',
                      transition: 'color 0.15s ease',
                    }}
                    title={
                      repeatMode === 'off'
                        ? 'Repeat: Off'
                        : repeatMode === 'once'
                        ? 'Repeat: Once'
                        : 'Repeat: Infinite'
                    }
                    aria-label={`Repeat mode: ${repeatMode}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>

                    {repeatMode === 'once' && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-3px',
                          right: '-3px',
                          fontSize: '8px',
                          fontWeight: 900,
                          background: '#FFFFFF',
                          color: '#000',
                          borderRadius: '50%',
                          width: '11px',
                          height: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        1
                      </span>
                    )}

                    {repeatMode === 'infinite' && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '0px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '3px',
                          height: '3px',
                          borderRadius: '50%',
                          background: '#FFFFFF',
                        }}
                      />
                    )}
                  </button>
                </div>
              </div>

              {/* ── Right: Extra Controls ────────────────────────────────────────── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '240px',
                  justifyContent: 'flex-end',
                  flexShrink: 0,
                }}
              >
                {/* Favourite / Heart */}
                <button
                  onClick={() => {
                    if (currentTrack) toggleFavourite(currentTrack.id);
                  }}
                  disabled={!currentTrack}
                  style={{
                    color: isCurrentFav ? '#EF4444' : '#8E8E93',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                  }}
                  title={isCurrentFav ? 'Remove from Favourites' : 'Add to Favourites'}
                  aria-label="Favourite"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={isCurrentFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>

                {/* Add to Playlist (+) (Desktop only) */}
                <button
                  onClick={() => setIsPlaylistModalOpen(true)}
                  disabled={!currentTrack}
                  style={{
                    color: '#8E8E93',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: currentTrack ? 'pointer' : 'default',
                    transition: 'color 0.15s ease',
                  }}
                  title="Add to Playlist"
                  aria-label="Add to Playlist"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* Volume Group (Desktop only) — White knob */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#8E8E93', display: 'flex', alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(e) => setVolume(Number(e.target.value) / 100)}
                    aria-label="Volume slider"
                    className="volume-slider-white"
                    style={{
                      width: '64px',
                      height: '3px',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      background: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '9999px',
                      outline: 'none',
                      cursor: 'pointer',
                      accentColor: '#FFFFFF',
                    }}
                  />
                </div>

                {/* ── Lyrics Drawer Toggle ───────────────────────────────────────── */}
                <button
                  onClick={toggleLyricsDrawer}
                  style={{
                    color: isLyricsDrawerOpen ? '#FFFFFF' : '#8E8E93',
                    background: isLyricsDrawerOpen ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    borderRadius: '6px',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title={isLyricsDrawerOpen ? 'Close Lyrics Drawer' : 'Open Lyrics Drawer'}
                  aria-label="Toggle Lyrics Drawer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </button>

                {/* Fullscreen / Expand */}
                <button
                  onClick={() => setIsExpanded(true)}
                  style={{
                    color: '#8E8E93',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                  }}
                  title="Expand player"
                  aria-label="Expand player"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Focused Timestamps Display (Crisp, above subdued content) ──────── */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                opacity: isProgressFocused ? 1 : 0,
                transition: 'opacity 0.2s ease',
                zIndex: 12,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  padding: '3px 9px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
              >
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(displayedCurrentTime)}
                </span>
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  padding: '3px 9px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
              >
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* ── Single Long Horizontal Progress Bar (Primary Seek Control) ─────── */}
            <div
              onMouseEnter={() => setIsProgressHovered(true)}
              onMouseLeave={() => { if (!isDragging) setIsProgressHovered(false); }}
              onPointerDown={handleTrackPointerDown}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: isProgressFocused ? '20px' : '6px',
                display: 'flex',
                alignItems: 'flex-end',
                cursor: 'pointer',
                zIndex: 15,
                transition: 'height 0.15s ease',
              }}
              role="progressbar"
              aria-label="Playback seek bar"
              aria-valuenow={activePercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: '100%',
                  height: isProgressFocused ? '5px' : '3px',
                  background: isProgressFocused ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.12)',
                  position: 'relative',
                  transition: 'height 0.15s ease, background 0.15s ease',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${activePercent}%`,
                    background: '#FFFFFF',
                    position: 'relative',
                    boxShadow: isProgressFocused ? '0 0 10px rgba(255, 255, 255, 0.8)' : 'none',
                    transition: isDragging ? 'none' : 'width 0.15s linear',
                  }}
                >
                  {isProgressFocused && (
                    <div
                      style={{
                        position: 'absolute',
                        right: '-5px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '11px',
                        height: '11px',
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Playlist Picker Modal */}
      <AddToPlaylistModal
        song={currentTrack}
        isOpen={isPlaylistModalOpen}
        onClose={() => setIsPlaylistModalOpen(false)}
      />
    </>
  );
}
