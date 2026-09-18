'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { ExpandedPlayer } from '@/components/player/ExpandedPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { BannerCarousel } from '@/components/home/BannerCarousel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { CoverImage } from '@/components/ui/CoverImage';
import { getSongs } from '@/lib/supabase/songs';
import { getCoverUrl } from '@/lib/supabase/storage';
import { useCatalogSync } from '@/lib/realtime/catalogSync';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Home Dashboard
// Strict visual rebuild matching the Playcloud reference:
// - Left: Sidebar (fixed)
// - Top: TopBar with Join Party, search, user avatar, and cockpit sphere orb
// - Center: BannerCarousel (4 slots, 4s slide) + Data-driven Music Grid
// - Right: RightPanel with Pinned, Now Playing wave, and Playlists/Albums
// - Bottom: Persistent MiniPlayer
// ─────────────────────────────────────────────────────────────────────────────

function SongCard({ song, onPlay, isPlayingThis }: { song: Song; onPlay: () => void; isPlayingThis: boolean }) {
  const coverUrl = getCoverUrl(song.cover_url || song.cover_path);

  return (
    <div
      className="album-card"
      onClick={onPlay}
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
          background: '#141414',
          boxShadow: isPlayingThis ? '0 0 0 2px var(--accent)' : '0 4px 16px rgba(0,0,0,0.3)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        className="album-art-img"
      >
        <CoverImage
          src={coverUrl}
          alt={song.title}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
          style={{ objectFit: 'cover' }}
        />

        {/* Hover / Playing Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isPlayingThis ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isPlayingThis ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          className="album-play-overlay"
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000000',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              transform: 'scale(1)',
              transition: 'transform 0.15s ease',
            }}
          >
            {isPlayingThis ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div>
        <p
          style={{
            fontSize: '13.5px',
            fontWeight: 700,
            color: isPlayingThis ? 'var(--accent)' : '#FFFFFF',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {song.title}
        </p>
        <p
          style={{
            fontSize: '12px',
            color: '#8E8E93',
            margin: '2px 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {song.artist}
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const isLoading = useLibraryStore((state) => state.isLoadingSongs);
  const setIsLoading = useLibraryStore((state) => state.setIsLoadingSongs);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  // Mount real-time catalog synchronization
  useCatalogSync();

  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const loadedSongs = await getSongs();
        setSongs(loadedSongs);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [setSongs, setIsLoading]);

  const handlePlaySong = (song: Song, index: number) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(songs, index);
    }
  };

  return (
    <>
      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />

        {/* Scrollable Center Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px' }}>
          {/* Top: 4-Banner Carousel */}
          <BannerCarousel />

          {/* Center: Music Grid (Data-driven from real uploaded library) */}
          <div style={{ marginTop: '36px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                  Your Library
                </h2>
                <p style={{ fontSize: '12px', color: '#8E8E93', margin: '3px 0 0' }}>
                  Real uploaded music and curated artwork
                </p>
              </div>
              <span style={{ fontSize: '12px', color: '#8E8E93' }}>
                {songs.length} song{songs.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Grid Container — Unlimited songs with scrolling */}
            {isLoading ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '24px 20px',
                }}
              >
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="album-card">
                    <div className="skeleton" style={{ width: '100%', aspectRatio: '1/1', borderRadius: '16px' }} />
                    <div className="skeleton" style={{ height: '14px', width: '70%', borderRadius: '4px' }} />
                    <div className="skeleton" style={{ height: '12px', width: '45%', borderRadius: '4px' }} />
                  </div>
                ))}
              </div>
            ) : songs.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: '#0E0E0E',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎧</div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px' }}>
                  No music uploaded yet
                </h3>
                <p style={{ fontSize: '13px', color: '#8E8E93', margin: '0 0 20px' }}>
                  Add songs via Manage Your Cockpit or upload to build your private collection.
                </p>
                <Link
                  href="/upload"
                  style={{
                    display: 'inline-flex',
                    padding: '9px 22px',
                    borderRadius: '9999px',
                    background: '#FFFFFF',
                    color: '#000000',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Upload First Song
                </Link>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '24px 20px',
                }}
              >
                {songs.map((song, idx) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    onPlay={() => handlePlaySong(song, idx)}
                    isPlayingThis={currentTrack?.id === song.id && isPlaying}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Panel ───────────────────────────────────────────────────── */}
      <RightPanel />

      {/* ── Persistent Bottom Player ──────────────────────────────────────── */}
      <MiniPlayer />

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AccountModal />
      <CockpitModal />

      {/* ── Fullscreen Expanded Player (3D Album Carousel) ─────────────────── */}
      <ExpandedPlayer />

      {/* ── Mobile Nav ────────────────────────────────────────────────────── */}
      <BottomNav />
    </>
  );
}
