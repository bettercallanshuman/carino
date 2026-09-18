'use client';

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { uploadAudio, uploadCover } from '@/lib/supabase/storage';
import { createSong } from '@/lib/supabase/songs';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Song Upload Page (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────

type UploadStep = 'idle' | 'uploading-audio' | 'uploading-cover' | 'saving' | 'done' | 'error';

export default function UploadPage() {
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

  return <UploadPageContent />;
}

function UploadPageContent() {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [status, setStatus] = useState<UploadStep>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadedSong, setUploadedSong] = useState<Song | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const addSongToLibrary = useLibraryStore((state) => state.addSong);
  const setQueue = usePlayerStore((state) => state.setQueue);

  // ── Handle Audio Selection ──────────────────────────────────────────────────
  const processAudioFile = (file: File) => {
    if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.wav') && !file.name.endsWith('.m4a')) {
      setErrorMessage('Please select a valid MP3, WAV, or M4A audio file.');
      return;
    }
    setAudioFile(file);
    setErrorMessage('');

    // Pre-populate title if empty
    if (!title) {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(cleanTitle);
    }

    // Extract duration via HTML5 Audio element
    try {
      const audioUrl = URL.createObjectURL(file);
      const tempAudio = new Audio();
      tempAudio.src = audioUrl;
      tempAudio.onloadedmetadata = () => {
        const dur = Math.round(tempAudio.duration);
        if (!isNaN(dur) && dur > 0) {
          setAudioDuration(dur);
        }
        URL.revokeObjectURL(audioUrl);
      };
    } catch {
      // Fallback default duration
      setAudioDuration(180);
    }
  };

  // ── Handle Cover Art Selection ──────────────────────────────────────────────
  const processCoverFile = (file: File) => {
    const isImageMime = file.type && file.type.startsWith('image/');
    const isImageExt = /\.(jpe?g|png|svg|webp|gif|avif|bmp|ico|tiff?)$/i.test(file.name);
    if (!isImageMime && !isImageExt) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, SVG, WebP, GIF, AVIF, BMP).');
      return;
    }
    setCoverFile(file);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      setCoverPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // ── Form Submission ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audioFile) {
      setErrorMessage('Please select an audio file.');
      return;
    }
    if (!title.trim()) {
      setErrorMessage('Please enter a track title.');
      return;
    }
    if (!artist.trim()) {
      setErrorMessage('Please enter an artist name.');
      return;
    }

    setErrorMessage('');
    setStatus('uploading-audio');
    setStatusMessage('Uploading audio file to storage...');

    try {
      // 1. Upload audio
      let audioPath = '';
      const audioRes = await uploadAudio(audioFile);
      if (audioRes.error || !audioRes.path) {
        throw new Error(audioRes.error || 'Failed to upload audio file');
      }
      audioPath = audioRes.path;

      // 2. Upload cover if provided
      setStatus('uploading-cover');
      setStatusMessage('Uploading album cover...');
      let coverPath = '';
      if (coverFile) {
        const coverRes = await uploadCover(coverFile);
        if (coverRes.error || !coverRes.path) {
          throw new Error(coverRes.error || 'Failed to upload cover artwork');
        }
        coverPath = coverRes.path;
      } else {
        // Fallback default cover artwork
        coverPath = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
      }

      // 3. Save song record to database
      setStatus('saving');
      setStatusMessage('Saving track to your library...');

      const result = await createSong({
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim() || undefined,
        duration_seconds: audioDuration || 180,
        audio_path: audioPath,
        cover_path: coverPath,
      });

      if (result.error || !result.song) {
        throw new Error(result.error || 'Failed to save song');
      }

      // Register song into client store
      addSongToLibrary(result.song);
      setUploadedSong(result.song);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const handleReset = () => {
    setTitle('');
    setArtist('');
    setAlbum('');
    setAudioFile(null);
    setAudioDuration(0);
    setCoverFile(null);
    setCoverPreview(null);
    setStatus('idle');
    setUploadedSong(null);
    setErrorMessage('');
  };

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Upload Music' }]} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '28px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)' }}>
                Add to your shared library
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>
                Upload high-fidelity audio and cover artwork for your private listening room.
              </p>
            </div>

            {/* Success View */}
            {status === 'done' && uploadedSong ? (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '16px',
                  padding: '32px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    color: '#fff',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '8px' }}>
                  Track added successfully!
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px' }}>
                  &ldquo;{uploadedSong.title}&rdquo; by {uploadedSong.artist} is now ready to stream.
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      setQueue([uploadedSong], 0);
                    }}
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                      fontWeight: 700,
                      fontSize: '13px',
                      padding: '10px 20px',
                      borderRadius: '999px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Play Now
                  </button>

                  <Link
                    href="/library"
                    style={{
                      background: 'var(--surface-3)',
                      color: 'var(--text-1)',
                      fontWeight: 600,
                      fontSize: '13px',
                      padding: '10px 20px',
                      borderRadius: '999px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Go to Library
                  </Link>

                  <button
                    onClick={handleReset}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-3)',
                      fontWeight: 600,
                      fontSize: '13px',
                      padding: '10px 16px',
                      borderRadius: '999px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    Upload Another
                  </button>
                </div>
              </div>
            ) : (
              /* Upload Form */
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {errorMessage && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#F87171',
                      fontSize: '13px',
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                {/* Audio File Drag & Drop Zone */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Audio File (MP3, WAV, M4A)
                  </label>

                  <div
                    onClick={() => audioInputRef.current?.click()}
                    onDragOver={(e: DragEvent) => e.preventDefault()}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        processAudioFile(e.dataTransfer.files[0]);
                      }
                    }}
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: '14px',
                      padding: '24px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: audioFile ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface-2)',
                      borderColor: audioFile ? 'var(--accent)' : 'var(--border-subtle)',
                      transition: 'all var(--t-base)',
                    }}
                  >
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
                      style={{ display: 'none' }}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        if (e.target.files?.[0]) processAudioFile(e.target.files[0]);
                      }}
                    />

                    {audioFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            background: 'var(--accent)',
                            color: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}
                        >
                          MP3
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>{audioFile.name}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                            {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                            {audioDuration > 0 && ` • ${Math.floor(audioDuration / 60)}:${(audioDuration % 60).toString().padStart(2, '0')}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎧</div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                          Click or drag &amp; drop your audio track here
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                          Supports MP3, WAV, M4A up to 25MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cover Art Drag & Drop Zone */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cover Artwork (Optional)
                  </label>

                  <div
                    onClick={() => coverInputRef.current?.click()}
                    onDragOver={(e: DragEvent) => e.preventDefault()}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        processCoverFile(e.dataTransfer.files[0]);
                      }
                    }}
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: '14px',
                      padding: '20px',
                      cursor: 'pointer',
                      background: 'var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*,.jpg,.jpeg,.png,.svg,.webp,.gif,.avif,.bmp,.ico"
                      style={{ display: 'none' }}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        if (e.target.files?.[0]) processCoverFile(e.target.files[0]);
                      }}
                    />

                    {coverPreview ? (
                      <div style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
                        <Image src={coverPreview} alt="Cover Preview" fill style={{ objectFit: 'cover' }} unoptimized />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '10px',
                          background: 'var(--surface-3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px',
                          flexShrink: 0,
                        }}
                      >
                        🖼️
                      </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>
                        {coverFile ? coverFile.name : 'Select or drop album artwork'}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                        Supports JPEG, PNG, SVG, WebP, GIF, AVIF & other formats
                      </p>
                    </div>
                  </div>
                </div>

                {/* Track Metadata Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                      Track Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Earth Tones"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        color: 'var(--text-1)',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                      Artist Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lenzman"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        color: 'var(--text-1)',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '6px' }}>
                    Album (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A Little While Longer"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      color: 'var(--text-1)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Progress / Status banner during upload */}
                {status !== 'idle' && status !== 'error' && (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid var(--accent)',
                        borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-1)', fontWeight: 500 }}>
                      {statusMessage}
                    </span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={status !== 'idle' && status !== 'error'}
                  style={{
                    marginTop: '8px',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    border: 'none',
                    cursor: (status !== 'idle' && status !== 'error') ? 'not-allowed' : 'pointer',
                    opacity: (status !== 'idle' && status !== 'error') ? 0.6 : 1,
                    transition: 'all var(--t-fast)',
                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.25)',
                  }}
                >
                  {status === 'idle' || status === 'error' ? 'Add to Library' : 'Processing Upload...'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <RightPanel />
      <MiniPlayer />
      <BottomNav />
    </>
  );
}
