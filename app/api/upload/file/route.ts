import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { saveLocalFile } from '@/lib/storage/local';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { createClient, getServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/server';
import { requireAdmin, isAuthError } from '@/lib/auth/server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Admin File Upload Route
// Directly uploads files into private Supabase Storage ('audio' or 'covers')
// using authoritative backend service credentials or authenticated admin JWT.
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
    const contentType = file.type || (bucket === 'covers' ? 'image/jpeg' : 'audio/mpeg');

    // 1. Authoritative Backend Upload (Primary):
    // Uses the Supabase Service Role client to upload into private storage, bypassing RLS safely.
    if (isServiceRoleConfigured()) {
      const supabase = getServiceRoleClient();
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
    }

    // 2. Authenticated Session Token Forwarding (Fallback):
    // @supabase/ssr createServerClient does not propagate cookie tokens to @supabase/storage-js headers,
    // causing direct storage calls to default to role = 'anon' and fail Storage RLS ("Admin upload audio").
    // If the service role key is not yet set, we extract the admin user's JWT and pass it in the Authorization header.
    if (isSupabaseConfigured() && !adminRes.isDev) {
      const ssrClient = await createClient();
      const {
        data: { session },
      } = await ssrClient.auth.getSession();

      if (session?.access_token) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey =
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          '';

        const authenticatedStorageClient = createSupabaseClient(url, anonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        });

        const { error } = await authenticatedStorageClient.storage
          .from(bucket)
          .upload(storageKey, buffer, {
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
      }
    }

    // 3. Local Development Fallback (Offline / dev mode without service key or live session)
    if (!isSupabaseConfigured() || adminRes.isDev) {
      const localKey = await saveLocalFile(bucket, file.name, buffer);
      return NextResponse.json({
        path: localKey,
        url: `/api/media?bucket=${bucket}&path=${encodeURIComponent(localKey)}`,
      });
    }

    return NextResponse.json(
      { error: 'Server storage configuration incomplete. SUPABASE_SERVICE_ROLE_KEY is required for uploads.' },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'File upload failed' },
      { status: 500 }
    );
  }
}
