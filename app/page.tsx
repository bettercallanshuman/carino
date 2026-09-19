'use client';

import { useEffect, useRef, useState } from 'react';
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

function SongCard({
  song,
  onPlay,
  isPlayingThis,
  width,
}: {
  song: Song;
  onPlay: () => void;
  isPlayingThis: boolean;
  width?: string | number;
}) {
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
        width: width || '100%',
        flexShrink: width ? 0 : undefined,
        scrollSnapAlign: width ? 'start' : undefined,
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
          sizes={width ? `${width}px` : '(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw'}
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
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const favouriteSongIds = useLibraryStore((state) => state.favouriteSongIds);
  const playlists = useLibraryStore((state) => state.playlists);
  const setPlaylists = useLibraryStore((state) => state.setPlaylists);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  useEffect(() => {
    async function loadPlaylists() {
      try {
        const res = await fetch('/api/playlists');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setPlaylists(data);
        }
      } catch (err) {
        console.warn('Failed to load playlists:', err);
      }
    }
    loadPlaylists();
  }, [setPlaylists]);

  const favouriteSongs = songs.filter((s) => favouriteSongIds.includes(s.id));

  const handlePlaySong = (song: Song, index: number, songList: Song[] = songs) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(songList, index);
    }
  };

  return (
    <>
      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />

        {isMobile ? (
          /* ── Mobile Vertical Feed with Horizontal Rails ─────────────────── */
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '16px 16px calc(148px + var(--safe-bottom, 0px))',
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
            }}
          >
            {/* Top: 4-Banner Carousel */}
            <div style={{ width: '100%', flexShrink: 0 }}>
              <BannerCarousel />
            </div>

            {/* Section 1: Your Library */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                    Your Library
                  </h2>
                  <p style={{ fontSize: '12px', color: '#8E8E93', margin: '2px 0 0' }}>
                    Real uploaded music and curated artwork
                  </p>
                </div>
                <Link
                  href="/tracks"
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  See All
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </div>

              {isLoading ? (
                <div style={{ display: 'flex', gap: '14px', overflowX: 'auto' }} className="hide-scrollbar">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} style={{ width: '140px', flexShrink: 0 }}>
                      <div className="skeleton" style={{ width: '140px', height: '140px', borderRadius: '16px' }} />
                      <div className="skeleton" style={{ height: '14px', width: '75%', borderRadius: '4px', marginTop: '8px' }} />
                      <div className="skeleton" style={{ height: '12px', width: '50%', borderRadius: '4px', marginTop: '4px' }} />
                    </div>
                  ))}
                </div>
              ) : songs.length === 0 ? (
                <div style={{ padding: '24px 16px', background: '#101012', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0 }}>No music uploaded yet.</p>
                </div>
              ) : (
                <div
                  className="hide-scrollbar"
                  style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '14px',
                    scrollSnapType: 'x mandatory',
                    paddingBottom: '4px',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {songs.map((song, idx) => (
                    <SongCard
                      key={song.id}
                      song={song}
                      width={140}
                      onPlay={() => handlePlaySong(song, idx, songs)}
                      isPlayingThis={currentTrack?.id === song.id && isPlaying}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Recently Played */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                    Recently Played
                  </h2>
                  <p style={{ fontSize: '12px', color: '#8E8E93', margin: '2px 0 0' }}>
                    Pick up where you left off
                  </p>
                </div>
                <Link
                  href="/recently-played"
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  See All
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </div>

              {recentlyPlayed.length > 0 ? (
                <div
                  className="hide-scrollbar"
                  style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '14px',
                    scrollSnapType: 'x mandatory',
                    paddingBottom: '4px',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {recentlyPlayed.map((song, idx) => (
                    <SongCard
                      key={`recent-${song.id}-${idx}`}
                      song={song}
                      width={140}
                      onPlay={() => handlePlaySong(song, idx, recentlyPlayed)}
                      isPlayingThis={currentTrack?.id === song.id && isPlaying}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 16px', background: '#101012', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0 }}>
                    Play tracks to see your listening history here.
                  </p>
                </div>
              )}
            </div>

            {/* Section 3: Favourites */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                    Favourites
                  </h2>
                  <p style={{ fontSize: '12px', color: '#8E8E93', margin: '2px 0 0' }}>
                    Tracks you love
                  </p>
                </div>
                <Link
                  href="/favorites"
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  See All
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </div>

              {favouriteSongs.length > 0 ? (
                <div
                  className="hide-scrollbar"
                  style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '14px',
                    scrollSnapType: 'x mandatory',
                    paddingBottom: '4px',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {favouriteSongs.map((song, idx) => (
                    <SongCard
                      key={`fav-${song.id}`}
                      song={song}
                      width={140}
                      onPlay={() => handlePlaySong(song, idx, favouriteSongs)}
                      isPlayingThis={currentTrack?.id === song.id && isPlaying}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 16px', background: '#101012', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0 }}>
                    No favourite tracks yet. Heart songs across Cariño to save them here.
                  </p>
                </div>
              )}
            </div>

            {/* Section 4: Playlists */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                    Playlists
                  </h2>
                  <p style={{ fontSize: '12px', color: '#8E8E93', margin: '2px 0 0' }}>
                    Your private collections
                  </p>
                </div>
                <Link
                  href="/playlists"
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  See All
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </div>

              <div
                className="hide-scrollbar"
                style={{
                  display: 'flex',
                  overflowX: 'auto',
                  gap: '14px',
                  scrollSnapType: 'x mandatory',
                  paddingBottom: '4px',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {playlists.map((pl) => (
                  <Link
                    key={pl.id}
                    href="/playlists"
                    style={{
                      width: '140px',
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                      textDecoration: 'none',
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
                        background: 'linear-gradient(135deg, #1E1E22 0%, #121215 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      }}
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FB923C',
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1.5" fill="#FB923C" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" fill="#FB923C" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" fill="#FB923C" />
                          <rect x="14" y="14" width="7" height="7" rx="1.5" fill="#FB923C" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pl.name}
                      </p>
                      <p style={{ fontSize: '11.5px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Playlist
                      </p>
                    </div>
                  </Link>
                ))}

                {/* Create/New Playlist item */}
                <Link
                  href="/playlists"
                  style={{
                    width: '140px',
                    flexShrink: 0,
                    scrollSnapAlign: 'start',
                    textDecoration: 'none',
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
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px dashed rgba(255, 255, 255, 0.16)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '24px', color: '#8E8E93', lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: '11.5px', color: '#8E8E93', fontWeight: 600 }}>New Playlist</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#8E8E93', margin: 0 }}>
                      Create
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* ── Desktop Center Content (Unchanged) ─────────────────────────── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px calc(var(--player-h) + 48px)' }}>
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

              {/* Grid Container — Exactly 5 tracks per row on desktop, growing indefinitely */}
              {isLoading ? (
                <div className="library-grid-5">
                  {Array.from({ length: 5 }, (_, i) => (
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
                <div className="library-grid-5">
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
        )}
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
