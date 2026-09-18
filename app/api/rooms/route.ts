import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import {
  getLocalRooms,
  saveLocalRoom,
  findLocalRoomByCode,
  findLocalRoomById,
  getLocalRoomMembers,
  addLocalRoomMember,
  getLocalRoomState,
  updateLocalRoomState,
} from '@/lib/storage/local';
import type { Room, RoomMember, RoomState } from '@/types';

export const runtime = 'nodejs';

// Generate clean 6-character room code (e.g. "CR7N2K")
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous 0, O, 1, I
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    code += chars[randomIndex];
  }
  return code;
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

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Rooms API Route
// GET: Lookup room by ?code=XXXXXX or ?id=UUID (Authenticated)
// POST: Create a new room with 6-character code, initialize host & room state (Authenticated)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const id = searchParams.get('id');

    if (!code && !id) {
      if (!isSupabaseConfigured()) {
        const rooms = await getLocalRooms();
        return NextResponse.json(rooms);
      }
      const supabase = getServiceRoleClient();
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data || []);
    }

    if (!isSupabaseConfigured()) {
      let room: Room | null = null;
      if (code) {
        room = await findLocalRoomByCode(code);
      } else if (id) {
        room = await findLocalRoomById(id);
      }

      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const members = await getLocalRoomMembers(room.id);
      const state = await getLocalRoomState(room.id);

      return NextResponse.json({
        room,
        members,
        room_state: state,
      });
    }

    const supabase = getServiceRoleClient();
    let query = supabase.from('rooms').select('*');
    if (code) {
      query = query.ilike('room_code', code.trim());
    } else if (id) {
      query = query.eq('id', id);
    }

    const { data: roomData, error: roomError } = await query.maybeSingle();
    if (roomError || !roomData) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const room = roomData as Room;

    // Fetch members and state
    const [membersRes, stateRes] = await Promise.all([
      supabase.from('room_members').select('*').eq('room_id', room.id),
      supabase.from('room_state').select('*').eq('room_id', room.id).maybeSingle(),
    ]);

    const enrichedMembers = await enrichMembersWithProfiles(supabase, membersRes.data || []);

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

export async function POST(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const authUser = authRes;
    const body = await req.json().catch(() => ({}));
    const { playlistId } = body;

    const actualHostId = authUser.id;
    const actualDisplayName = authUser.display_name;

    const roomCode = generateRoomCode();
    const roomId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (!isSupabaseConfigured()) {
      const newRoom: Room = {
        id: roomId,
        room_code: roomCode,
        host_user_id: actualHostId,
        playlist_id: playlistId || null,
        created_at: now,
        expires_at: null,
      };

      const hostMember: RoomMember = {
        room_id: roomId,
        user_id: actualHostId,
        display_name: actualDisplayName,
        avatar_url: authUser.avatar_url || null,
        joined_at: now,
      };

      const initialRoomState: RoomState = {
        room_id: roomId,
        current_song_id: null,
        queue_index: 0,
        is_playing: false,
        position_ms: 0,
        state_version: 1,
        updated_at: now,
      };

      await saveLocalRoom(newRoom);
      await addLocalRoomMember(hostMember);
      await updateLocalRoomState(roomId, initialRoomState);

      return NextResponse.json(
        {
          room: newRoom,
          members: [hostMember],
          room_state: initialRoomState,
        },
        { status: 201 }
      );
    }

    const supabase = getServiceRoleClient();

    // 1. Insert room
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert([
        {
          id: roomId,
          room_code: roomCode,
          host_user_id: actualHostId,
          playlist_id: playlistId || null,
        },
      ])
      .select()
      .single();

    if (roomError || !roomData) {
      return NextResponse.json(
        { error: roomError?.message || 'Failed to create room' },
        { status: 500 }
      );
    }

    const room = roomData as Room;

    // 2. Insert host as member
    const { data: memberData } = await supabase
      .from('room_members')
      .insert([
        {
          room_id: room.id,
          user_id: actualHostId,
          display_name: actualDisplayName,
        },
      ])
      .select()
      .single();

    // 3. Initialize room state
    const { data: stateData } = await supabase
      .from('room_state')
      .insert([
        {
          room_id: room.id,
          current_song_id: null,
          queue_index: 0,
          is_playing: false,
          position_ms: 0,
          state_version: 1,
        },
      ])
      .select()
      .single();

    const enrichedMembers = await enrichMembersWithProfiles(supabase, memberData ? [memberData as RoomMember] : []);

    return NextResponse.json(
      {
        room,
        members: enrichedMembers,
        room_state: (stateData as RoomState) || null,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create room' },
      { status: 500 }
    );
  }
}
