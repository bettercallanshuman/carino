'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useRoomStore } from '@/stores/roomStore';
import { getCoverUrl } from '@/lib/supabase/storage';
import { CoverImage } from '@/components/ui/CoverImage';
import type { Song, Playlist } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Right Panel
// Rebuilt strictly according to visual reference:
// - Top: "Pinned" songs / playlists
// - Middle: Currently playing card with artwork, title, artist, animated wave,
//   favourite, share, and play/pause controls.
// - Waveform: Continuously animates when playing; static when paused.
//   Visual color dynamically extracted from cover artwork.
// - Bottom: Exactly two tabs: "Playlists" and "Albums" (scrollable).
// ─────────────────────────────────────────────────────────────────────────────

interface WaveformCanvasProps {
  isPlaying: boolean;
  color: string;
}

function WaveformCanvas({ isPlaying, color }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (isPlaying) {
        phaseRef.current += 0.05;
      }
      const phase = phaseRef.current;

      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isPlaying ? 6 : 2;

      // Draw smooth undulating wave
      const points = 60;
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        // Combinations of harmonic sine waves for a natural undulating audio curve
        const y1 = Math.sin(i * 0.15 + phase) * 12;
        const y2 = Math.cos(i * 0.08 - phase * 0.6) * 6;
        const amplitude = isPlaying ? 1 : 0.4;
        const y = height / 2 + (y1 + y2) * amplitude;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={64}
      style={{
        width: '100%',
        height: '64px',
        display: 'block',
        margin: '8px 0',
      }}
    />
  );
}

export function RightPanel() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setQueue = usePlayerStore((state) => state.setQueue);

  const songs = useLibraryStore((state) => state.songs);
  const playlists = useLibraryStore((state) => state.playlists);
  const setPlaylists = useLibraryStore((state) => state.setPlaylists);
  const isFavourite = useLibraryStore((state) => state.isFavourite);
  const toggleFavourite = useLibraryStore((state) => state.toggleFavourite);

  const [activeTab, setActiveTab] = useState<'Playlists' | 'Albums'>('Playlists');
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const waveColor = extractedColor || '#FF5500';

  // Load playlists on mount if empty
  useEffect(() => {
    async function loadPlaylists() {
      try {
        const res = await fetch('/api/playlists');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setPlaylists(data);
          }
        }
      } catch (err) {
        console.warn('Failed to load playlists in right panel:', err);
      }
    }
    if (playlists.length === 0) {
      loadPlaylists();
    }
  }, [playlists.length, setPlaylists]);

  // Extract dominant color from current cover artwork
  useEffect(() => {
    if (!currentTrack) return;

    const coverUrl = getCoverUrl(currentTrack.cover_url || currentTrack.cover_path);
    if (!coverUrl) return;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = coverUrl;

    img.onload = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const red = data[i];
          const green = data[i + 1];
          const blue = data[i + 2];
          const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
          // Filter out near-black and near-white pixels
          if (brightness > 45 && brightness < 215) {
            r += red;
            g += green;
            b += blue;
            count++;
          }
        }

        if (count > 0 && isMounted) {
          const avgR = Math.min(255, Math.round((r / count) * 1.15));
          const avgG = Math.min(255, Math.round((g / count) * 1.15));
          const avgB = Math.min(255, Math.round((b / count) * 1.15));
          setExtractedColor(`rgb(${avgR}, ${avgG}, ${avgB})`);
        }
      } catch {
        // keep fallback color
      }
    };

    return () => {
      isMounted = false;
    };
  }, [currentTrack]);

  // Group songs into albums
  const albums = useMemo(() => {
    const map = new Map<string, Song[]>();
    songs.forEach((s) => {
      const albumName = s.album?.trim() || 'Singles & EPs';
      if (!map.has(albumName)) {
        map.set(albumName, []);
      }
      map.get(albumName)!.push(s);
    });

    return Array.from(map.entries()).map(([name, albumSongs]) => ({
      name,
      tracks: albumSongs,
      cover: albumSongs[0]?.cover_url || albumSongs[0]?.cover_path,
      artist: albumSongs[0]?.artist || 'Various Artists',
    }));
  }, [songs]);

  const coverUrl = currentTrack ? getCoverUrl(currentTrack.cover_url || currentTrack.cover_path) : null;
  const isCurrentFav = currentTrack ? isFavourite(currentTrack.id) : false;

  const handlePlayAlbum = (albumTracks: Song[]) => {
    if (albumTracks.length > 0) {
      setQueue(albumTracks, 0);
    }
  };

  const handlePlayPlaylist = async (playlist: Playlist) => {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`);
      if (res.ok) {
        const tracks: Song[] = await res.json();
        if (tracks.length > 0) {
          setQueue(tracks, 0);
        }
      }
    } catch (err) {
      console.warn('Failed to play playlist tracks:', err);
    }
  };

  const [isShared, setIsShared] = useState(false);

  const handleShare = async () => {
    const room = useRoomStore.getState().room;
    let shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    if (room?.room_code && typeof window !== 'undefined') {
      shareUrl = `${window.location.origin}/room/${room.room_code}`;
    }

    const shareTitle = room?.room_code
      ? `Cariño — Party Room ${room.room_code}`
      : currentTrack
        ? `${currentTrack.title} — Cariño`
        : 'Cariño';

    const shareText = currentTrack
      ? `Listen to "${currentTrack.title}" by ${currentTrack.artist} together on Cariño!`
      : 'Join my shared listening room on Cariño!';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setIsShared(true);
        setTimeout(() => setIsShared(false), 2000);
      } catch {
        // ignore
      }
    }
  };

  return (
    <aside
      className="right-area"
      style={{
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 18px',
        gap: '20px',
        userSelect: 'none',
        overflowY: 'auto',
      }}
    >
      {/* ── Top: Pinned Section ───────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#8E8E93', display: 'flex', alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-2l-2-3V5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v7l-2 3v2z" />
              </svg>
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
              Pinned
            </span>
          </div>
          <button style={{ color: '#8E8E93', padding: '2px' }} aria-label="Pinned options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Pinned Item Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 10px',
            borderRadius: '12px',
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            cursor: 'pointer',
          }}
          className="press"
          onClick={() => {
            if (songs.length > 0) setQueue(songs, 0);
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#000000',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {songs[0]?.title || 'Shared Vault'}
            </p>
            <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {songs[0]?.artist || 'Pinned selection'}
            </p>
          </div>
          <span style={{ color: '#636366', fontSize: '14px' }}>•••</span>
        </div>
      </div>

      {/* ── Middle: Currently Playing Card ─────────────────────────────────── */}
      <div
        style={{
          background: '#141414',
          borderRadius: '16px',
          padding: '16px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Track info header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#202020',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            {coverUrl ? (
              <CoverImage
                src={coverUrl}
                alt={currentTrack?.title || 'Cover'}
                fill
                sizes="44px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93' }}>
                🎵
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrack?.title || 'No Track Selected'}
            </p>
            <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrack ? `${currentTrack.artist}${currentTrack.album ? ` • ${currentTrack.album}` : ''}` : 'Select a song to begin'}
            </p>
          </div>
          <span style={{ color: '#636366', fontSize: '14px', cursor: 'pointer' }}>•••</span>
        </div>

        {/* Dynamic Animated Waveform */}
        <WaveformCanvas isPlaying={isPlaying} color={waveColor} />

        {/* Actions Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Favourite / Heart Button */}
            <button
              onClick={() => {
                if (currentTrack) toggleFavourite(currentTrack.id);
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isCurrentFav ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: isCurrentFav ? '#EF4444' : '#8E8E93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              aria-label="Favourite"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={isCurrentFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>

            {/* Share Button */}
            <button
              onClick={handleShare}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isShared ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: isShared ? '#FFFFFF' : '#8E8E93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={isShared ? 'Link Copied!' : 'Share'}
              aria-label="Share"
            >
              {isShared ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              )}
            </button>
          </div>

          {/* Play/Pause Main Button */}
          <button
            onClick={() => {
              if (currentTrack) {
                setIsPlaying(!isPlaying);
              } else if (songs.length > 0) {
                setQueue(songs, 0);
              }
            }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: waveColor,
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, opacity 0.15s ease',
              boxShadow: `0 4px 14px ${waveColor}40`,
            }}
            className="press"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Bottom: Exactly Two Tabs (Playlists & Albums) ─────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Tabs Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '8px',
            marginBottom: '12px',
          }}
        >
          <button
            onClick={() => setActiveTab('Playlists')}
            style={{
              fontSize: '13px',
              fontWeight: activeTab === 'Playlists' ? 700 : 500,
              color: activeTab === 'Playlists' ? '#FFFFFF' : '#8E8E93',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
          >
            Playlists
          </button>
          <button
            onClick={() => setActiveTab('Albums')}
            style={{
              fontSize: '13px',
              fontWeight: activeTab === 'Albums' ? 700 : 500,
              color: activeTab === 'Albums' ? '#FFFFFF' : '#8E8E93',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
          >
            Albums
          </button>
        </div>

        {/* Tab Content (Scrollable & Fades behind player) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '40px',
          }}
        >
          {activeTab === 'Playlists' && (
            playlists.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#636366', padding: '12px 0' }}>
                No playlists created yet.
              </p>
            ) : (
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => handlePlayPlaylist(pl)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  className="press"
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      background: '#1F1F1F',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      color: '#8E8E93',
                      flexShrink: 0,
                    }}
                  >
                    🎵
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pl.name}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0' }}>
                      Playlist
                    </p>
                  </div>
                </div>
              ))
            )
          )}

          {activeTab === 'Albums' && (
            albums.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#636366', padding: '12px 0' }}>
                No albums found in library.
              </p>
            ) : (
              albums.map((album) => {
                const albCoverUrl = getCoverUrl(album.cover);
                return (
                  <div
                    key={album.name}
                    onClick={() => handlePlayAlbum(album.tracks)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    className="press"
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '6px',
                        background: '#1F1F1F',
                        position: 'relative',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {albCoverUrl ? (
                        <CoverImage
                          src={albCoverUrl}
                          alt={album.name}
                          fill
                          sizes="36px"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                          💿
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {album.name}
                      </p>
                      <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {album.artist} • {album.tracks.length} track{album.tracks.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </aside>
  );
}
