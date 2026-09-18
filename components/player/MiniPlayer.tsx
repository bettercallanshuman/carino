'use client';

import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { getCoverUrl } from '@/lib/supabase/storage';
import { CoverImage } from '@/components/ui/CoverImage';
import { AddToPlaylistModal } from '@/components/player/AddToPlaylistModal';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Persistent Bottom Music Player
// Matches the visual reference:
// - Left: Cover artwork, title, artist
// - Center: Shuffle, previous, play/pause (white circle), next, 3-state repeat,
//   progress bar, current time, duration
// - Right: Favourite (heart), Add to Playlist (+), volume, fullscreen/expand
// - 3-State Repeat: OFF -> REPEAT ONCE -> REPEAT INFINITE -> OFF
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
  const isFavourite = useLibraryStore((state) => state.isFavourite);
  const toggleFavourite = useLibraryStore((state) => state.toggleFavourite);

  const isCurrentFav = currentTrack ? isFavourite(currentTrack.id) : false;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(percent * duration);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const coverUrl = currentTrack ? getCoverUrl(currentTrack.cover_url || currentTrack.cover_path) : null;

  return (
    <>
      <div
        className="player-area"
        style={{
          background: 'rgba(10, 10, 10, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 'var(--player-h)',
          position: 'relative',
          zIndex: 40,
        }}
      >
        {/* ── Left: Cover Artwork + Title + Artist ─────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '260px', minWidth: 0 }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '8px',
              background: '#1A1A1A',
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {coverUrl ? (
              <CoverImage
                src={coverUrl}
                alt={currentTrack?.title || 'Cover art'}
                fill
                sizes="46px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                🎵
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
                margin: '2px 0 0',
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
            maxWidth: '540px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Shuffle */}
            <button
              onClick={() => setIsShuffle(!isShuffle)}
              style={{
                color: isShuffle ? 'var(--accent)' : '#8E8E93',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'color 0.15s ease',
              }}
              aria-label="Shuffle"
              title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                color: currentTrack ? '#D1D1D6' : '#48484A',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                cursor: currentTrack ? 'pointer' : 'default',
                transition: 'transform 0.1s ease',
              }}
              className="press"
              aria-label="Previous track"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>

            {/* Play / Pause Main Button */}
            <button
              onClick={() => {
                if (currentTrack) setIsPlaying(!isPlaying);
              }}
              disabled={!currentTrack}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#FFFFFF',
                color: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: currentTrack ? 'pointer' : 'default',
                opacity: currentTrack ? 1 : 0.6,
                boxShadow: '0 2px 10px rgba(255, 255, 255, 0.2)',
                transition: 'transform 0.15s ease, background 0.15s ease',
              }}
              className="press"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              onClick={goToNext}
              disabled={!currentTrack}
              style={{
                color: currentTrack ? '#D1D1D6' : '#48484A',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                cursor: currentTrack ? 'pointer' : 'default',
                transition: 'transform 0.1s ease',
              }}
              className="press"
              aria-label="Next track"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>

            {/* Repeat Mode (off | once | infinite) */}
            <button
              onClick={cycleRepeatMode}
              disabled={!currentTrack}
              style={{
                position: 'relative',
                color: repeatMode !== 'off' ? 'var(--accent)' : '#8E8E93',
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>

              {/* Badge 1 for Once */}
              {repeatMode === 'once' && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    fontSize: '8px',
                    fontWeight: 900,
                    background: 'var(--accent)',
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

              {/* Dot for Infinite */}
              {repeatMode === 'infinite' && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '1px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                />
              )}
            </button>
          </div>

          {/* Progress Bar Row */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#8E8E93', fontVariantNumeric: 'tabular-nums', minWidth: '32px', textAlign: 'right' }}>
              {formatTime(currentTime)}
            </span>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Playback progress"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              onClick={handleSeek}
              style={{
                flex: 1,
                height: '3px',
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '9999px',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: '#FFFFFF',
                  borderRadius: '9999px',
                  transition: 'width 0.15s linear',
                }}
              />
            </div>
            <span style={{ fontSize: '11px', color: '#8E8E93', fontVariantNumeric: 'tabular-nums', minWidth: '32px' }}>
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* ── Right: Extra Controls ────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '260px', justifyContent: 'flex-end' }}>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isCurrentFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* Add to Playlist (+) */}
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
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* Volume Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8E8E93', display: 'flex', alignItems: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              style={{
                width: '74px',
                height: '3px',
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '9999px',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
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
