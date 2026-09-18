import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import {
  findLocalRoomById,
  findLocalRoomByCode,
  getLocalRoomMembers,
  addLocalRoomMember,
  removeLocalRoomMember,
} from '@/lib/storage/local';
import type { RoomMember } from '@/types';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Room Members API Route
// GET: List active members in the room (Authenticated, enriched with profiles)
// POST: Join room as participant (Authenticated; uses caller's auth.uid())
// DELETE: Leave room (Caller can only leave as themselves unless host/admin)
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
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

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await params;

    if (!isSupabaseConfigured()) {
      let roomId = id;
      const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
      if (room) roomId = room.id;

      const members = await getLocalRoomMembers(roomId);
      return NextResponse.json(members);
    }

    const supabase = getServiceRoleClient();
    const { data: members, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', id)
      .order('joined_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enrichedMembers = await enrichMembersWithProfiles(supabase, members || []);
    return NextResponse.json(enrichedMembers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;
    const authUser = authRes;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { displayName } = body;

    // Guaranteed authoritative identity from authenticated session
    const cleanUserId = authUser.id;
    const cleanDisplayName = authUser.display_name || (displayName && typeof displayName === 'string' && displayName.trim()) || 'Listener';

    if (!isSupabaseConfigured()) {
      let roomId = id;
      const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
      if (room) roomId = room.id;

      const newMember: RoomMember = {
        room_id: roomId,
        user_id: cleanUserId,
        display_name: cleanDisplayName,
        avatar_url: authUser.avatar_url || null,
        joined_at: new Date().toISOString(),
      };

      const updatedMembers = await addLocalRoomMember(newMember);
      return NextResponse.json({ members: updatedMembers, member: newMember }, { status: 201 });
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from('room_members')
      .upsert(
        {
          room_id: id,
          user_id: cleanUserId,
          display_name: cleanDisplayName,
        },
        { onConflict: 'room_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: allMembers } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', id)
      .order('joined_at', { ascending: true });

    const enrichedMembers = await enrichMembersWithProfiles(supabase, allMembers || []);
    const enrichedCurrentMember = enrichedMembers.find((m) => m.user_id === cleanUserId) || (data as RoomMember);

    return NextResponse.json(
      { members: enrichedMembers, member: enrichedCurrentMember },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to join room' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;
    const authUser = authRes;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId') || authUser.id;

    // If attempting to remove another user, check host/admin permissions
    if (targetUserId !== authUser.id && !authUser.isAdmin) {
      if (!isSupabaseConfigured()) {
        const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
        if (room && room.host_user_id !== authUser.id) {
          return NextResponse.json(
            { error: 'Forbidden. You cannot remove other members from this room.' },
            { status: 403 }
          );
        }
      } else {
        const supabase = getServiceRoleClient();
        const { data: roomData } = await supabase
          .from('rooms')
          .select('host_user_id')
          .eq('id', id)
          .maybeSingle();
        if (roomData && roomData.host_user_id !== authUser.id) {
          return NextResponse.json(
            { error: 'Forbidden. You cannot remove other members from this room.' },
            { status: 403 }
          );
        }
      }
    }

    const cleanUserId = targetUserId.trim();

    if (!isSupabaseConfigured()) {
      let roomId = id;
      const room = (await findLocalRoomById(id)) || (await findLocalRoomByCode(id));
      if (room) roomId = room.id;

      const remaining = await removeLocalRoomMember(roomId, cleanUserId);
      return NextResponse.json({ success: true, members: remaining });
    }

    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', id)
      .eq('user_id', cleanUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: remaining } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', id);

    const enrichedRemaining = await enrichMembersWithProfiles(supabase, remaining || []);

    return NextResponse.json({
      success: true,
      members: enrichedRemaining,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to leave room' },
      { status: 500 }
    );
  }
}
