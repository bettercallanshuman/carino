import { NextRequest, NextResponse } from 'next/server';
import { updateLocalRoomState } from '@/lib/storage/local';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { getAuthenticatedUser, requireAuth, isAuthError } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Server-Sent Events (SSE) Realtime Bridge for Rooms
// Provides zero-latency real-time event streaming for Authenticated room participants.
// ─────────────────────────────────────────────────────────────────────────────

type SubscriberCallback = (data: string) => void;

// In-memory registry of active subscribers per room
const roomSubscribers = new Map<string, Set<SubscriberCallback>>();

function getSubscribers(roomId: string): Set<SubscriberCallback> {
  let subs = roomSubscribers.get(roomId);
  if (!subs) {
    subs = new Set();
    roomSubscribers.set(roomId, subs);
  }
  return subs;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const subs = getSubscribers(id);

  let subscriberFn: SubscriberCallback | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      subscriberFn = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      };

      subs.add(subscriberFn);

      // Send initial connected handshake
      const handshake = JSON.stringify({
        type: 'CONNECTED',
        roomId: id,
        timestamp: Date.now(),
      });
      controller.enqueue(encoder.encode(`data: ${handshake}\n\n`));

      // Keepalive ping every 15s
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 15000);
    },
    cancel() {
      if (subscriberFn) subs.delete(subscriberFn);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
    }

    const subs = getSubscribers(id);
    const dataString = JSON.stringify(body);

    // Broadcast event to all active SSE subscribers for this room
    subs.forEach((send) => {
      try {
        send(dataString);
      } catch (err) {
        console.warn('[RoomSSE] Failed to dispatch event to subscriber:', err);
      }
    });

    // Asynchronously update server state if it includes playback state
    if (
      body.type === 'PLAY' ||
      body.type === 'PAUSE' ||
      body.type === 'SEEK' ||
      body.type === 'TRACK_CHANGE'
    ) {
      const updates: Record<string, unknown> = {};
      if (body.positionMs !== undefined) updates.position_ms = body.positionMs;
      if (body.isPlaying !== undefined) updates.is_playing = body.isPlaying;
      if (body.track?.id) updates.current_song_id = body.track.id;
      if (body.queueIndex !== undefined) updates.queue_index = body.queueIndex;

      if (!isSupabaseConfigured()) {
        await updateLocalRoomState(id, updates).catch(() => {});
      } else {
        const supabase = getServiceRoleClient();
        try {
          await supabase
            .from('room_state')
            .upsert({ room_id: id, ...updates, updated_at: new Date().toISOString() });
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({
      success: true,
      deliveredTo: subs.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to broadcast event' },
      { status: 500 }
    );
  }
}
