import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import {
  getLocalPlaylistTracks,
  addLocalPlaylistTrack,
  removeLocalPlaylistTrack,
  reorderLocalPlaylistTracks,
  getLocalSongs,
} from '@/lib/storage/local';
import type { Song } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Playlist Tracks Management API Route
// Handles GET, POST (add), DELETE (remove), and PUT (reorder).
// Authenticated users only.
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id: playlistId } = await context.params;
    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      const tracks = await getLocalPlaylistTracks(playlistId);
      const allSongs = await getLocalSongs();

      const orderedSongs: Song[] = [];
      for (const track of tracks) {
        const song = allSongs.find((s) => s.id === track.song_id);
        if (song) {
          orderedSongs.push({
            ...song,
            cover_url:
              song.cover_url ||
              (song.cover_path?.startsWith('http') || song.cover_path?.startsWith('/')
                ? song.cover_path
                : `/api/media?bucket=covers&path=${encodeURIComponent(song.cover_path?.replace(/^\/+/, '') || '')}`),
            audio_url:
              song.audio_url ||
              (song.audio_path?.startsWith('http') || song.audio_path?.startsWith('/')
                ? song.audio_path
                : `/api/media?bucket=audio&path=${encodeURIComponent(song.audio_path?.replace(/^\/+/, '') || '')}`),
          });
        }
      }
      return NextResponse.json(orderedSongs);
    }

    const supabase = getServiceRoleClient();
    const { data: tracks, error } = await supabase
      .from('playlist_tracks')
      .select('position, songs (*)')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    interface PlaylistTrackJoin {
      position: number;
      songs: Song | null;
    }

    const songs = ((tracks || []) as unknown as PlaylistTrackJoin[])
      .map((t) => t.songs)
      .filter((s): s is Song => Boolean(s))
      .map((s: Song) => {
        const cleanCover = (s.cover_path || '').replace(/^\/+/, '');
        const cleanAudio = (s.audio_path || '').replace(/^\/+/, '');
        return {
          ...s,
          cover_url:
            s.cover_path?.startsWith('http') || s.cover_path?.startsWith('/')
              ? s.cover_path
              : cleanCover
              ? `/api/media?bucket=covers&path=${encodeURIComponent(cleanCover)}`
              : '/icons/icon-192.png',
          audio_url:
            s.audio_path?.startsWith('http') || s.audio_path?.startsWith('/')
              ? s.audio_path
              : cleanAudio
              ? `/api/media?bucket=audio&path=${encodeURIComponent(cleanAudio)}`
              : '',
        };
      });

    return NextResponse.json(songs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch playlist tracks' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id: playlistId } = await context.params;
    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const { song_id } = body;

    if (!song_id) {
      return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      const track = await addLocalPlaylistTrack(playlistId, song_id);
      return NextResponse.json({ track });
    }

    const supabase = getServiceRoleClient();

    // Check duplicate
    const { data: existing } = await supabase
      .from('playlist_tracks')
      .select('*')
      .eq('playlist_id', playlistId)
      .eq('song_id', song_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ track: existing, duplicate: true });
    }

    // Determine max position
    const { data: currentTracks } = await supabase
      .from('playlist_tracks')
      .select('position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = (currentTracks?.[0]?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from('playlist_tracks')
      .insert([
        {
          playlist_id: playlistId,
          song_id,
          position: nextPosition,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ track: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add track to playlist' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id: playlistId } = await context.params;
    const { searchParams } = new URL(req.url);
    let songId = searchParams.get('song_id');

    if (!songId) {
      const body = await req.json().catch(() => ({}));
      songId = body.song_id;
    }

    if (!playlistId || !songId) {
      return NextResponse.json({ error: 'Playlist ID and Song ID are required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      await removeLocalPlaylistTrack(playlistId, songId);
      return NextResponse.json({ success: true, removedSongId: songId });
    }

    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from('playlist_tracks')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('song_id', songId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, removedSongId: songId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove track from playlist' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id: playlistId } = await context.params;
    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const { song_ids } = body;

    if (!Array.isArray(song_ids)) {
      return NextResponse.json({ error: 'song_ids must be an array of song IDs' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      const reordered = await reorderLocalPlaylistTracks(playlistId, song_ids);
      return NextResponse.json({ success: true, tracks: reordered });
    }

    const supabase = getServiceRoleClient();

    // Upsert each song with its new position
    const updates = song_ids.map((songId: string, index: number) => ({
      playlist_id: playlistId,
      song_id: songId,
      position: index,
    }));

    const { data, error } = await supabase
      .from('playlist_tracks')
      .upsert(updates, { onConflict: 'playlist_id,song_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tracks: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder playlist' },
      { status: 500 }
    );
  }
}
