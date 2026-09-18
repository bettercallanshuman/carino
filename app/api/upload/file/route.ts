import { NextRequest, NextResponse } from 'next/server';
import { saveLocalFile } from '@/lib/storage/local';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, isAuthError } from '@/lib/auth/server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Admin File Upload Route
// Directly uploads files into private Supabase Storage ('audio' or 'covers')
// using authenticated administrator credentials.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const formData = await req.formData();
    const bucket = formData.get('bucket') as string;
    const file = formData.get('file') as File | null;

    if (bucket !== 'audio' && bucket !== 'covers') {
      return NextResponse.json(
        { error: 'Invalid bucket. Only "audio" and "covers" are permitted.' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `${bucket}_${Date.now()}_${cleanName}`;

    if (!isSupabaseConfigured()) {
      const localKey = await saveLocalFile(bucket, file.name, buffer);
      return NextResponse.json({
        path: localKey,
        url: `/api/media?bucket=${bucket}&path=${encodeURIComponent(localKey)}`,
      });
    }

    // Direct authenticated upload into Supabase Storage
    const supabase = await createClient();
    const contentType = file.type || (bucket === 'covers' ? 'image/jpeg' : 'audio/mpeg');

    const { error } = await supabase.storage.from(bucket).upload(storageKey, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      path: storageKey,
      url: `/api/media?bucket=${bucket}&path=${encodeURIComponent(storageKey)}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'File upload failed' },
      { status: 500 }
    );
  }
}
