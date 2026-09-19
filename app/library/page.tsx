'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { CoverImage } from '@/components/ui/CoverImage';
import { getSongs } from '@/lib/supabase/songs';
import { getCoverUrl } from '@/lib/supabase/storage';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Library Page
// Full song catalog with instant search, play triggers, and upload link.
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function LibraryPage() {
  const [filterQuery, setFilterQuery] = useState('');
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);

  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const isLoading = useLibraryStore((state) => state.isLoadingSongs);
  const setIsLoading = useLibraryStore((state) => state.setIsLoadingSongs);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);

  // Load songs on mount if store is empty
  useEffect(() => {
    async function loadData() {
      if (songs.length === 0) {
        setIsLoading(true);
        try {
          const loadedSongs = await getSongs();
          setSongs(loadedSongs);
        } finally {
          setIsLoading(false);
        }
      }
    }
    loadData();
  }, [songs.length, setSongs, setIsLoading]);

  // Filter songs based on search query
  const filteredSongs = useMemo(() => {
    if (!filterQuery.trim()) return songs;
    const q = filterQuery.toLowerCase();
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );
  }, [songs, filterQuery]);

  const handlePlaySong = (song: Song, index: number) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(filteredSongs, index);
    }
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Library' }]} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px calc(var(--player-h) + 48px)' }}>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-1)',
                  marginBottom: '4px',
                }}
              >
                Music Library
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                {filteredSongs.length} {filteredSongs.length === 1 ? 'track' : 'tracks'} available in your private collection
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Search Filter */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Filter tracks..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  style={{
                    padding: '8px 14px 8px 32px',
                    borderRadius: '999px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-1)',
                    fontSize: '13px',
                    outline: 'none',
                    width: '180px',
                  }}
                />
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-3)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ position: 'absolute', left: '11px', top: '10px' }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>

              {/* Upload CTA button */}
              <Link
                href="/upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  background: 'var(--accent)',
                  color: '#000',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxShadow: '0 2px 10px rgba(249, 115, 22, 0.25)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Music
              </Link>
            </div>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px minmax(200px, 2fr) minmax(140px, 1fr) 70px',
              padding: '8px 12px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-4)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span>#</span>
            <span>Title</span>
            <span>Album</span>
            <span style={{ textAlign: 'right' }}>Time</span>
          </div>

          {/* Track List */}
          {isLoading ? (
            <div style={{ padding: '32px 0' }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 70px',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="skeleton" style={{ width: '20px', height: '14px', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="skeleton" style={{ width: '40%', height: '14px', borderRadius: '4px' }} />
                    <div className="skeleton" style={{ width: '25%', height: '11px', borderRadius: '4px' }} />
                  </div>
                  <div className="skeleton" style={{ width: '32px', height: '12px', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          ) : filteredSongs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-3)',
              }}
            >
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/carino-symbol.svg" alt="" style={{ width: '40px', height: '40px', opacity: 0.35, filter: 'grayscale(100%)' }} />
              </div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '6px' }}>
                No tracks found
              </p>
              <p style={{ fontSize: '13px', marginBottom: '20px' }}>
                {filterQuery ? 'Try another search keyword' : 'Your shared library is waiting for its first song.'}
              </p>
              <Link
                href="/upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '999px',
                  background: 'var(--surface-3)',
                  color: 'var(--text-1)',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Upload a song
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredSongs.map((song, index) => {
                const isCurrent = currentTrack?.id === song.id;
                const isHovered = hoveredTrackId === song.id;
                const coverUrl = getCoverUrl(song.cover_url || song.cover_path);

                return (
                  <div
                    key={song.id}
                    onMouseEnter={() => setHoveredTrackId(song.id)}
                    onMouseLeave={() => setHoveredTrackId(null)}
                    onClick={() => handlePlaySong(song, index)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px minmax(200px, 2fr) minmax(140px, 1fr) 70px',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isCurrent
                        ? 'rgba(249, 115, 22, 0.08)'
                        : isHovered
                        ? 'var(--surface-2)'
                        : 'transparent',
                      transition: 'background var(--t-fast)',
                    }}
                  >
                    {/* Index / Play Button */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {isHovered || isCurrent ? (
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isCurrent ? 'var(--accent)' : 'var(--text-1)',
                            padding: 0,
                            display: 'flex',
                          }}
                          aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
                        >
                          {isCurrent && isPlaying ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="4" width="4" height="16" rx="1" />
                              <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: '12px',
                            color: isCurrent ? 'var(--accent)' : 'var(--text-4)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Artwork + Title + Artist */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          position: 'relative',
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: 'var(--surface-3)',
                        }}
                      >
                        <CoverImage
                          src={coverUrl}
                          alt={song.title}
                          fill
                          sizes="40px"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>

                      <div style={{ minWidth: 0, paddingRight: '8px' }}>
                        <p
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: isCurrent ? 'var(--accent)' : 'var(--text-1)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {song.title}
                        </p>
                        <p
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}
                        >
                          {song.artist}
                        </p>
                      </div>
                    </div>

                    {/* Album */}
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: '12px',
                      }}
                    >
                      {song.album || '—'}
                    </div>

                    {/* Duration */}
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-4)',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'right',
                      }}
                    >
                      {formatDuration(song.duration_seconds)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ height: '40px' }} />
        </div>
      </div>

      <RightPanel />
      <MiniPlayer />
      <BottomNav />
    </>
  );
}
