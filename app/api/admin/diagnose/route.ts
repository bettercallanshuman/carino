import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/server';
import { getServiceRoleClient, isServiceRoleConfigured } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Admin Diagnostics Route
// Surfaces real-time Supabase connectivity, bucket existence, and credential
// status so production upload failures can be diagnosed precisely.
// Admin-only. Never exposes raw secret values.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const pubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const adminEmail = process.env.ADMIN_EMAIL || '';

    const supabaseConfigured = isSupabaseConfigured();
    const serviceRoleConfigured = isServiceRoleConfigured();

    const report: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      environment: {
        supabase_url_set: Boolean(url && !url.includes('your-project')),
        supabase_url_project: url ? url.replace('https://', '').split('.')[0] : '(missing)',
        publishable_key_set: Boolean(pubKey && pubKey !== 'sb_publishable_...'),
        publishable_key_prefix: pubKey ? pubKey.substring(0, 20) + '...' : '(missing)',
        service_role_key_set: Boolean(svcKey),
        service_role_key_prefix: svcKey ? svcKey.substring(0, 20) + '...' : '(missing)',
        admin_email_set: Boolean(adminEmail),
        admin_email_masked: adminEmail ? adminEmail.replace(/(.{2}).*(@.*)/, '$1***$2') : '(missing)',
      },
      configuration: {
        isSupabaseConfigured: supabaseConfigured,
        isServiceRoleConfigured: serviceRoleConfigured,
      },
      auth: {
        authenticated_as: adminRes.email,
        is_admin: adminRes.isAdmin,
        is_dev_session: adminRes.isDev ?? false,
      },
    };

    if (!supabaseConfigured) {
      report.verdict = 'FAIL: Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or publishable key.';
      return NextResponse.json(report, { status: 200 });
    }

    if (!serviceRoleConfigured) {
      report.verdict = 'WARNING: SUPABASE_SERVICE_ROLE_KEY is missing or placeholder. Audio uploads will fall back to session JWT (may fail after project pause/resume). Banner uploads will use session JWT only.';
    }

    // Test Supabase connectivity and bucket existence using service role
    if (serviceRoleConfigured) {
      try {
        const client = getServiceRoleClient();

        // Test audio bucket
        const { data: audioBuckets, error: audioErr } = await client.storage.listBuckets();
        if (audioErr) {
          report.storage_connectivity = `FAIL: ${audioErr.message}`;
        } else {
          const bucketNames = audioBuckets?.map((b) => b.name) ?? [];
          report.storage_connectivity = 'OK';
          report.buckets_found = bucketNames;
          report.bucket_audio_exists = bucketNames.includes('audio');
          report.bucket_covers_exists = bucketNames.includes('covers');

          if (!bucketNames.includes('audio')) {
            report.bucket_audio_verdict = 'FAIL: "audio" bucket not found in Supabase Storage.';
          } else {
            // Test list objects in audio bucket (read access)
            const { error: listErr } = await client.storage.from('audio').list('', { limit: 1 });
            report.bucket_audio_verdict = listErr ? `READ FAIL: ${listErr.message}` : 'OK (readable)';
          }

          if (!bucketNames.includes('covers')) {
            report.bucket_covers_verdict = 'FAIL: "covers" bucket not found in Supabase Storage.';
          } else {
            const { error: listErr } = await client.storage.from('covers').list('', { limit: 1 });
            report.bucket_covers_verdict = listErr ? `READ FAIL: ${listErr.message}` : 'OK (readable)';
          }
        }

        // Test banners table
        const { data: bannerRows, error: bannerErr } = await client
          .from('banners')
          .select('slot, title')
          .order('slot', { ascending: true });

        if (bannerErr) {
          report.banners_table = `FAIL: ${bannerErr.message}`;
        } else {
          report.banners_table = `OK (${bannerRows?.length ?? 0} rows)`;
          report.banners_rows = bannerRows?.map((r) => ({ slot: r.slot, title: r.title }));
        }

        // Test songs table
        const { count: songCount, error: songsErr } = await client
          .from('songs')
          .select('id', { count: 'exact', head: true });

        report.songs_table = songsErr ? `FAIL: ${songsErr.message}` : `OK (${songCount ?? 0} songs)`;

        if (!report.verdict) {
          report.verdict = 'OK: All systems reachable via service role.';
        }
      } catch (err) {
        report.storage_connectivity = `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`;
        report.verdict = 'FAIL: Unexpected error during service role connectivity test.';
      }
    } else {
      report.storage_connectivity = 'SKIPPED: Service role key not configured.';
      if (!report.verdict) {
        report.verdict = 'WARNING: Cannot test storage without service role key.';
      }
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Diagnostics failed' },
      { status: 500 }
    );
  }
}

