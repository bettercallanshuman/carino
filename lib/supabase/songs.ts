import { createClient } from './client';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Song Data Access Layer (Client & Component Safe)
// Communicates via API routes (/api/songs) so server secrets are never bundled.
// Live music catalog is strictly sourced from Supabase.
// Zero demo songs / zero fake music policy.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if Supabase credentials are configured.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
    !url.includes('your-project.supabase.co') &&
    key &&
    !key.includes('your-anon-key-here') &&
    key !== 'sb_publishable_...'
  );
}

/**
 * Retrieves all live songs from the canonical Supabase catalog.
 * - Returns an empty array if the catalog has no songs. Never fabricates demo music.
 */
export async function getSongs(): Promise<Song[]> {
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/songs`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Retrieves a single song by ID from Supabase. Returns null if not found.
 */
export async function getSongById(id: string): Promise<Song | null> {
  if (!isSupabaseConfigured() || !id) {
    return null;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const song = data as Song;
    const cleanCover = (song.cover_path || '').trim().replace(/^\/+/, '');
    song.cover_url =
      song.cover_path && (song.cover_path.startsWith('http') || song.cover_path.startsWith('/'))
        ? song.cover_path
        : cleanCover
        ? `/api/media?bucket=covers&path=${encodeURIComponent(cleanCover)}`
        : '/icons/icon-192.png';

    const cleanAudio = (song.audio_path || '').trim().replace(/^\/+/, '');
    song.audio_url =
      song.audio_path && (song.audio_path.startsWith('http') || song.audio_path.startsWith('/'))
        ? song.audio_path
        : cleanAudio
        ? `/api/media?bucket=audio&path=${encodeURIComponent(cleanAudio)}`
        : '';

    return song;
  } catch {
    return null;
  }
}

/**
 * Inserts a new song into the database via server route to enforce RLS and avoid exposing service role.
 */
export async function createSong(songData: {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  duration_seconds: number;
  audio_path: string;
  cover_path: string;
}): Promise<{ song?: Song; error?: string }> {
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(songData),
    });

    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'Failed to save song' };
    }
    return { song: data.song };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error saving song' };
  }
}
