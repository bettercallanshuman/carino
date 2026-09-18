'use client';

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
// CARIÑO — Recently Played Page
// Displays tracks that the current user has actually played.
// ─────────────────────────────────────────────────────────────────────────────

export default function RecentlyPlayedPage() {
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  const handlePlay = (song: Song, index: number) => {
    if (currentTrack?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setQueue(recentlyPlayed, index);
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
              Recently Played
            </h1>
            <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
              Tracks you have listened to in Cariño
            </p>
          </div>

          {recentlyPlayed.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏱️</div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', margin: '0 0 4px' }}>
                No playback history yet
              </p>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Play any track from the library to record your listening activity.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentlyPlayed.map((song, idx) => {
                const isThisPlaying = currentTrack?.id === song.id && isPlaying;
                const coverUrl = getCoverUrl(song.cover_url || song.cover_path);

                return (
                  <div
                    key={song.id + '-' + idx}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
