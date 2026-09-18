import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { getLocalPlaylists, saveLocalPlaylist, getLocalPlaylistTracks } from '@/lib/storage/local';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import type { Playlist } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Playlists API Route
// Handles GET and POST for Authenticated users.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    if (!isSupabaseConfigured()) {
      const playlists = await getLocalPlaylists();
      // Enrich with track count
      const enriched = await Promise.all(
        playlists.map(async (p) => {
          const tracks = await getLocalPlaylistTracks(p.id);
          return {
            ...p,
            track_count: tracks.length,
          };
        })
      );
      return NextResponse.json(enriched);
    }

    const supabase = getServiceRoleClient();
    const { data: playlists, error } = await supabase
      .from('playlists')
      .select('*, playlist_tracks(count)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    interface SupabasePlaylistRow {
      id: string;
      name: string;
      description: string | null;
      cover_path: string | null;
      created_at: string;
      playlist_tracks?: { count: number }[];
    }

    const formatted = ((playlists || []) as unknown as SupabasePlaylistRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cover_path: p.cover_path,
      created_at: p.created_at,
      track_count: p.playlist_tracks?.[0]?.count ?? 0,
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const body = await req.json();
    const { name, description, cover_path } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    const cleanName = name.trim();
    const cleanDesc = description ? String(description).trim() : null;
    const cleanCover = cover_path ? String(cover_path).trim() : null;

    if (!isSupabaseConfigured()) {
      const newPlaylist: Playlist = {
        id: `playlist-${Date.now()}`,
        name: cleanName,
        description: cleanDesc,
        cover_path: cleanCover,
        created_at: new Date().toISOString(),
      };
      await saveLocalPlaylist(newPlaylist);
      return NextResponse.json({ playlist: { ...newPlaylist, track_count: 0 } });
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from('playlists')
      .insert([
        {
          name: cleanName,
          description: cleanDesc,
          cover_path: cleanCover,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to create playlist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ playlist: { ...data, track_count: 0 } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
