'use client';

import { useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { CoverImage } from '@/components/ui/CoverImage';
import { getSongs } from '@/lib/supabase/songs';
import { getCoverUrl } from '@/lib/supabase/storage';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Tracks Page
// Lists all uploaded songs in the library with search filtering & quick playback.
// ─────────────────────────────────────────────────────────────────────────────

function TracksContent() {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q') || '';

  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const isLoading = useLibraryStore((state) => state.isLoadingSongs);
  const setIsLoading = useLibraryStore((state) => state.setIsLoadingSongs);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);
  const favouriteSongIds = useLibraryStore((state) => state.favouriteSongIds);
  const toggleFavourite = useLibraryStore((state) => state.toggleFavourite);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  useEffect(() => {
    if (queryParam && queryParam !== searchQuery) {
      setSearchQuery(queryParam);
    }
  }, [queryParam, searchQuery, setSearchQuery]);

  useEffect(() => {
    async function load() {
      if (songs.length === 0) {
        setIsLoading(true);
        try {
          const loaded = await getSongs();
          setSongs(loaded);
        } finally {
          setIsLoading(false);
        }
      }
    }
    load();
  }, [songs.length, setSongs, setIsLoading]);

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q)) ||
        (s.genre && s.genre.toLowerCase().includes(q))
    );
  }, [songs, searchQuery]);

  const handlePlaySong = (song: Song, index: number) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(filteredSongs, index);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px calc(var(--player-h) + 48px)' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
          All Tracks
        </h1>
        <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
          {filteredSongs.length} track{filteredSongs.length === 1 ? '' : 's'} {searchQuery && `matching "${searchQuery}"`}
        </p>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: '56px', width: '100%', borderRadius: '12px' }} />
          ))}
        </div>
      ) : filteredSongs.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
          {searchQuery ? `No tracks found matching "${searchQuery}".` : 'No tracks uploaded yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredSongs.map((song, idx) => {
            const isThisPlaying = currentTrack?.id === song.id && isPlaying;
            const coverUrl = getCoverUrl(song.cover_url || song.cover_path);
            const fav = favouriteSongIds.includes(song.id);

            return (
              <div
                key={song.id}
                onClick={() => handlePlaySong(song, idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: isThisPlaying ? 'rgba(255, 85, 0, 0.1)' : '#121212',
                  border: isThisPlaying ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                className="press"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: '12px', color: '#8E8E93', width: '20px', textAlign: 'right' }}>
                    {idx + 1}
                  </span>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#202020',
                      position: 'relative',
                      flexShrink: 0,
                    }}
                  >
                    <CoverImage
                      src={coverUrl}
                      alt={song.title}
                      fill
                      sizes="42px"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '13.5px', fontWeight: 700, color: isThisPlaying ? 'var(--accent)' : '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {song.title}
                    </p>
                    <p style={{ fontSize: '11.5px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {song.artist} {song.album && `• ${song.album}`} {song.genre && `• ${song.genre}`}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavourite(song.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: fav ? '#EF4444' : '#636366',
                      padding: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>

                  <span style={{ fontSize: '12px', color: '#8E8E93', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.floor(song.duration_seconds / 60)}:{(song.duration_seconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TracksPage() {
  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <Suspense fallback={<div style={{ padding: '24px', color: '#8E8E93' }}>Loading tracks...</div>}>
          <TracksContent />
        </Suspense>
      </div>
      <RightPanel />
      <MiniPlayer />
      <AccountModal />
      <CockpitModal />
      <BottomNav />
    </>
  );
}
