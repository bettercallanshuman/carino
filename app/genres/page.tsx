'use client';

import { useEffect, useMemo } from 'react';
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
// CARIÑO — Genres Page
// Groups actual songs according to assigned genre metadata.
// ─────────────────────────────────────────────────────────────────────────────

const GENRE_GRADIENTS = [
  'linear-gradient(135deg, #FF5500 0%, #E64A19 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
  'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
  'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
];

export default function GenresPage() {
  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const isLoading = useLibraryStore((state) => state.isLoadingSongs);
  const setIsLoading = useLibraryStore((state) => state.setIsLoadingSongs);
  const setQueue = usePlayerStore((state) => state.setQueue);

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

  const genres = useMemo(() => {
    const map = new Map<string, Song[]>();
    songs.forEach((s) => {
      const g = s.genre?.trim() || 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    });

    return Array.from(map.entries()).map(([genreName, genreTracks], index) => ({
      name: genreName,
      tracks: genreTracks,
      gradient: GENRE_GRADIENTS[index % GENRE_GRADIENTS.length],
    }));
  }, [songs]);

  const handlePlayGenre = (genreTracks: Song[]) => {
    if (genreTracks.length > 0) {
      setQueue(genreTracks, 0);
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
              Genres
            </h1>
            <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
              Songs organized by their assigned genre
            </p>
          </div>

          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
              ))}
            </div>
          ) : genres.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
              No genres found. Upload songs with genre tags to populate this section.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {genres.map((g) => (
                <div key={g.name}>
                  {/* Genre Header Card */}
                  <div
                    onClick={() => handlePlayGenre(g.tracks)}
                    style={{
                      padding: '20px 24px',
                      borderRadius: '16px',
                      background: g.gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      marginBottom: '14px',
                    }}
                    className="press"
                  >
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                        {g.name}
                      </h2>
                      <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', margin: '4px 0 0' }}>
                        {g.tracks.length} track{g.tracks.length > 1 ? 's' : ''} • Click to play all
                      </p>
                    </div>

                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        color: '#000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>

                  {/* Tracks list under genre */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
                    {g.tracks.map((song, idx) => {
                      const coverUrl = getCoverUrl(song.cover_url || song.cover_path);
                      return (
                        <div
                          key={song.id}
                          onClick={() => setQueue(g.tracks, idx)}
                          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}
                          className="album-card"
                        >
                          <div
                            style={{
                              width: '100%',
                              aspectRatio: '1/1',
                              borderRadius: '14px',
                              overflow: 'hidden',
                              position: 'relative',
                              background: '#141414',
                            }}
                            className="album-art-img"
                          >
                            <CoverImage
                              src={coverUrl}
                              alt={song.title}
                              fill
                              sizes="150px"
                              style={{ objectFit: 'cover' }}
                            />
                          </div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song.title}
                          </p>
                          <p style={{ fontSize: '11px', color: '#8E8E93', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song.artist}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
