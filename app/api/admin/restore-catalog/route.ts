import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, isAuthError } from '@/lib/auth/server';
import type { Song } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Idempotent Original Catalog Restoration API Route
// Strictly Admin-Only.
// Safely recovers the 4 original tracks from .storage/ into remote Supabase
// (PostgreSQL public.songs + private Supabase Storage 'audio' and 'covers').
// Zero data loss. Idempotent: safe to run multiple times without duplicating.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const storageJsonPath = path.join(process.cwd(), '.storage', 'songs.json');
    let localSongs: Song[] = [];
    try {
      const raw = await fs.readFile(storageJsonPath, 'utf8');
      localSongs = JSON.parse(raw);
    } catch (err) {
      return NextResponse.json(
        { error: `Could not read .storage/songs.json: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }

    if (!Array.isArray(localSongs) || localSongs.length === 0) {
      return NextResponse.json({ error: 'No songs found in local backup' }, { status: 404 });
    }

    const supabase = await createClient();

    // Fetch existing songs from Supabase to guarantee idempotency
    const { data: existingSongs } = await supabase
      .from('songs')
      .select('id, title, artist, audio_path, cover_path');

    const existingMap = new Map<string, { id: string; title: string; artist: string; audio_path: string; cover_path?: string }>();
    (existingSongs || []).forEach((s) => {
      const key = `${s.title.trim().toLowerCase()}:::${s.artist.trim().toLowerCase()}`;
      existingMap.set(key, s);
    });

    const results = [];

    for (const song of localSongs) {
      const matchKey = `${song.title.trim().toLowerCase()}:::${song.artist.trim().toLowerCase()}`;
      if (existingMap.has(matchKey)) {
        results.push({
          title: song.title,
          artist: song.artist,
          status: 'already_exists',
          song: existingMap.get(matchKey),
        });
        continue;
      }

      // 1. Upload audio file if needed
      const audioStorageKey = song.audio_path.trim().replace(/^\/+/, '');
      const localAudioFilePath = path.join(process.cwd(), '.storage', 'audio', audioStorageKey);
      try {
        const audioBuffer = await fs.readFile(localAudioFilePath);
        const { error: audioUploadErr } = await supabase.storage
          .from('audio')
          .upload(audioStorageKey, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (audioUploadErr && !audioUploadErr.message?.includes('already exists')) {
          console.warn(`[RestoreCatalog] Audio upload note for "${song.title}":`, audioUploadErr.message);
        }
      } catch (audioReadErr) {
        console.warn(`[RestoreCatalog] Could not read local audio file ${localAudioFilePath}:`, audioReadErr);
      }

      // 2. Upload cover file if needed
      const coverStorageKey = (song.cover_path || '').trim().replace(/^\/+/, '');
      if (coverStorageKey) {
        const localCoverFilePath = path.join(process.cwd(), '.storage', 'covers', coverStorageKey);
        try {
          const coverBuffer = await fs.readFile(localCoverFilePath);
          const ext = coverStorageKey.split('.').pop()?.toLowerCase();
          const contentType = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';

          const { error: coverUploadErr } = await supabase.storage
            .from('covers')
            .upload(coverStorageKey, coverBuffer, {
              contentType,
              upsert: true,
            });

          if (coverUploadErr && !coverUploadErr.message?.includes('already exists')) {
            console.warn(`[RestoreCatalog] Cover upload note for "${song.title}":`, coverUploadErr.message);
          }
        } catch (coverReadErr) {
          console.warn(`[RestoreCatalog] Could not read local cover file ${localCoverFilePath}:`, coverReadErr);
        }
      }

      // 3. Insert row into public.songs
      const songPayload: Record<string, unknown> = {
        title: song.title.trim(),
        artist: song.artist.trim(),
        album: song.album?.trim() || 'Carino',
        duration_seconds: song.duration_seconds || 180,
        audio_path: audioStorageKey,
        cover_path: coverStorageKey || 'covers_default.jpg',
      };
      if (song.genre) {
        songPayload.genre = song.genre;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('songs')
        .insert([songPayload])
        .select()
        .single();

      if (insertErr) {
        // If 'genre' column is missing, retry without it
        if (insertErr.message?.includes('genre')) {
          delete songPayload.genre;
          const { data: retryData, error: retryErr } = await supabase
            .from('songs')
            .insert([songPayload])
            .select()
            .single();

          if (retryErr) {
            results.push({
              title: song.title,
              artist: song.artist,
              status: 'insert_failed',
              error: retryErr.message,
            });
            continue;
          }
          results.push({
            title: song.title,
            artist: song.artist,
            status: 'restored',
            song: retryData,
          });
          continue;
        }

        results.push({
          title: song.title,
          artist: song.artist,
          status: 'insert_failed',
          error: insertErr.message,
        });
        continue;
      }

      results.push({
        title: song.title,
        artist: song.artist,
        status: 'restored',
        song: inserted,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Catalog recovery migration processed',
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Catalog restoration failed' },
      { status: 500 }
    );
  }
}
