import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { getLocalSongs, saveLocalSong } from '@/lib/storage/local';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/server';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Songs API Route
// Handles server-side song catalog queries with pre-signed URLs (Authenticated),
// and strictly restricted song insertions (Administrator only).
// Supabase is the single source of truth for the live catalog.
// Zero demo songs / zero fake music.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    if (!isSupabaseConfigured()) {
      const localSongs = await getLocalSongs();
      return NextResponse.json(localSongs);
    }

    const supabase = await createClient();
    const { data: songsData, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !songsData) {
      return NextResponse.json([]);
    }

    const songs = songsData as Song[];
    const expiresIn = 86400; // 24 hours pre-signed URLs

    // Batch generate signed URLs for private covers and audio
    const coverPaths = songs
      .map((s) => s.cover_path?.trim())
      .filter((p): p is string => Boolean(p && !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('/')));

    const audioPaths = songs
      .map((s) => s.audio_path?.trim())
      .filter((p): p is string => Boolean(p && !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('/')));

    const coverMap = new Map<string, string>();
    const audioMap = new Map<string, string>();

    if (coverPaths.length > 0) {
      const cleanCoverPaths = Array.from(new Set(coverPaths.map((p) => p.replace(/^\/+/, ''))));
      const { data: signedCovers } = await supabase.storage
        .from('covers')
        .createSignedUrls(cleanCoverPaths, expiresIn);

      signedCovers?.forEach((item) => {
        if (item.signedUrl && item.path) coverMap.set(item.path, item.signedUrl);
      });
    }

    if (audioPaths.length > 0) {
      const cleanAudioPaths = Array.from(new Set(audioPaths.map((p) => p.replace(/^\/+/, ''))));
      const { data: signedAudio } = await supabase.storage
        .from('audio')
        .createSignedUrls(cleanAudioPaths, expiresIn);

      signedAudio?.forEach((item) => {
        if (item.signedUrl && item.path) audioMap.set(item.path, item.signedUrl);
      });
    }

    const enrichedSongs: Song[] = songs.map((s) => {
      const rawCover = s.cover_path?.trim() || '';
      const cleanCover = rawCover.replace(/^\/+/, '');
      let resolvedCover = coverMap.get(cleanCover);

      if (!resolvedCover) {
        if (rawCover.startsWith('http://') || rawCover.startsWith('https://') || rawCover.startsWith('/')) {
          resolvedCover = rawCover;
        } else if (cleanCover) {
          resolvedCover = `/api/media?bucket=covers&path=${encodeURIComponent(cleanCover)}`;
        } else {
          resolvedCover = '/icons/icon-192.png';
        }
      }

      const rawAudio = s.audio_path?.trim() || '';
      const cleanAudio = rawAudio.replace(/^\/+/, '');
      let resolvedAudio = audioMap.get(cleanAudio);

      if (!resolvedAudio) {
        if (rawAudio.startsWith('http://') || rawAudio.startsWith('https://') || rawAudio.startsWith('/')) {
          resolvedAudio = rawAudio;
        } else if (cleanAudio) {
          resolvedAudio = `/api/media?bucket=audio&path=${encodeURIComponent(cleanAudio)}`;
        } else {
          resolvedAudio = '';
        }
      }

      return {
        ...s,
        cover_url: resolvedCover,
        audio_url: resolvedAudio,
      };
    });

    return NextResponse.json(enrichedSongs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch songs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const body = await req.json();
    const { title, artist, album, genre, duration_seconds, audio_path, cover_path } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!artist || typeof artist !== 'string' || !artist.trim()) {
      return NextResponse.json({ error: 'Artist is required' }, { status: 400 });
    }
    if (!audio_path || typeof audio_path !== 'string') {
      return NextResponse.json({ error: 'Audio path is required' }, { status: 400 });
    }

    const cleanCoverPath = (cover_path || '').trim();
    const cleanAudioPath = audio_path.trim();

    // In local development without Supabase configured:
    if (!isSupabaseConfigured()) {
      const resolvedCoverUrl =
        cleanCoverPath.startsWith('http://') ||
        cleanCoverPath.startsWith('https://') ||
        cleanCoverPath.startsWith('blob:') ||
        cleanCoverPath.startsWith('data:') ||
        cleanCoverPath.startsWith('/')
          ? cleanCoverPath
          : cleanCoverPath
          ? `/api/media?bucket=covers&path=${encodeURIComponent(cleanCoverPath.replace(/^\/+/, ''))}`
          : '/icons/icon-192.png';

      const resolvedAudioUrl =
        cleanAudioPath.startsWith('http://') ||
        cleanAudioPath.startsWith('https://') ||
        cleanAudioPath.startsWith('blob:') ||
        cleanAudioPath.startsWith('/')
          ? cleanAudioPath
          : cleanAudioPath
          ? `/api/media?bucket=audio&path=${encodeURIComponent(cleanAudioPath.replace(/^\/+/, ''))}`
          : '';

      const mockSong: Song = {
        id: `local-${Date.now()}`,
        title: title.trim(),
        artist: artist.trim(),
        album: album?.trim() || null,
        genre: genre?.trim() || 'General',
        duration_seconds: duration_seconds || 180,
        audio_path: cleanAudioPath,
        cover_path: cleanCoverPath,
        created_at: new Date().toISOString(),
        audio_url: resolvedAudioUrl,
        cover_url: resolvedCoverUrl,
      };
      await saveLocalSong(mockSong);
      return NextResponse.json({ song: mockSong });
    }

    const supabase = await createClient();
    
    // Prepare song payload
    const songPayload: Record<string, unknown> = {
      title: title.trim(),
      artist: artist.trim(),
      album: album?.trim() || null,
      duration_seconds: duration_seconds || 180,
      audio_path: cleanAudioPath,
      cover_path: cleanCoverPath,
    };
    if (genre && typeof genre === 'string') {
      songPayload.genre = genre.trim();
    }

    const { data, error } = await supabase
      .from('songs')
      .insert([songPayload])
      .select()
      .single();

    if (error || !data) {
      // If error is related to missing 'genre' column in schema, retry without genre
      if (error && error.message?.includes('genre')) {
        delete songPayload.genre;
        const { data: retryData, error: retryError } = await supabase
          .from('songs')
          .insert([songPayload])
          .select()
          .single();

        if (retryError || !retryData) {
          return NextResponse.json(
            { error: retryError?.message || 'Database insert failed' },
            { status: 500 }
          );
        }
        return NextResponse.json({ song: retryData as Song });
      }

      return NextResponse.json(
        { error: error?.message || 'Database insert failed' },
        { status: 500 }
      );
    }

    const createdSong = data as Song;
    createdSong.audio_url = cleanAudioPath.startsWith('http') || cleanAudioPath.startsWith('/')
      ? cleanAudioPath
      : `/api/media?bucket=audio&path=${encodeURIComponent(cleanAudioPath.replace(/^\/+/, ''))}`;
    createdSong.cover_url = cleanCoverPath.startsWith('http') || cleanCoverPath.startsWith('/')
      ? cleanCoverPath
      : cleanCoverPath
      ? `/api/media?bucket=covers&path=${encodeURIComponent(cleanCoverPath.replace(/^\/+/, ''))}`
      : '/icons/icon-192.png';

    return NextResponse.json({ song: createdSong });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
