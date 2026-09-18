'use client';

import { useMemo } from 'react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { CoverImage } from '@/components/ui/CoverImage';
import { getCoverUrl } from '@/lib/supabase/storage';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Favourite Tracks Page
// Displays tracks marked favourite by the user.
// ─────────────────────────────────────────────────────────────────────────────

export default function FavoritesPage() {
  const songs = useLibraryStore((state) => state.songs);
  const favouriteSongIds = useLibraryStore((state) => state.favouriteSongIds);
  const toggleFavourite = useLibraryStore((state) => state.toggleFavourite);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  const favoriteTracks = useMemo(() => {
    return songs.filter((s) => favouriteSongIds.includes(s.id));
  }, [songs, favouriteSongIds]);

  const handlePlay = (song: Song, index: number) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(favoriteTracks, index);
    }
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
              Favourite Tracks
            </h1>
            <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
              {favoriteTracks.length} song{favoriteTracks.length === 1 ? '' : 's'} you have loved
            </p>
          </div>

          {favoriteTracks.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>❤️</div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', margin: '0 0 4px' }}>
                No favourite tracks yet
              </p>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Click the heart icon on any song or in the player to save it to your favourites.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {favoriteTracks.map((song, idx) => {
                const isThisPlaying = currentTrack?.id === song.id && isPlaying;
                const coverUrl = getCoverUrl(song.cover_url || song.cover_path);

                return (
                  <div
                    key={song.id}
                    onClick={() => handlePlay(song, idx)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
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
                          {song.artist} {song.album && `• ${song.album}`}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavourite(song.id);
                        }}
                        style={{ background: 'none', border: 'none', color: '#EF4444', padding: '4px', cursor: 'pointer' }}
                        aria-label="Remove favourite"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
      </div>
      <RightPanel />
      <MiniPlayer />
      <AccountModal />
      <CockpitModal />
      <BottomNav />
    </>
  );
}
