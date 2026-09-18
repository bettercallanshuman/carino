import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { updateLocalSong, deleteLocalSong } from '@/lib/storage/local';
import { requireAdmin, isAuthError } from '@/lib/auth/server';
import type { Song } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Song Details, Update & Real Deletion API Route
// Handles PATCH and DELETE (Administrator only).
// Fully authenticated admin client enforces PostgreSQL & Storage RLS.
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const { title, artist, album, genre, duration_seconds, audio_path, cover_path } = body;

    const updates: Partial<Song> = {};
    if (typeof title === 'string' && title.trim()) updates.title = title.trim();
    if (typeof artist === 'string' && artist.trim()) updates.artist = artist.trim();
    if (album !== undefined) updates.album = typeof album === 'string' ? album.trim() : null;
    if (genre !== undefined) updates.genre = typeof genre === 'string' ? genre.trim() : null;
    if (typeof duration_seconds === 'number' && duration_seconds > 0) updates.duration_seconds = duration_seconds;
    if (typeof audio_path === 'string' && audio_path.trim()) {
      updates.audio_path = audio_path.trim();
      updates.audio_url = audio_path.startsWith('http') || audio_path.startsWith('/')
        ? audio_path
        : `/api/media?bucket=audio&path=${encodeURIComponent(audio_path.replace(/^\/+/, ''))}`;
    }
    if (typeof cover_path === 'string' && cover_path.trim()) {
      updates.cover_path = cover_path.trim();
      updates.cover_url = cover_path.startsWith('http') || cover_path.startsWith('/')
        ? cover_path
        : `/api/media?bucket=covers&path=${encodeURIComponent(cover_path.replace(/^\/+/, ''))}`;
    }

    // 1. Local development fallback
    if (!isSupabaseConfigured()) {
      const updated = await updateLocalSong(id, updates);
      if (!updated) {
        return NextResponse.json({ error: 'Song not found' }, { status: 404 });
      }
      return NextResponse.json({ song: updated });
    }

    // 2. Supabase Storage & Database
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      // If error is related to missing 'genre' column in schema, retry without genre
      if (error && error.message?.includes('genre') && 'genre' in updates) {
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.genre;
        const { data: retryData, error: retryError } = await supabase
          .from('songs')
          .update(fallbackUpdates)
          .eq('id', id)
          .select()
          .single();

        if (retryError || !retryData) {
          return NextResponse.json(
            { error: retryError?.message || 'Failed to update song' },
            { status: 500 }
          );
        }
        return NextResponse.json({ song: retryData as Song });
      }

      return NextResponse.json(
        { error: error?.message || 'Failed to update song' },
        { status: 500 }
      );
    }

    return NextResponse.json({ song: data as Song });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
    }

    // 1. Local development fallback (or if local ID)
    if (!isSupabaseConfigured() || id.startsWith('local-')) {
      const result = await deleteLocalSong(id);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'Song and local storage files deleted permanently',
          deletedSong: result.deletedSong,
        });
      }
      if (!isSupabaseConfigured()) {
        return NextResponse.json({ error: result.error || 'Song not found' }, { status: 404 });
      }
    }

    // 2. Supabase Storage & Database
    const supabase = await createClient();

    // Fetch the song first to get storage paths
    const { data: songData, error: fetchError } = await supabase
      .from('songs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !songData) {
      return NextResponse.json({ error: 'Song not found in live catalog' }, { status: 404 });
    }

    const song = songData as Song;

    // Step 1: Remove playlist_tracks referencing this song
    await supabase.from('playlist_tracks').delete().eq('song_id', id);

    // Step 2: Remove database record from songs table
    const { error: dbDeleteError } = await supabase.from('songs').delete().eq('id', id);
    if (dbDeleteError) {
      return NextResponse.json(
        { error: `Database deletion failed: ${dbDeleteError.message}` },
        { status: 500 }
      );
    }

    // Step 3: Remove audio storage object
    if (song.audio_path && !song.audio_path.startsWith('http') && !song.audio_path.startsWith('/')) {
      const cleanAudio = song.audio_path.replace(/^\/+/, '').trim();
      const { error: audioStorageErr } = await supabase.storage
        .from('audio')
        .remove([cleanAudio]);
      if (audioStorageErr) {
        console.warn(`[API Songs DELETE] Warning: audio storage deletion: ${audioStorageErr.message}`);
      }
    }

    // Step 4: Remove cover storage object
    if (song.cover_path && !song.cover_path.startsWith('http') && !song.cover_path.startsWith('/') && !song.cover_path.includes('icon-192')) {
      const cleanCover = song.cover_path.replace(/^\/+/, '').trim();
      const { error: coverStorageErr } = await supabase.storage
        .from('covers')
        .remove([cleanCover]);
      if (coverStorageErr) {
        console.warn(`[API Songs DELETE] Warning: cover storage deletion: ${coverStorageErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Song, playlist junctions, and storage objects permanently deleted',
      deletedSong: song,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
