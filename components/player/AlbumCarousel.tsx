'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCoverUrl } from '@/lib/supabase/storage';
import { CoverImage } from '@/components/ui/CoverImage';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — 3D Album Cover Carousel (Pure Compositor-Driven 60fps Architecture)
//
// Eliminates the frame-0 hitch/stutter completely:
// 1. Off-Main-Thread (OMTA) Animation: Driven entirely by GPU-composited CSS
//    transforms (translate3d, rotateY, scale) and opacity. Runs on the GPU
//    compositor thread independently of JavaScript execution.
// 2. Zero JS Animation Contention: Completely replaces Framer Motion's main-thread
//    rAF ticker and eliminates all per-frame object allocation and style thrash.
// 3. Zero Frame-0 Image Decode Thrash: All cards in the active window maintain
//    priority={true} so artwork is eagerly pre-decoded and GPU-resident.
//    RelativeIndex shifts never toggle image loading or inject preload link tags.
// 4. Zero DOM Mount/Unmount Churn: Small playlists (<=14 songs) keep all elements
//    mounted; larger libraries use a buffered ±3 window so entering cards are
//    already mounted and painted at opacity 0 before transition begins.
// 5. Zero Progress-Tick Re-renders: Wrapped in React.memo to isolate the carousel
//    from 250ms currentTime progress ticks in ExpandedPlayer.
// ─────────────────────────────────────────────────────────────────────────────

interface AlbumCarouselProps {
  songs: Song[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSelectSong: (song: Song, indexInSongs: number) => void;
}

// 3D Geometry configuration for carousel cards
function getCardConfig(offset: number, isMobile: boolean, vw: number) {
  const absOffset = Math.abs(offset);
  const sign = offset < 0 ? -1 : offset > 0 ? 1 : 0;

  if (absOffset === 0) {
    return {
      x: 0,
      z: 0,
      rotateY: 0,
      scale: 1,
      opacity: 1,
      dimmerOpacity: 0,
      zIndex: 10,
      pointerEvents: 'auto' as const,
    };
  }

  if (absOffset === 1) {
    const xDist = isMobile ? 34 * vw : 16 * vw;
    const zDist = isMobile ? -12 * vw : -8 * vw;
    return {
      x: sign * xDist,
      z: zDist,
      rotateY: -sign * 25,
      scale: 0.75,
      opacity: isMobile ? 0.65 : 0.7,
      dimmerOpacity: 0.25,
      zIndex: 5,
      pointerEvents: 'auto' as const,
    };
  }

  if (absOffset === 2) {
    const xDist = isMobile ? 60 * vw : 30 * vw;
    const zDist = isMobile ? -20 * vw : -16 * vw;
    return {
      x: sign * xDist,
      z: zDist,
      rotateY: -sign * 35,
      scale: isMobile ? 0.45 : 0.55,
      opacity: isMobile ? 0 : 0.4,
      dimmerOpacity: 0.45,
      zIndex: 2,
      pointerEvents: isMobile ? ('none' as const) : ('auto' as const),
    };
  }

  // Beyond ±2: offscreen entrance / exit staging (e.g. ±3)
  const xDist = isMobile ? 80 * vw : 44 * vw;
  const zDist = isMobile ? -25 * vw : -22 * vw;
  return {
    x: sign * xDist,
    z: zDist,
    rotateY: -sign * 45,
    scale: 0.4,
    opacity: 0,
    dimmerOpacity: 0.6,
    zIndex: 0,
    pointerEvents: 'none' as const,
  };
}

export const AlbumCarousel = React.memo(function AlbumCarousel({
  songs,
  currentTrackId,
  isPlaying,
  onPlayPause,
  onSelectSong,
}: AlbumCarouselProps) {
  // Find center index by matching currentTrackId in songs array
  const centerIndex = useMemo(() => {
    if (!currentTrackId || songs.length === 0) return 0;
    const idx = songs.findIndex((s) => s.id === currentTrackId);
    return idx >= 0 ? idx : 0;
  }, [currentTrackId, songs]);

  const [isMobile, setIsMobile] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1200);
  const [windowHeight, setWindowHeight] = useState(800);
  const [isMounted, setIsMounted] = useState(false);

  // Suppress initial mount transition to prevent jump on first load
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setIsMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Responsive dimensions
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowWidth(w);
      setWindowHeight(h);
      setIsMobile(w <= 768);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const vw = windowWidth / 100;
  const isShortScreen = windowHeight <= 500;

  // The visual center is derived strictly from currentTrackId
  const visualCenterIndex = centerIndex;

  // Compute offset of each song from the visual center (shortest wrapping path)
  const getOffset = useCallback(
    (songIndex: number) => {
      if (songs.length === 0) return Infinity;
      const n = songs.length;
      let diff = songIndex - visualCenterIndex;
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;
      return diff;
    },
    [visualCenterIndex, songs.length]
  );

  // Navigate carousel
  const navigateCarousel = useCallback(
    (direction: 1 | -1) => {
      if (songs.length <= 1) return;
      const newCenterIdx = ((centerIndex + direction) % songs.length + songs.length) % songs.length;
      const targetSong = songs[newCenterIdx];
      if (targetSong) {
        onSelectSong(targetSong, newCenterIdx);
      }
    },
    [centerIndex, songs, onSelectSong]
  );

  // ── Keyboard Navigation ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateCarousel(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateCarousel(1);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onPlayPause();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateCarousel, onPlayPause]);

  // ── Pointer/Touch Drag ──────────────────────────────────────────────────
  const dragStartRef = useRef<{ x: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = { x: e.clientX, time: Date.now() };
    isDraggingRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    if (Math.abs(deltaX) > 10) {
      isDraggingRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.x;
      const elapsed = Date.now() - dragStartRef.current.time;
      dragStartRef.current = null;

      const threshold = 40;
      const velocity = Math.abs(deltaX) / Math.max(elapsed, 1);

      if (Math.abs(deltaX) > threshold || velocity > 0.5) {
        if (deltaX > 0) {
          navigateCarousel(-1); // swiped right → Previous
        } else {
          navigateCarousel(1);  // swiped left → Next
        }
      }

      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    },
    [navigateCarousel]
  );

  const handleCardClick = useCallback(
    (song: Song, songIndex: number) => {
      if (isDraggingRef.current) return;

      const offset = getOffset(songIndex);
      if (offset === 0) {
        // Center card → toggle play/pause
        onPlayPause();
      } else {
        // Side card → navigate to that song and let store update
        onSelectSong(song, songIndex);
      }
    },
    [getOffset, onPlayPause, onSelectSong]
  );

  // Active carousel window:
  // Compact playlist (<= 14 songs): Keep all cards mounted so zero DOM mount/unmount overhead.
  // Larger playlist: Keep buffered ±3 window so entering cards are already mounted at opacity 0.
  const visibleCards = useMemo(() => {
    if (songs.length === 0) return [];
    if (songs.length <= 14) {
      return songs.map((song, i) => ({
        song,
        index: i,
        offset: getOffset(i),
      }));
    }
    const list: { song: Song; index: number; offset: number }[] = [];
    for (let i = 0; i < songs.length; i++) {
      const offset = getOffset(i);
      if (Math.abs(offset) <= 3) {
        list.push({ song: songs[i], index: i, offset });
      }
    }
    return list;
  }, [songs, getOffset]);

  // Preload upcoming cover artwork so it is in browser memory before sliding in
  useEffect(() => {
    if (typeof window === 'undefined' || visibleCards.length === 0) return;
    visibleCards.forEach(({ song }) => {
      const url = getCoverUrl(song.cover_url || song.cover_path);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [visibleCards]);

  if (songs.length === 0) return null;

  const cardWidth = isShortScreen
    ? 'min(150px, 32vw)'
    : isMobile
    ? 'min(220px, 52vw)'
    : 'min(260px, 22vw)';

  return (
    <div
      className="carousel-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragStartRef.current = null; }}
      style={{
        position: 'relative',
        width: '100%',
        height: isShortScreen ? '210px' : isMobile ? '340px' : '420px',
        perspective: '1200px',
        perspectiveOrigin: '50% 50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'pan-y',
        cursor: 'grab',
        userSelect: 'none',
        overflow: 'visible',
      }}
    >
      {visibleCards.map(({ song, index, offset }) => {
        const coverUrl = getCoverUrl(song.cover_url || song.cover_path);
        const config = getCardConfig(offset, isMobile, vw);
        const isCenter = offset === 0;

        return (
          <div
            key={song.id}
            className="carousel-card"
            onClick={() => handleCardClick(song, index)}
            style={{
              position: 'absolute',
              width: cardWidth,
              aspectRatio: '3 / 3.6',
              borderRadius: '16px',
              overflow: 'hidden',
              cursor: 'pointer',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.65), 0 6px 24px rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.14)',
              zIndex: config.zIndex,
              pointerEvents: config.pointerEvents,
              transform: `translate3d(${config.x.toFixed(1)}px, 0px, ${config.z.toFixed(1)}px) rotateY(${config.rotateY}deg) scale(${config.scale})`,
              opacity: config.opacity,
              transition: isMounted
                ? 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                : 'none',
              willChange: 'transform, opacity',
            }}
          >
            {/* Cover artwork */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#141414',
              }}
            >
              <CoverImage
                src={coverUrl}
                alt={song.title}
                fill
                sizes="(max-width: 768px) 52vw, 22vw"
                style={{ objectFit: 'cover' }}
                priority={true}
              />
            </div>

            {/* Darkening dimmer overlay (hardware accelerated on compositor, zero CPU filter cost) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#000',
                zIndex: 1,
                pointerEvents: 'none',
                opacity: config.dimmerOpacity,
                transition: isMounted
                  ? 'opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                  : 'none',
                willChange: 'opacity',
              }}
            />

            {/* Play/Pause indicator on center card */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.15)',
                opacity: 0,
                transition: 'opacity 0.2s ease',
                zIndex: 2,
                pointerEvents: isCenter ? 'auto' : 'none',
              }}
              className={isCenter ? 'carousel-card-play-overlay' : undefined}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
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
              </div>
            </div>

            {/* Info strip at bottom (stable layout and typography: zero text reflow on transition) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '12px 14px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)',
                zIndex: 3,
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {song.title}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.65)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: '2px 0 0',
                }}
              >
                {song.artist}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
});
