'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { CoverImage } from '@/components/ui/CoverImage';
import { uploadAudio, uploadCover } from '@/lib/supabase/storage';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import type { Song, Playlist } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Admin / Library Management
// Complete Owner/Admin dashboard (Admin Only).
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'songs' | 'playlists';

interface AdminPlaylist extends Playlist {
  track_count?: number;
}

export default function AdminPage() {
  const router = useRouter();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      router.replace('/?error=forbidden_admin_only');
    }
  }, [isAdmin, isAuthLoading, router]);

  if (isAuthLoading || !isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: '#000000', color: '#888888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Verifying administrator access...
      </div>
    );
  }

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Stores ──────────────────────────────────────────────────────────────────
  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const removeSong = useLibraryStore((state) => state.removeSong);
  const updateSong = useLibraryStore((state) => state.updateSong);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  // ── Local State for Songs & Playlists ───────────────────────────────────────
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Song Edit Modal State ───────────────────────────────────────────────────
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [replaceAudioFile, setReplaceAudioFile] = useState<File | null>(null);
  const [replaceCoverFile, setReplaceCoverFile] = useState<File | null>(null);
  const [isSavingSong, setIsSavingSong] = useState(false);

  // ── Song Delete Confirmation Modal State ────────────────────────────────────
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [isDeletingSong, setIsDeletingSong] = useState(false);

  // ── Playlist Management State ───────────────────────────────────────────────
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [editingPlaylist, setEditingPlaylist] = useState<AdminPlaylist | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState('');
  const [editPlaylistDesc, setEditPlaylistDesc] = useState('');
  const [deletingPlaylist, setDeletingPlaylist] = useState<AdminPlaylist | null>(null);

  // ── Playlist Tracks Inspector State ─────────────────────────────────────────
  const [selectedPlaylist, setSelectedPlaylist] = useState<AdminPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Song[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<string>('');

  // 1. Fetch initial data
  useEffect(() => {
    async function loadAll() {
      try {
        // Load songs
        const songsRes = await fetch('/api/songs');
        if (songsRes.ok) {
          const loadedSongs = await songsRes.json();
          if (Array.isArray(loadedSongs)) {
            setSongs(loadedSongs);
          }
        }

        // Load playlists
        const playlistsRes = await fetch('/api/playlists');
        if (playlistsRes.ok) {
          const loadedPlaylists = await playlistsRes.json();
          if (Array.isArray(loadedPlaylists)) {
            setPlaylists(loadedPlaylists);
          }
        }
      } catch (err) {
        console.error('Failed to load admin data:', err);
      }
    }

    loadAll();
  }, [setSongs]);

  // Load tracks when a playlist is selected for inspection
  useEffect(() => {
    if (!selectedPlaylist) return;

    let isMounted = true;
    const playlistId = selectedPlaylist.id;

    async function loadTracks() {
      setIsLoadingTracks(true);
      try {
        const res = await fetch(`/api/playlists/${playlistId}/tracks`);
        if (res.ok && isMounted) {
          const tracks = await res.json();
          if (Array.isArray(tracks)) {
            setPlaylistTracks(tracks);
          }
        }
      } catch (err) {
        console.error('Failed to load playlist tracks:', err);
      } finally {
        if (isMounted) setIsLoadingTracks(false);
      }
    }

    loadTracks();
    return () => {
      isMounted = false;
    };
  }, [selectedPlaylist]);

  const showToast = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Filter songs
  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;
    const q = searchQuery.toLowerCase();
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );
  }, [songs, searchQuery]);

  // ── Song Actions ───────────────────────────────────────────────────────────

  const openEditSong = (song: Song) => {
    setEditingSong(song);
    setEditTitle(song.title);
    setEditArtist(song.artist);
    setEditAlbum(song.album || '');
    setReplaceAudioFile(null);
    setReplaceCoverFile(null);
  };

  const handleSaveSongEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong) return;

    setIsSavingSong(true);
    try {
      let audioPath = editingSong.audio_path;
      let coverPath = editingSong.cover_path;

      // 1. Upload replacement audio if selected
      if (replaceAudioFile) {
        const audioRes = await uploadAudio(replaceAudioFile);
        if (audioRes.error || !audioRes.path) {
          throw new Error(audioRes.error || 'Failed to upload replacement audio');
        }
        audioPath = audioRes.path;
      }

      // 2. Upload replacement cover if selected
      if (replaceCoverFile) {
        const coverRes = await uploadCover(replaceCoverFile);
        if (coverRes.error || !coverRes.path) {
          throw new Error(coverRes.error || 'Failed to upload replacement cover');
        }
        coverPath = coverRes.path;
      }

      // 3. Save updates
      const res = await fetch(`/api/songs/${editingSong.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          artist: editArtist.trim(),
          album: editAlbum.trim() || null,
          audio_path: audioPath,
          cover_path: coverPath,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.song) {
        throw new Error(data.error || 'Failed to update song');
      }

      updateSong(editingSong.id, data.song);
      // If currently playing, update track state
      if (currentTrack?.id === editingSong.id) {
        setCurrentTrack(data.song);
      }

      showToast(`Updated "${data.song.title}" successfully`, 'success');
      setEditingSong(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update song', 'error');
    } finally {
      setIsSavingSong(false);
    }
  };

  const handleConfirmDeleteSong = async () => {
    if (!deletingSong) return;
    setIsDeletingSong(true);

    try {
      const res = await fetch(`/api/songs/${deletingSong.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete song');
      }

      // Remove from store
      removeSong(deletingSong.id);

      // If currently playing, stop playback
      if (currentTrack?.id === deletingSong.id) {
        setIsPlaying(false);
        setCurrentTrack(null);
      }

      // If selected playlist has this song, remove it
      setPlaylistTracks((prev) => prev.filter((s) => s.id !== deletingSong.id));

      showToast(`Permanently deleted "${deletingSong.title}" and its storage files`, 'success');
      setDeletingSong(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deletion failed', 'error');
    } finally {
      setIsDeletingSong(false);
    }
  };

  // ── Playlist Actions ───────────────────────────────────────────────────────

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

      const data = await res.json();
      if (!res.ok || !data.playlist) {
        throw new Error(data.error || 'Failed to create playlist');
      }

      setPlaylists((prev) => [data.playlist, ...prev]);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setIsCreatePlaylistOpen(false);
      showToast(`Playlist "${data.playlist.name}" created`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error creating playlist', 'error');
    }
  };

  const handleSavePlaylistEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaylist || !editPlaylistName.trim()) return;

    try {
      const res = await fetch(`/api/playlists/${editingPlaylist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editPlaylistName.trim(),
          description: editPlaylistDesc.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.playlist) {
        throw new Error(data.error || 'Failed to rename playlist');
      }

      setPlaylists((prev) =>
        prev.map((p) => (p.id === editingPlaylist.id ? { ...p, ...data.playlist } : p))
      );
      if (selectedPlaylist?.id === editingPlaylist.id) {
        setSelectedPlaylist((prev) => (prev ? { ...prev, ...data.playlist } : null));
      }

      showToast('Playlist updated', 'success');
      setEditingPlaylist(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error updating playlist', 'error');
    }
  };

  const handleConfirmDeletePlaylist = async () => {
    if (!deletingPlaylist) return;

    try {
      const res = await fetch(`/api/playlists/${deletingPlaylist.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete playlist');
      }

      setPlaylists((prev) => prev.filter((p) => p.id !== deletingPlaylist.id));
      if (selectedPlaylist?.id === deletingPlaylist.id) {
        setSelectedPlaylist(null);
      }

      showToast(`Deleted playlist "${deletingPlaylist.name}"`, 'success');
      setDeletingPlaylist(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error deleting playlist', 'error');
    }
  };

  const handleAddTrackToPlaylist = async () => {
    if (!selectedPlaylist || !selectedSongToAdd) return;

    try {
      const res = await fetch(`/api/playlists/${selectedPlaylist.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: selectedSongToAdd }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add song to playlist');
      }

      const songObj = songs.find((s) => s.id === selectedSongToAdd);
      if (songObj && !playlistTracks.some((t) => t.id === selectedSongToAdd)) {
        setPlaylistTracks((prev) => [...prev, songObj]);
      }

      // Update track count on playlist card
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === selectedPlaylist.id
            ? { ...p, track_count: (p.track_count || 0) + (data.duplicate ? 0 : 1) }
            : p
        )
      );

      setSelectedSongToAdd('');
      showToast(data.duplicate ? 'Song is already in this playlist' : 'Song added to playlist', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add song', 'error');
    }
  };

  const handleRemoveTrackFromPlaylist = async (songId: string) => {
    if (!selectedPlaylist) return;

    try {
      const res = await fetch(`/api/playlists/${selectedPlaylist.id}/tracks?song_id=${songId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove song');
      }

      setPlaylistTracks((prev) => prev.filter((t) => t.id !== songId));
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === selectedPlaylist.id
            ? { ...p, track_count: Math.max(0, (p.track_count || 1) - 1) }
            : p
        )
      );

      showToast('Track removed from playlist', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error removing track', 'error');
    }
  };

  const handleMoveTrack = async (index: number, direction: 'up' | 'down') => {
    if (!selectedPlaylist) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlistTracks.length) return;

    const reordered = [...playlistTracks];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setPlaylistTracks(reordered);

    try {
      const songIds = reordered.map((s) => s.id);
      await fetch(`/api/playlists/${selectedPlaylist.id}/tracks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_ids: songIds }),
      });
    } catch (err) {
      console.error('Failed to persist reordering:', err);
    }
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Admin & Library Management' }]} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px calc(var(--player-h) + 48px)' }}>
          {/* Toast Notification */}
          {statusMessage && (
            <div
              style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 10000,
                padding: '12px 18px',
                borderRadius: '10px',
                background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Header */}
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
                  fontSize: '26px',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-1)',
                  marginBottom: '4px',
                }}
              >
                Library Management
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                Owner controls: manage tracks, upload media, edit metadata, and organize playlists.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Upload Music
              </Link>
            </div>
          </div>

          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '20px',
            }}
          >
            <button
              onClick={() => setActiveTab('songs')}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'songs' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'songs' ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: activeTab === 'songs' ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Songs Catalog ({songs.length})
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'playlists' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'playlists' ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: activeTab === 'playlists' ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Playlists ({playlists.length})
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: SONGS MANAGEMENT                                           */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'songs' && (
            <div>
              {/* Search Bar */}
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Search tracks by title, artist, or album..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-1)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Songs Table */}
              <div
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px minmax(200px, 2fr) minmax(140px, 1fr) 80px 120px',
                    padding: '10px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-4)',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <span>#</span>
                  <span>Title &amp; Artist</span>
                  <span>Album</span>
                  <span style={{ textAlign: 'right' }}>Duration</span>
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>

                {filteredSongs.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                    No tracks found.
                  </div>
                ) : (
                  filteredSongs.map((song, idx) => (
                    <div
                      key={song.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px minmax(200px, 2fr) minmax(140px, 1fr) 80px 120px',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>{idx + 1}</span>

                      {/* Cover + Title + Artist */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div
                          style={{
                            position: 'relative',
                            width: '38px',
                            height: '38px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            background: 'var(--surface-3)',
                          }}
                        >
                          <CoverImage
                            src={song.cover_url || song.cover_path}
                            alt={song.title}
                            fill
                            sizes="38px"
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song.title}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song.artist}
                          </p>
                        </div>
                      </div>

                      {/* Album */}
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                        {song.album || '—'}
                      </div>

                      {/* Duration */}
                      <div style={{ fontSize: '12px', color: 'var(--text-4)', textAlign: 'right' }}>
                        {Math.floor(song.duration_seconds / 60)}:{(song.duration_seconds % 60).toString().padStart(2, '0')}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEditSong(song)}
                          title="Edit metadata / replace media"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            background: 'var(--surface-3)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-1)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingSong(song)}
                          title="Permanently delete song"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#F87171',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: PLAYLISTS MANAGEMENT                                       */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'playlists' && (
            <div style={{ display: 'grid', gridTemplateColumns: selectedPlaylist ? '1fr 1.2fr' : '1fr', gap: '24px' }}>
              {/* Playlists Catalog Column */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                    Playlists
                  </h2>
                  <button
                    onClick={() => setIsCreatePlaylistOpen(true)}
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '6px 14px',
                      borderRadius: '999px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    + New Playlist
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {playlists.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', background: 'var(--surface-2)', borderRadius: '12px', color: 'var(--text-3)' }}>
                      No playlists created yet.
                    </div>
                  ) : (
                    playlists.map((playlist) => {
                      const isSelected = selectedPlaylist?.id === playlist.id;
                      return (
                        <div
                          key={playlist.id}
                          onClick={() => setSelectedPlaylist(playlist)}
                          style={{
                            padding: '14px 16px',
                            borderRadius: '12px',
                            background: isSelected ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface-1)',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text-1)', margin: 0 }}>
                              {playlist.name}
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: '4px 0 0' }}>
                              {playlist.track_count ?? 0} tracks {playlist.description && `• ${playlist.description}`}
                            </p>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPlaylist(playlist);
                                setEditPlaylistName(playlist.name);
                                setEditPlaylistDesc(playlist.description || '');
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: 'var(--surface-3)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-2)',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => setDeletingPlaylist(playlist)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#F87171',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Playlist Tracks Inspector Column */}
              {selectedPlaylist && (
                <div
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    padding: '20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                        {selectedPlaylist.name}
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: '4px 0 0' }}>
                        Reorder tracks or remove them from this playlist.
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedPlaylist(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        fontSize: '18px',
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Add Track Selector */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <select
                      value={selectedSongToAdd}
                      onChange={(e) => setSelectedSongToAdd(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-1)',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    >
                      <option value="">Select a track to add...</option>
                      {songs.map((song) => (
                        <option key={song.id} value={song.id}>
                          {song.title} — {song.artist}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddTrackToPlaylist}
                      disabled={!selectedSongToAdd}
                      style={{
                        background: 'var(--accent)',
                        color: '#000',
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '0 14px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: !selectedSongToAdd ? 'not-allowed' : 'pointer',
                        opacity: !selectedSongToAdd ? 0.6 : 1,
                      }}
                    >
                      Add
                    </button>
                  </div>

                  {/* Track List with Move Up / Down & Remove */}
                  {isLoadingTracks ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' }}>
                      Loading tracks...
                    </div>
                  ) : playlistTracks.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' }}>
                      No tracks in this playlist yet. Add songs using the dropdown above.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {playlistTracks.map((track, idx) => (
                        <div
                          key={track.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--surface-2)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-4)', width: '18px' }}>
                              {idx + 1}
                            </span>
                            <div
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                position: 'relative',
                                flexShrink: 0,
                                background: 'var(--surface-3)',
                              }}
                            >
                              <CoverImage
                                src={track.cover_url || track.cover_path}
                                alt={track.title}
                                fill
                                sizes="30px"
                                style={{ objectFit: 'cover' }}
                              />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {track.title}
                              </p>
                              <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {track.artist}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {/* Move Up */}
                            <button
                              onClick={() => handleMoveTrack(idx, 'up')}
                              disabled={idx === 0}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: idx === 0 ? 'var(--text-4)' : 'var(--text-2)',
                                cursor: idx === 0 ? 'default' : 'pointer',
                                padding: '4px',
                              }}
                              title="Move Up"
                            >
                              ▲
                            </button>
                            {/* Move Down */}
                            <button
                              onClick={() => handleMoveTrack(idx, 'down')}
                              disabled={idx === playlistTracks.length - 1}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: idx === playlistTracks.length - 1 ? 'var(--text-4)' : 'var(--text-2)',
                                cursor: idx === playlistTracks.length - 1 ? 'default' : 'pointer',
                                padding: '4px',
                              }}
                              title="Move Down"
                            >
                              ▼
                            </button>
                            {/* Remove from playlist */}
                            <button
                              onClick={() => handleRemoveTrackFromPlaylist(track.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#F87171',
                                cursor: 'pointer',
                                padding: '4px',
                                marginLeft: '6px',
                              }}
                              title="Remove from playlist"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {/* 1. Edit Song Modal */}
      {editingSong && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '16px' }}>
              Edit Track Details
            </h3>

            <form onSubmit={handleSaveSongEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                  Track Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-1)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                  Artist
                </label>
                <input
                  type="text"
                  required
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-1)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                  Album
                </label>
                <input
                  type="text"
                  value={editAlbum}
                  onChange={(e) => setEditAlbum(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-1)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                  Replace Audio File (Optional)
                </label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setReplaceAudioFile(e.target.files[0]);
                  }}
                  style={{ fontSize: '12px', color: 'var(--text-3)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '4px' }}>
                  Replace Cover Artwork (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setReplaceCoverFile(e.target.files[0]);
                  }}
                  style={{ fontSize: '12px', color: 'var(--text-3)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingSong(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-2)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSong}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#000',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isSavingSong ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingSong ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Confirm Song Delete Modal */}
      {deletingSong && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#EF4444', marginBottom: '8px' }}>
              Permanently Delete Song?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.5', marginBottom: '16px' }}>
              Are you sure you want to delete &ldquo;<strong>{deletingSong.title}</strong>&rdquo; by {deletingSong.artist}?
              <br />
              This will permanently purge the database record, audio storage object, cover artwork, and all playlist entries.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingSong(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-2)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteSong}
                disabled={isDeletingSong}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#EF4444',
                  border: 'none',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isDeletingSong ? 'not-allowed' : 'pointer',
                }}
              >
                {isDeletingSong ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Create Playlist Modal */}
      {isCreatePlaylistOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '14px' }}>
              Create New Playlist
            </h3>
            <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                required
                autoFocus
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-1)',
                  fontSize: '13px',
                }}
              />
              <input
                type="text"
                placeholder="Description (optional)..."
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-1)',
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreatePlaylistOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-2)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Playlist Modal */}
      {editingPlaylist && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '14px' }}>
              Rename Playlist
            </h3>
            <form onSubmit={handleSavePlaylistEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                required
                value={editPlaylistName}
                onChange={(e) => setEditPlaylistName(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-1)',
                  fontSize: '13px',
                }}
              />
              <input
                type="text"
                placeholder="Description..."
                value={editPlaylistDesc}
                onChange={(e) => setEditPlaylistDesc(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-1)',
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingPlaylist(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-2)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editPlaylistName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Playlist Modal */}
      {deletingPlaylist && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#EF4444', marginBottom: '8px' }}>
              Delete Playlist?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '16px' }}>
              Are you sure you want to delete &ldquo;<strong>{deletingPlaylist.name}</strong>&rdquo;? The tracks themselves will remain in your library.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingPlaylist(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-2)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeletePlaylist}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#EF4444',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <MiniPlayer />
      <BottomNav />
    </>
  );
}
