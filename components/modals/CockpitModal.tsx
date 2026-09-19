'use client';

import { useState, useEffect } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { uploadAudio, uploadCover } from '@/lib/supabase/storage';
import { broadcastCatalogChange } from '@/lib/realtime/catalogSync';
import { CoverImage } from '@/components/ui/CoverImage';
import type { Song, Banner } from '@/types';
import { DEFAULT_BANNERS } from '@/lib/constants/defaults';
import { RECOMMENDED_BANNER_RESOLUTION } from '@/components/home/BannerCarousel';
import { BannerCropperModal } from '@/components/modals/BannerCropperModal';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Manage Your Cockpit (Administration & Library Control Center)
// Restricted strictly to authenticated Administrator.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'music' | 'banners' | 'playlists';

export function CockpitModal() {
  const isOpen = useLibraryStore((state) => state.isCockpitModalOpen);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  if (!isOpen || !isAdmin) return null;

  return <CockpitModalContent />;
}

function CockpitModalContent() {
  const setIsOpen = useLibraryStore((state) => state.setIsCockpitModalOpen);
  const songs = useLibraryStore((state) => state.songs);
  const setSongs = useLibraryStore((state) => state.setSongs);
  const addSong = useLibraryStore((state) => state.addSong);
  const updateSong = useLibraryStore((state) => state.updateSong);
  const removeSong = useLibraryStore((state) => state.removeSong);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const setCurrentTrack = usePlayerStore((state) => state.setCurrentTrack);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);

  const [activeTab, setActiveTab] = useState<Tab>('music');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Add Music Form ─────────────────────────────────────────────────────────
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newAlbum, setNewAlbum] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [isUploadingSong, setIsUploadingSong] = useState(false);

  // ── Edit Song ──────────────────────────────────────────────────────────────
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [replaceAudioFile, setReplaceAudioFile] = useState<File | null>(null);
  const [replaceCoverFile, setReplaceCoverFile] = useState<File | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // ── Delete Song ────────────────────────────────────────────────────────────
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Banners State ──────────────────────────────────────────────────────────
  const [banners, setBanners] = useState<Banner[]>(DEFAULT_BANNERS);
  const [uploadingBannerSlot, setUploadingBannerSlot] = useState<number | null>(null);

  // ── Edit Banner Content State ──────────────────────────────────────────────
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [editBannerTitle, setEditBannerTitle] = useState('');
  const [editBannerSubtitle, setEditBannerSubtitle] = useState('');
  const [editBannerCategory, setEditBannerCategory] = useState('');
  const [editBannerStats, setEditBannerStats] = useState('');
  const [isSavingBanner, setIsSavingBanner] = useState(false);

  // Load banners on open
  useEffect(() => {
    async function loadBanners() {
      try {
        const res = await fetch('/api/banners');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length === 4) setBanners(data);
        }
      } catch (err) {
        console.warn('Failed to load cockpit banners:', err);
      }
    }
    loadBanners();
  }, []);

  // Cropper state
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const [cropperSlotId, setCropperSlotId] = useState<number | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);

  const handleCropperConfirm = async (processedFile: File) => {
    setIsCropperOpen(false);
    if (cropperSlotId !== null) {
      await handleBannerUpload(cropperSlotId, processedFile);
      if (editingBanner && editingBanner.id === cropperSlotId) {
        try {
          const res = await fetch('/api/banners');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              const fresh = data.find((b: Banner) => b.id === cropperSlotId);
              if (fresh) setEditingBanner(fresh);
            }
          }
        } catch {
          // ignore
        }
      }
    }
    setCropperFile(null);
    setCropperSlotId(null);
  };

  const showToast = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // ── Handle Add Music ───────────────────────────────────────────────────────
  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAudioFile) {
      showToast('Audio file is required', 'error');
      return;
    }
    if (!newCoverFile) {
      showToast('Cover artwork is required', 'error');
      return;
    }
    if (!newTitle.trim() || !newArtist.trim() || !newAlbum.trim() || !newGenre.trim()) {
      showToast('Title, Artist, Album, and Genre are all required fields', 'error');
      return;
    }

    setIsUploadingSong(true);
    try {
      // 1. Upload audio
      const audioRes = await uploadAudio(newAudioFile);
      if (audioRes.error || !audioRes.path) {
        throw new Error(audioRes.error || 'Failed to upload audio');
      }

      // 2. Upload cover
      const coverRes = await uploadCover(newCoverFile);
      if (coverRes.error || !coverRes.path) {
        throw new Error(coverRes.error || 'Failed to upload cover');
      }

      // 3. Create song record
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          artist: newArtist.trim(),
          album: newAlbum.trim(),
          genre: newGenre.trim(),
          audio_path: audioRes.path,
          cover_path: coverRes.path,
          duration_seconds: 180,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.song) {
        throw new Error(data.error || 'Failed to create song');
      }

      addSong(data.song);
      broadcastCatalogChange({ type: 'SONG_ADDED', song: data.song });
      showToast(`Added "${data.song.title}" to library`, 'success');
      setNewTitle('');
      setNewArtist('');
      setNewAlbum('');
      setNewGenre('');
      setNewAudioFile(null);
      setNewCoverFile(null);
      setIsAddSongOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setIsUploadingSong(false);
    }
  };

  // ── Handle Edit Song ───────────────────────────────────────────────────────
  const handleSaveSongEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSong) return;
    if (!editTitle.trim() || !editArtist.trim() || !editAlbum.trim() || !editGenre.trim()) {
      showToast('Title, Artist, Album, and Genre are all required fields', 'error');
      return;
    }

    setIsSavingEdit(true);
    try {
      let audioPath = editingSong.audio_path;
      let coverPath = editingSong.cover_path;

      if (replaceAudioFile) {
        const audioRes = await uploadAudio(replaceAudioFile);
        if (audioRes.error || !audioRes.path) throw new Error(audioRes.error || 'Failed to replace audio');
        audioPath = audioRes.path;
      }

      if (replaceCoverFile) {
        const coverRes = await uploadCover(replaceCoverFile);
        if (coverRes.error || !coverRes.path) throw new Error(coverRes.error || 'Failed to replace cover');
        coverPath = coverRes.path;
      }

      const res = await fetch(`/api/songs/${editingSong.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          artist: editArtist.trim(),
          album: editAlbum.trim(),
          genre: editGenre.trim(),
          audio_path: audioPath,
          cover_path: coverPath,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.song) throw new Error(data.error || 'Failed to update song');

      updateSong(editingSong.id, data.song);
      broadcastCatalogChange({ type: 'SONG_UPDATED', song: data.song });
      if (currentTrack?.id === editingSong.id) {
        setCurrentTrack(data.song);
      }

      showToast(`Updated "${data.song.title}"`, 'success');
      setEditingSong(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Handle True Song Deletion ──────────────────────────────────────────────
  const handleConfirmDeleteSong = async () => {
    if (!deletingSong) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/songs/${deletingSong.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');

      removeSong(deletingSong.id);
      broadcastCatalogChange({ type: 'SONG_DELETED', songId: deletingSong.id });
      if (currentTrack?.id === deletingSong.id) {
        setIsPlaying(false);
        setCurrentTrack(null);
      }

      showToast(`Permanently deleted "${deletingSong.title}" and storage files`, 'success');
      setDeletingSong(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error deleting song', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Handle Restore Original Catalog ────────────────────────────────────────
  const [isRestoringCatalog, setIsRestoringCatalog] = useState(false);
  const handleRestoreCatalog = async () => {
    setIsRestoringCatalog(true);
    try {
      const res = await fetch('/api/admin/restore-catalog', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restoration failed');

      const songsRes = await fetch('/api/songs');
      if (songsRes.ok) {
        const list = await songsRes.json();
        setSongs(list);
      }
      broadcastCatalogChange({ type: 'SONG_ADDED' });
      showToast('Successfully restored original Cariño music catalog!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Catalog restoration failed', 'error');
    } finally {
      setIsRestoringCatalog(false);
    }
  };

  // ── Handle Banner Image Upload ─────────────────────────────────────────────
  const handleBannerUpload = async (slotId: number, file: File) => {
    setUploadingBannerSlot(slotId);
    try {
      const formData = new FormData();
      formData.append('id', slotId.toString());
      formData.append('file', file);

      const targetBanner = banners.find((b) => b.id === slotId);
      formData.append('title', targetBanner?.title || `Banner ${slotId}`);
      formData.append('subtitle', targetBanner?.subtitle || '');
      formData.append('category', targetBanner?.category || 'FEATURED');
      formData.append('stats', targetBanner?.stats || '');

      const res = await fetch('/api/banners', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.banners) throw new Error(data.error || 'Failed to upload banner');

      setBanners(data.banners);
      if (editingBanner && editingBanner.id === slotId) {
        const fresh = data.banners.find((b: Banner) => b.id === slotId);
        if (fresh) setEditingBanner(fresh);
      }
      window.dispatchEvent(new CustomEvent('carino:banners-updated'));
      showToast(`Banner ${slotId} image updated successfully`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Banner upload failed', 'error');
    } finally {
      setUploadingBannerSlot(null);
    }
  };

  // ── Handle Banner Text & Content Save ──────────────────────────────────────
  const handleSaveBannerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner) return;
    if (!editBannerTitle.trim()) {
      showToast('Banner title is required', 'error');
      return;
    }

    setIsSavingBanner(true);
    try {
      const res = await fetch('/api/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingBanner.id,
          title: editBannerTitle.trim(),
          subtitle: editBannerSubtitle.trim(),
          category: editBannerCategory.trim(),
          stats: editBannerStats.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.banners) {
        throw new Error(data.error || 'Failed to update banner content');
      }

      setBanners(data.banners);
      window.dispatchEvent(new CustomEvent('carino:banners-updated'));
      showToast(`Banner ${editingBanner.id} updated successfully`, 'success');
      setEditingBanner(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save banner', 'error');
    } finally {
      setIsSavingBanner(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        padding: 'clamp(10px, 3vw, 24px)',
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: 'min(90vh, 100dvh - 20px)',
          background: '#0E0E0E',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 'clamp(16px, 3vw, 24px)',
          padding: 'clamp(16px, 3vw, 28px)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
              Manage Your Cockpit
            </h2>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '4px 0 0' }}>
              CARIÑO administration: manage songs, metadata, banners, and storage.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#8E8E93',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Status Toast */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${statusMsg.type === 'success' ? '#10B981' : '#EF4444'}`,
              color: statusMsg.type === 'success' ? '#34D399' : '#F87171',
              fontSize: '12.5px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Tab Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '20px',
          }}
        >
          <button
            onClick={() => setActiveTab('music')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'music' ? '2px solid #FFFFFF' : '2px solid transparent',
              color: activeTab === 'music' ? '#FFFFFF' : '#8E8E93',
              fontWeight: activeTab === 'music' ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
            }}
          >
            Music ({songs.length})
          </button>
          <button
            onClick={() => setActiveTab('banners')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'banners' ? '2px solid #FFFFFF' : '2px solid transparent',
              color: activeTab === 'banners' ? '#FFFFFF' : '#8E8E93',
              fontWeight: activeTab === 'banners' ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
            }}
          >
            Banner Management (4 Slots)
          </button>
        </div>

        {/* Tab Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: MUSIC MANAGEMENT                                         */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'music' && (
            <div>
              {/* Header Action Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: '#8E8E93' }}>
                  {songs.length} track{songs.length === 1 ? '' : 's'} stored
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={handleRestoreCatalog}
                    disabled={isRestoringCatalog}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '9999px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#FFFFFF',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: isRestoringCatalog ? 'default' : 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      opacity: isRestoringCatalog ? 0.6 : 1,
                    }}
                  >
                    {isRestoringCatalog ? 'Restoring...' : '🔄 Restore Original Music'}
                  </button>
                  <button
                    onClick={() => setIsAddSongOpen(!isAddSongOpen)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '9999px',
                      background: '#FFFFFF',
                      color: '#000000',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                  >
                    {isAddSongOpen ? 'Cancel' : '+ Add Music'}
                  </button>
                </div>
              </div>

              {/* Add Song Collapsible Form */}
              {isAddSongOpen && (
                <form
                  onSubmit={handleAddSong}
                  style={{
                    background: '#161616',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                    Add New Track <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 400 }}>(All fields marked * are strictly required)</span>
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Title *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Song Title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Artist *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Artist Name"
                        value={newArtist}
                        onChange={(e) => setNewArtist(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Album *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Album / EP Name"
                        value={newAlbum}
                        onChange={(e) => setNewAlbum(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Genre *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. R&B, Punjabi, Lo-Fi, Pop"
                        value={newGenre}
                        onChange={(e) => setNewGenre(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', outline: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Audio File (MP3) *
                      </label>
                      <input
                        type="file"
                        required
                        accept="audio/mp3,audio/mpeg"
                        onChange={(e) => setNewAudioFile(e.target.files?.[0] || null)}
                        style={{ fontSize: '12px', color: '#8E8E93' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                        Cover Artwork (JPG/PNG) *
                      </label>
                      <input
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setNewCoverFile(e.target.files?.[0] || null)}
                        style={{ fontSize: '12px', color: '#8E8E93' }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUploadingSong}
                    style={{
                      marginTop: '6px',
                      padding: '9px 18px',
                      borderRadius: '8px',
                      background: '#FFFFFF',
                      color: '#000000',
                      fontWeight: 700,
                      fontSize: '13px',
                      border: 'none',
                      cursor: isUploadingSong ? 'default' : 'pointer',
                      opacity: isUploadingSong ? 0.7 : 1,
                    }}
                  >
                    {isUploadingSong ? 'Uploading...' : 'Save & Publish Song'}
                  </button>
                </form>
              )}

              {/* Songs Catalog List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {songs.map((song) => (
                  <div
                    key={song.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#202020',
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
                        <CoverImage
                          src={song.cover_url || song.cover_path}
                          alt={song.title}
                          fill
                          sizes="40px"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.title}
                        </p>
                        <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.artist} • {song.album || 'No album'} • {song.genre || 'General'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setEditingSong(song);
                          setEditTitle(song.title);
                          setEditArtist(song.artist);
                          setEditAlbum(song.album || '');
                          setEditGenre(song.genre || '');
                          setReplaceAudioFile(null);
                          setReplaceCoverFile(null);
                        }}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#FFFFFF',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingSong(song)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: 'none',
                          color: '#F87171',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: BANNER MANAGEMENT (EXACTLY 4 SLOTS)                     */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {activeTab === 'banners' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                  Dashboard Banner Container Resolution
                </p>
                <p style={{ fontSize: '12px', color: '#D1D1D6', margin: '4px 0 0' }}>
                  Recommended resolution: <strong style={{ color: '#FFFFFF' }}>{RECOMMENDED_BANNER_RESOLUTION}</strong>
                </p>
              </div>

              {[1, 2, 3, 4].map((slotId) => {
                const banner = banners.find((b) => b.id === slotId) || {
                  id: slotId,
                  title: `Banner ${slotId}`,
                  subtitle: '',
                };

                return (
                  <div
                    key={slotId}
                    style={{
                      background: '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                    }}
                  >
                    {/* Thumbnail preview */}
                    <div
                      style={{
                        width: '72px',
                        height: '42px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: banner.gradient || '#202020',
                        position: 'relative',
                        flexShrink: 0,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {banner.image_url && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url(${banner.image_url})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent, #FF5500)', background: 'rgba(255,85,0,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                          Slot {slotId}
                        </span>
                        {banner.category && (
                          <span style={{ fontSize: '10.5px', color: '#8E8E93', fontWeight: 600, textTransform: 'uppercase' }}>
                            {banner.category}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {banner.title}
                      </p>
                      <p style={{ fontSize: '11px', color: '#8E8E93', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {banner.subtitle || 'No description set'}
                      </p>
                      {banner.stats && (
                        <p style={{ fontSize: '10.5px', color: '#D1D1D6', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ❤️ {banner.stats}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBanner(banner);
                          setEditBannerTitle(banner.title);
                          setEditBannerSubtitle(banner.subtitle || '');
                          setEditBannerCategory(banner.category || '');
                          setEditBannerStats(banner.stats || '');
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Edit Content
                      </button>

                      <label
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: uploadingBannerSlot === slotId ? 'rgba(255,255,255,0.2)' : '#FFFFFF',
                          color: '#000000',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: uploadingBannerSlot === slotId ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {uploadingBannerSlot === slotId ? 'Uploading...' : 'Replace Image'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={uploadingBannerSlot === slotId}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!file.type.startsWith('image/')) {
                                showToast('Please select a valid image file (JPEG, PNG, WEBP, GIF)', 'error');
                                return;
                              }
                              const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
                              if (isGif) {
                                // Bypass BannerCropperModal for GIFs to preserve original multi-frame animation
                                handleBannerUpload(slotId, file);
                              } else {
                                setCropperSlotId(slotId);
                                setCropperFile(file);
                                setIsCropperOpen(true);
                              }
                            }
                            e.target.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Edit Song Modal ──────────────────────────────────────────────── */}
        {editingSong && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setEditingSong(null)}
          >
            <form
              onSubmit={handleSaveSongEdit}
              style={{
                width: '100%',
                maxWidth: '480px',
                background: '#161616',
                borderRadius: '18px',
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Edit Song <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 400 }}>(* Required)</span>
              </h3>
              <p style={{ fontSize: '12px', color: '#8E8E93', margin: 0 }}>
                Update title, artist, album, genre, or replace audio/artwork.
              </p>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Artist *</label>
                <input
                  type="text"
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', marginTop: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Album *</label>
                  <input
                    type="text"
                    value={editAlbum}
                    onChange={(e) => setEditAlbum(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', marginTop: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Genre *</label>
                  <input
                    type="text"
                    value={editGenre}
                    onChange={(e) => setEditGenre(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', marginTop: '4px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Replace Audio (Optional)</label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg"
                  onChange={(e) => setReplaceAudioFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#D1D1D6' }}>Replace Artwork (Optional)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setReplaceCoverFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingSong(null)}
                  style={{ padding: '7px 14px', borderRadius: '6px', background: 'transparent', color: '#8E8E93', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  style={{ padding: '7px 16px', borderRadius: '6px', background: '#FFFFFF', color: '#000000', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Confirm Delete Modal ─────────────────────────────────────────── */}
        {deletingSong && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setDeletingSong(null)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '400px',
                background: '#161616',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#F87171', margin: 0 }}>
                Permanently Delete Song?
              </h3>
              <p style={{ fontSize: '12.5px', color: '#D1D1D6', margin: '8px 0 16px' }}>
                Are you sure you want to delete <strong>{deletingSong.title}</strong>? This removes the database record, audio storage file, cover storage file, and playlist links permanently.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setDeletingSong(null)}
                  style={{ padding: '7px 14px', borderRadius: '6px', background: 'transparent', color: '#8E8E93', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteSong}
                  disabled={isDeleting}
                  style={{ padding: '7px 16px', borderRadius: '6px', background: '#EF4444', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Banner Content Modal ────────────────────────────────────── */}
        {editingBanner && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setEditingBanner(null)}
          >
            <form
              onSubmit={handleSaveBannerEdit}
              style={{
                width: '100%',
                maxWidth: '520px',
                background: '#161616',
                borderRadius: '18px',
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 24px 48px rgba(0,0,0,0.8)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>
                  Edit Banner Content
                </h3>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent, #FF5500)', background: 'rgba(255,85,0,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  Slot {editingBanner.id} of 4
                </span>
              </div>

              {/* Banner Artwork Preview inside modal */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '110px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: editingBanner.gradient || '#202020',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                {editingBanner.image_url && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `url(${editingBanner.image_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)',
                  }}
                />
                <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 16px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', margin: '0 0 2px' }}>
                    {editBannerCategory || 'PROMOTIONAL BANNER'}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: 0 }}>
                    {editBannerTitle || `Banner ${editingBanner.id}`}
                  </p>
                </div>

                <label
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    zIndex: 3,
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Change Artwork
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (!file.type.startsWith('image/')) {
                          showToast('Please select a valid image file', 'error');
                          return;
                        }
                        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
                        if (isGif) {
                          // Bypass BannerCropperModal for GIFs to preserve original multi-frame animation
                          handleBannerUpload(editingBanner.id, file);
                        } else {
                          setCropperSlotId(editingBanner.id);
                          setCropperFile(file);
                          setIsCropperOpen(true);
                        }
                      }
                      e.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Banner Title (e.g. R&B Hits)"
                  value={editBannerTitle}
                  onChange={(e) => setEditBannerTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                    Category / Tag
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CURATED PLAYLIST"
                    value={editBannerCategory}
                    onChange={(e) => setEditBannerCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                    Stats / Metadata
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 50,056 Likes • 213 Songs, 13 hr 7 min"
                    value={editBannerStats}
                    onChange={(e) => setEditBannerStats(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '4px' }}>
                  Subtitle / Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Artists, description, or curated message..."
                  value={editBannerSubtitle}
                  onChange={(e) => setEditBannerSubtitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#202020', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingBanner(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: '#8E8E93', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBanner}
                  style={{ padding: '8px 20px', borderRadius: '8px', background: '#FFFFFF', color: '#000000', fontWeight: 700, border: 'none', cursor: isSavingBanner ? 'default' : 'pointer', fontSize: '13px', opacity: isSavingBanner ? 0.7 : 1 }}
                >
                  {isSavingBanner ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}
        {/* ── Banner Cropper Modal ───────────────────────────────────────── */}
        <BannerCropperModal
          isOpen={isCropperOpen}
          file={cropperFile}
          slotId={cropperSlotId}
          onClose={() => {
            setIsCropperOpen(false);
            setCropperFile(null);
            setCropperSlotId(null);
          }}
          onConfirm={handleCropperConfirm}
        />
      </div>
    </div>
  );
}
