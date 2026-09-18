import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { updateLocalPlaylist, deleteLocalPlaylist } from '@/lib/storage/local';
import { requireAuth, isAuthError } from '@/lib/auth/server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Playlist Specific API Route
// Handles PATCH (update/rename) and DELETE (remove playlist & cascade tracks).
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const { name, description } = body;

    const updates: { name?: string; description?: string | null } = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (description !== undefined) updates.description = description ? String(description).trim() : null;

    if (!isSupabaseConfigured()) {
      const updated = await updateLocalPlaylist(id, updates);
      if (!updated) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }
      return NextResponse.json({ playlist: updated });
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from('playlists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to update playlist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ playlist: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      await deleteLocalPlaylist(id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    const supabase = getServiceRoleClient();
    // 1. Delete playlist_tracks first
    await supabase.from('playlist_tracks').delete().eq('playlist_id', id);

    // 2. Delete playlist
    const { error } = await supabase.from('playlists').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
