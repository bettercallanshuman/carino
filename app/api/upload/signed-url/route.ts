import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { requireAdmin, isAuthError } from '@/lib/auth/server';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Signed Upload URL Generator (Server Route)
// Securely mints a one-time signed upload token for Admin media operations.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const body = await req.json();
    const { bucket, filename, contentType } = body;

    // Validate bucket
    if (bucket !== 'audio' && bucket !== 'covers') {
      return NextResponse.json(
        { error: 'Invalid bucket. Only "audio" and "covers" are permitted.' },
        { status: 400 }
      );
    }

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required.' },
        { status: 400 }
      );
    }

    // In local development without Supabase configured:
    if (!isSupabaseConfigured()) {
      const mockPath = `${bucket}_local_${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      return NextResponse.json({
        mock: true,
        path: mockPath,
        token: 'local-dev-token',
        signedUrl: '',
      });
    }

    const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${bucket}_${Date.now()}_${cleanName}`;

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to generate signed upload URL.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
