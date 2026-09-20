'use client';

import { useCallback, useMemo } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { getCoverUrl } from '@/lib/supabase/storage';
import { AlbumCarousel } from '@/components/player/AlbumCarousel';
import { CarouselBackground } from '@/components/player/CarouselBackground';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Fullscreen Expanded Player
//
// Minimal, monochrome, icon-only fullscreen music player controls.
// Consumes strictly existing playerStore and libraryStore state/actions.
// Zero modification to AudioEngine, playerStore, or audio fade architecture.
//
// Visual Language:
// - Minimal, monochrome aesthetic
// - Icon-only, thin line icons
// - Primary Play/Pause remains the dominant white circular control
// - Secondary controls (Repeat, Previous, Next, Like, Volume/Mute) are visually subordinate
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function ExpandedPlayer() {
  // Player state
  const isExpanded = usePlayerStore((s) => s.isExpanded);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const queue = usePlayerStore((s) => s.queue);
  const repeatMode = usePlayerStore((s) => s.repeatMode);

  // Player actions
  const setIsExpanded = usePlayerStore((s) => s.setIsExpanded);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const goToNext = usePlayerStore((s) => s.goToNext);
  const goToPrevious = usePlayerStore((s) => s.goToPrevious);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const playTrackFromQueue = usePlayerStore((s) => s.playTrackFromQueue);
  const cycleRepeatMode = usePlayerStore((s) => s.cycleRepeatMode);

  // Library store (favorites / likes)
  const favouriteSongIds = useLibraryStore((s) => s.favouriteSongIds);
  const toggleFavourite = useLibraryStore((s) => s.toggleFavourite);
  const librarySongs = useLibraryStore((s) => s.songs);

  // Use library songs as the carousel dataset. If queue is populated, prefer queue.
  const carouselSongs = useMemo(() => {
    return librarySongs.length > 0 ? librarySongs : queue;
  }, [librarySongs, queue]);

  // Current cover for the background
  const centerCoverUrl = useMemo(() => {
    if (!currentTrack) return null;
    return getCoverUrl(currentTrack.cover_url || currentTrack.cover_path);
  }, [currentTrack]);

  // Like / Favorite status
  const isCurrentFav = currentTrack ? favouriteSongIds.includes(currentTrack.id) : false;

  const handleToggleFav = useCallback(() => {
    if (currentTrack) {
      toggleFavourite(currentTrack.id);
    }
  }, [currentTrack, toggleFavourite]);

  // Handle selecting a song from the carousel
  const handleSelectSong = useCallback(
    (song: Song, indexInCarousel: number) => {
      const qIdx = queue.findIndex((t) => t.id === song.id);
      if (qIdx >= 0) {
        playTrackFromQueue(qIdx);
      } else {
        setQueue(carouselSongs, indexInCarousel);
      }
    },
    [queue, playTrackFromQueue, setQueue, carouselSongs]
  );

  // Toggle play/pause
  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  // Seek handler
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const effectiveDuration = duration || currentTrack?.duration_seconds || 0;
      if (effectiveDuration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      seekTo(percent * effectiveDuration);
    },
    [duration, currentTrack, seekTo]
  );


  // Close expanded player
  const handleClose = useCallback(() => {
    setIsExpanded(false);
  }, [setIsExpanded]);

  // Only render when expanded and there's a current track
  if (!isExpanded || !currentTrack) return null;

  const effectiveDuration = duration || currentTrack.duration_seconds || 0;
  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div
      className="expanded-player-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* ── Blurred Background (GPU layer promoted) ────────────────────── */}
      <CarouselBackground coverUrl={centerCoverUrl} />

      {/* ── Content Layer ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: 'calc(20px + var(--safe-top, 0px)) 20px calc(20px + var(--safe-bottom, 0px))',
          gap: '0',
        }}
      >
        {/* ── Top Bar: Close Button ───────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: 'calc(16px + var(--safe-top, 0px))',
            right: '20px',
            zIndex: 30,
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Minimize player"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              color: '#fff',
            }}
            className="press"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* ── 3D Album Carousel ───────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: 0,
          }}
        >
          <AlbumCarousel
            songs={carouselSongs}
            currentTrackId={currentTrack.id}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSelectSong={handleSelectSong}
          />
        </div>

        {/* ── Track Metadata ──────────────────────────────────────────────── */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '8px',
            marginBottom: '16px',
            maxWidth: '400px',
            width: '100%',
          }}
        >
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {currentTrack.title}
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: 'rgba(255,255,255,0.6)',
              margin: '4px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {currentTrack.artist}
            {currentTrack.album ? ` · ${currentTrack.album}` : ''}
          </p>
        </div>

        {/* ── Progress Bar ────────────────────────────────────────────────── */}
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            marginBottom: '16px',
          }}
        >
          <div
            onClick={handleSeek}
            style={{
              width: '100%',
              height: '4px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '9999px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: '#FFFFFF',
                borderRadius: '9999px',
                transition: 'width 0.25s linear',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '6px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.45)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* ── Primary Playback Controls Row ───────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '14px',
          }}
        >
          {/* Repeat Mode (cycle: off -> once -> infinite) */}
          <button
            onClick={cycleRepeatMode}
            aria-label={`Repeat mode: ${repeatMode}`}
            title={
              repeatMode === 'off'
                ? 'Repeat: Off'
                : repeatMode === 'once'
                ? 'Repeat: Once'
                : 'Repeat: Infinite'
            }
            className="press"
            style={{
              position: 'relative',
              color: repeatMode !== 'off' ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              transition: 'color 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            {repeatMode === 'once' && (
              <span
                style={{
                  position: 'absolute',
                  top: '7px',
                  right: '6px',
                  fontSize: '8px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  lineHeight: 1,
                }}
              >
                1
              </span>
            )}
            {repeatMode === 'infinite' && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '6px',
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

          {/* Previous Track */}
          <button
            onClick={goToPrevious}
            aria-label="Previous track"
            className="press"
            style={{
              color: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              transition: 'color 0.15s ease',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Dominant Play / Pause Button */}
          <button
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="press"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#FFFFFF',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              transition: 'transform 0.15s ease',
            }}
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Next Track */}
          <button
            onClick={goToNext}
            aria-label="Next track"
            className="press"
            style={{
              color: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              transition: 'color 0.15s ease',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Like / Favourite */}
          <button
            onClick={handleToggleFav}
            aria-label={isCurrentFav ? 'Remove from favorites' : 'Add to favorites'}
            title={isCurrentFav ? 'Favorited' : 'Favorite'}
            className="press"
            style={{
              color: isCurrentFav ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              transition: 'color 0.15s ease, transform 0.15s ease',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={isCurrentFav ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
