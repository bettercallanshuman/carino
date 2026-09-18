import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import {
  findLocalRoomById,
  findLocalRoomByCode,
  getLocalRoomState,
  updateLocalRoomState,
} from '@/lib/storage/local';
import type { RoomState } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Room State API Route (Synchronized Playback Engine)
// GET: Current playback state of the room (Authenticated)
// PATCH: Updates song, position_ms, is_playing, queue_index (Authenticated)
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await params;

    if (!isSupabaseConfigured()) {
      let roomId = id;
      const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
      if (room) roomId = room.id;

      const state = await getLocalRoomState(roomId);
      if (!state) {
        return NextResponse.json({ error: 'Room state not found' }, { status: 404 });
      }
      return NextResponse.json(state);
    }

    const supabase = getServiceRoleClient();
    const { data: state, error } = await supabase
      .from('room_state')
      .select('*')
      .eq('room_id', id)
      .maybeSingle();

    if (error || !state) {
      return NextResponse.json({ error: 'Room state not found' }, { status: 404 });
    }

    return NextResponse.json(state as RoomState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch room state' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { current_song_id, queue_index, is_playing, position_ms } = body;

    if (!isSupabaseConfigured()) {
      let roomId = id;
      const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
      if (room) roomId = room.id;

      const updates: Partial<RoomState> = {};
      if (current_song_id !== undefined) updates.current_song_id = current_song_id;
      if (queue_index !== undefined) updates.queue_index = queue_index;
      if (is_playing !== undefined) updates.is_playing = Boolean(is_playing);
      if (position_ms !== undefined) updates.position_ms = Math.round(Number(position_ms));

      const updated = await updateLocalRoomState(roomId, updates);
      return NextResponse.json(updated);
    }

    const supabase = getServiceRoleClient();

    // Fetch existing state version
    const { data: current } = await supabase
      .from('room_state')
      .select('state_version')
      .eq('room_id', id)
      .maybeSingle();

    const nextVersion = (current?.state_version || 0) + 1;

    const payload: Record<string, unknown> = {
      state_version: nextVersion,
      updated_at: new Date().toISOString(),
    };

    if (current_song_id !== undefined) payload.current_song_id = current_song_id;
    if (queue_index !== undefined) payload.queue_index = queue_index;
    if (is_playing !== undefined) payload.is_playing = Boolean(is_playing);
    if (position_ms !== undefined) payload.position_ms = Math.round(Number(position_ms));

    const { data, error } = await supabase
      .from('room_state')
      .upsert({ room_id: id, ...payload })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as RoomState);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update room state' },
      { status: 500 }
    );
  }
}
