'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song, Playlist } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Playlists Page
// Displays user playlists, allows quick creation, and playing track lists.
// ─────────────────────────────────────────────────────────────────────────────

export function PlaylistsPage() {
  const playlists = useLibraryStore((state) => state.playlists);
  const setPlaylists = useLibraryStore((state) => state.setPlaylists);
  const addPlaylist = useLibraryStore((state) => state.addPlaylist);
  const setQueue = usePlayerStore((state) => state.setQueue);

  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  useEffect(() => {
    async function load() {
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
    load();
  }, [setPlaylists]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPlaylistName.trim(),
          description: newPlaylistDesc.trim() || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.playlist) {
          addPlaylist(data.playlist);
          setNewPlaylistName('');
          setNewPlaylistDesc('');
          setIsCreating(false);
        }
      }
    } catch (err) {
      console.warn('Error creating playlist:', err);
    }
  };

  const handlePlayPlaylist = async (playlist: Playlist) => {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`);
      if (res.ok) {
        const tracks: Song[] = await res.json();
        if (tracks.length > 0) setQueue(tracks, 0);
      }
    } catch (err) {
      console.warn('Failed to play playlist:', err);
    }
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px calc(var(--player-h) + 48px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
                Playlists
              </h1>
              <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '4px 0 0' }}>
                Your private collections and shared mixtapes
              </p>
            </div>
            <button
              onClick={() => setIsCreating(!isCreating)}
              style={{
                padding: '8px 18px',
                borderRadius: '9999px',
                background: '#FFFFFF',
                color: '#000000',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isCreating ? 'Cancel' : '+ New Playlist'}
            </button>
          </div>

          {/* Create Playlist Inline Form */}
          {isCreating && (
            <form
              onSubmit={handleCreatePlaylist}
              style={{
                background: '#141414',
                padding: '20px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                maxWidth: '440px',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                Create New Playlist
              </h3>
              <input
                type="text"
                placeholder="Playlist name"
                required
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: '#202020',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: '#202020',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#FF5500',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Create
              </button>
            </form>
          )}

          {playlists.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: '#0E0E0E', borderRadius: '16px', color: '#8E8E93' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', margin: '0 0 4px' }}>
                No playlists created yet
              </p>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Create a playlist or use the + button on the bottom player to add songs.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => handlePlayPlaylist(pl)}
                  style={{
                    padding: '18px',
                    borderRadius: '16px',
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '130px',
                    transition: 'transform 0.15s ease, background 0.15s ease',
                  }}
                  className="press"
                >
                  <div>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #FF5500 0%, #D84315 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#000000',
                        fontSize: '18px',
                        marginBottom: '12px',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/carino-symbol.svg"
                        alt=""
                        style={{ width: '22px', height: '22px', filter: 'brightness(0)' }}
                      />
                    </div>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                      {pl.name}
                    </h2>
                    {pl.description && (
                      <p style={{ fontSize: '12px', color: '#8E8E93', margin: '4px 0 0' }}>
                        {pl.description}
                      </p>
                    )}
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#636366', margin: '12px 0 0' }}>
                    Click to play
                  </p>
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

export default PlaylistsPage;
