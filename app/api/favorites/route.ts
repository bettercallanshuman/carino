import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import { getLocalFavorites, saveLocalFavorites, toggleLocalFavorite } from '@/lib/storage/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Favourite Tracks API
// Persists and synchronizes favourite tracks scoped strictly to the authenticated user ID.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const songIds = await getLocalFavorites(authRes.id);
    return NextResponse.json({ songIds });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve favorites' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const body = await req.json().catch(() => ({}));
    const songId = body?.songId;

    if (!songId || typeof songId !== 'string') {
      return NextResponse.json({ error: 'Valid songId is required' }, { status: 400 });
    }

    const { songIds, isFavorited } = await toggleLocalFavorite(authRes.id, songId.trim());
    return NextResponse.json({ success: true, songIds, isFavorited });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update favorites' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    let songId = req.nextUrl.searchParams.get('songId');
    if (!songId) {
      const body = await req.json().catch(() => ({}));
      songId = body?.songId;
    }

    if (!songId || typeof songId !== 'string') {
      return NextResponse.json({ error: 'Valid songId is required' }, { status: 400 });
    }

    const current = await getLocalFavorites(authRes.id);
    const updated = current.filter((id) => id !== songId.trim());
    await saveLocalFavorites(authRes.id, updated);

    return NextResponse.json({ success: true, songIds: updated, isFavorited: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
