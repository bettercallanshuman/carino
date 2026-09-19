'use client';

import { useState, useEffect, useRef } from 'react';
import type { Song, Playlist } from '@/types';
import { CoverImage } from '@/components/ui/CoverImage';

interface AddToPlaylistModalProps {
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AddToPlaylistModal({ song, isOpen, onClose }: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setIsCreating(false);
    setNewPlaylistName('');
    setMessage(null);
    onClose();
  };

  // Fetch playlists when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadPlaylists() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/playlists');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setPlaylists(data);
          }
        }
      } catch (err) {
        console.error('Failed to load playlists:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadPlaylists();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen || !song) return null;

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (addingId || addedIds.has(playlist.id)) return;
    setAddingId(playlist.id);
    setMessage(null);

    try {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: song.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Failed to add to playlist');
        return;
      }

      setAddedIds((prev) => new Set([...prev, playlist.id]));
      setMessage(data.duplicate ? `Already in "${playlist.name}"` : `Added to "${playlist.name}"`);

      // Auto close after brief feedback if success
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      setMessage('Network error adding to playlist');
    } finally {
      setAddingId(null);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Create playlist
      const createRes = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName.trim() }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.playlist) {
        setMessage(createData.error || 'Failed to create playlist');
        return;
      }

      const created = createData.playlist as Playlist;
      setPlaylists((prev) => [created, ...prev]);

      // 2. Add song to the newly created playlist
      await fetch(`/api/playlists/${created.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: song.id }),
      });

      setAddedIds((prev) => new Set([...prev, created.id]));
      setMessage(`Created and added to "${created.name}"`);
      setNewPlaylistName('');
      setIsCreating(false);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      setMessage('Network error creating playlist');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--surface-1, #121212)',
          border: '1px solid var(--border-subtle, #262626)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          animation: 'modalSlideUp 0.15s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #262626)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1, #f5f5f5)', margin: 0 }}>
              Add to Playlist
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-3, #888)', margin: '2px 0 0' }}>
              Select a playlist for this track
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3, #888)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
            }}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Selected Song Preview */}
        <div
          style={{
            padding: '12px 20px',
            background: 'var(--surface-2, #181818)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid var(--border-subtle, #262626)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0,
              background: 'var(--surface-3, #222)',
            }}
          >
            <CoverImage
              src={song.cover_url || song.cover_path}
              alt={song.title}
              fill
              sizes="36px"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-1, #fff)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                margin: 0,
              }}
            >
              {song.title}
            </p>
            <p
              style={{
                fontSize: '11px',
                color: 'var(--text-3, #888)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                margin: '2px 0 0',
              }}
            >
              {song.artist}
            </p>
          </div>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            style={{
              padding: '8px 20px',
              fontSize: '12px',
              color: message.startsWith('Added') || message.startsWith('Created') ? '#10B981' : '#F59E0B',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid var(--border-subtle, #262626)',
              textAlign: 'center',
            }}
          >
            {message}
          </div>
        )}

        {/* Playlists List */}
        <div
          style={{
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '8px 12px',
          }}
        >
          {isLoading && playlists.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-3, #888)' }}>
              Loading playlists...
            </div>
          ) : playlists.length === 0 && !isCreating ? (
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-3, #888)', marginBottom: '12px' }}>
                No playlists yet
              </p>
              <button
                onClick={() => setIsCreating(true)}
                style={{
                  background: 'var(--surface-3, #222)',
                  border: '1px solid var(--border-subtle, #333)',
                  color: 'var(--text-1, #fff)',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                }}
              >
                + Create your first playlist
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {playlists.map((playlist) => {
                const isAdded = addedIds.has(playlist.id);
                const isBusy = addingId === playlist.id;

                return (
                  <button
                    key={playlist.id}
                    onClick={() => handleAddToPlaylist(playlist)}
                    disabled={isAdded || isBusy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: isAdded ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                      border: 'none',
                      cursor: isAdded ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isAdded) e.currentTarget.style.background = 'var(--surface-2, #1a1a1a)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isAdded) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'var(--surface-3, #262626)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          color: 'var(--text-3, #888)',
                          flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/brand/carino-symbol.svg"
                          alt=""
                          style={{ width: '14px', height: '14px', opacity: 0.35, filter: 'grayscale(100%)' }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: isAdded ? '#10B981' : 'var(--text-1, #eee)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {playlist.name}
                      </span>
                    </div>

                    {isAdded ? (
                      <span style={{ fontSize: '12px', color: '#10B981', fontWeight: 600 }}>Added ✓</span>
                    ) : isBusy ? (
                      <span style={{ fontSize: '11px', color: 'var(--text-3, #888)' }}>Adding...</span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4, #555)" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Inline New Playlist Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle, #262626)',
            background: 'var(--surface-1, #121212)',
          }}
        >
          {isCreating ? (
            <form onSubmit={handleCreateAndAdd} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                autoFocus
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  background: 'var(--surface-2, #1a1a1a)',
                  border: '1px solid var(--border-subtle, #333)',
                  borderRadius: '8px',
                  color: 'var(--text-1, #fff)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim() || isLoading}
                style={{
                  background: 'var(--accent, #f97316)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: !newPlaylistName.trim() || isLoading ? 'not-allowed' : 'pointer',
                  opacity: !newPlaylistName.trim() || isLoading ? 0.6 : 1,
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewPlaylistName('');
                }}
                style={{
                  background: 'transparent',
                  color: 'var(--text-3, #888)',
                  fontSize: '12px',
                  padding: '0 8px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                background: 'transparent',
                border: '1px dashed var(--border-subtle, #333)',
                borderRadius: '8px',
                color: 'var(--text-2, #bbb)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Playlist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
