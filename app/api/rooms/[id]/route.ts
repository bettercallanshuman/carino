import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import {
  findLocalRoomById,
  deleteLocalRoom,
  getLocalRoomMembers,
  getLocalRoomState,
} from '@/lib/storage/local';
import type { Room, RoomMember, RoomState } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Single Room API Route
// GET: Returns room details, members, and state by ID (Authenticated)
// DELETE: Closes / removes room (Host or Admin only)
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
      const room = await findLocalRoomById(id);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      const members = await getLocalRoomMembers(room.id);
      const state = await getLocalRoomState(room.id);
      return NextResponse.json({ room, members, room_state: state });
    }

    const supabase = getServiceRoleClient();
    const { data: roomData, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !roomData) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const room = roomData as Room;

    const [membersRes, stateRes] = await Promise.all([
      supabase.from('room_members').select('*').eq('room_id', room.id),
      supabase.from('room_state').select('*').eq('room_id', room.id).maybeSingle(),
    ]);

    const enrichedMembers = await enrichMembersWithProfiles(supabase, (membersRes.data as RoomMember[]) || []);

    return NextResponse.json({
      room,
      members: enrichedMembers,
      room_state: (stateRes.data as RoomState) || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch room' },
      { status: 500 }
    );
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

async function enrichMembersWithProfiles(supabase: SupabaseClient, rawMembers: RoomMember[]): Promise<RoomMember[]> {
  if (!rawMembers || rawMembers.length === 0) return [];
  const userIds = Array.from(new Set(rawMembers.map((m) => m.user_id).filter(Boolean))) as string[];
  if (userIds.length === 0) return rawMembers;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, avatar_url')
    .in('id', userIds);

  const profileMap = new Map<string, { display_name?: string | null; full_name?: string | null; avatar_url?: string | null }>();
  if (profiles) {
    for (const p of profiles) {
      profileMap.set(p.id, p);
    }
  }

  return rawMembers.map((m) => {
    const prof = profileMap.get(m.user_id || '');
    const resolvedName = prof?.display_name || prof?.full_name || m.display_name || 'Listener';
    const rawAvatar = prof?.avatar_url || null;
    let resolvedAvatar = rawAvatar;
    if (rawAvatar && !rawAvatar.startsWith('http://') && !rawAvatar.startsWith('https://') && !rawAvatar.startsWith('/')) {
      resolvedAvatar = `/api/media?bucket=covers&path=${encodeURIComponent(rawAvatar.replace(/^\/+/, ''))}`;
    }
    return {
      ...m,
      display_name: resolvedName,
      avatar_url: resolvedAvatar,
    };
  });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;
    const authUser = authRes;

    const { id } = await params;

    if (!isSupabaseConfigured()) {
      const room = await findLocalRoomById(id);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.host_user_id !== authUser.id && !authUser.isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden. Only room host or admin can delete this room.' },
          { status: 403 }
        );
      }

      const success = await deleteLocalRoom(id);
      if (!success) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Room deleted' });
    }

    const supabase = getServiceRoleClient();
    const { data: roomData, error: fetchErr } = await supabase
      .from('rooms')
      .select('host_user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !roomData) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (roomData.host_user_id !== authUser.id && !authUser.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden. Only room host or admin can delete this room.' },
        { status: 403 }
      );
    }

    const { error } = await supabase.from('rooms').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete room' },
      { status: 500 }
    );
  }
}
