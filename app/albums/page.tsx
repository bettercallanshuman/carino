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
// CARIÑO — Albums Page
// Groups real uploaded tracks by their album metadata.
// ─────────────────────────────────────────────────────────────────────────────

export default function AlbumsPage() {
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

  const albums = useMemo(() => {
    const map = new Map<string, Song[]>();
    songs.forEach((s) => {
      const name = s.album?.trim() || 'Singles & EPs';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(s);
    });

    return Array.from(map.entries()).map(([title, albumTracks]) => ({
      title,
      artist: albumTracks[0]?.artist || 'Various Artists',
      cover: albumTracks[0]?.cover_url || albumTracks[0]?.cover_path,
      tracks: albumTracks,
    }));
  }, [songs]);

  const handlePlayAlbum = (albumTracks: Song[]) => {
    if (albumTracks.length > 0) {
      setQueue(albumTracks, 0);
    }
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px calc(var(--player-h) + 48px)' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
              Albums
            </h1>
            <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
              Albums derived from your uploaded song metadata
            </p>
          </div>

          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '20px' }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton" style={{ width: '100%', aspectRatio: '1/1', borderRadius: '16px' }} />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
              No albums found in your library.
            </div>
          ) : (
            <div className="library-grid-5">
              {albums.map((album) => {
                const coverUrl = getCoverUrl(album.cover);
                return (
                  <div
                    key={album.title}
                    onClick={() => handlePlayAlbum(album.tracks)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    className="album-card"
                  >
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '1/1',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#141414',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      }}
                      className="album-art-img"
                    >
                      {coverUrl ? (
                        <CoverImage
                          src={coverUrl}
                          alt={album.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                          💿
                        </div>
                      )}
                    </div>
                    <div>
                      <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {album.title}
                      </p>
                      <p style={{ fontSize: '12px', color: '#8E8E93', margin: '2px 0 0' }}>
                        {album.artist} • {album.tracks.length} song{album.tracks.length > 1 ? 's' : ''}
                      </p>
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
