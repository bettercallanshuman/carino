import { NextRequest, NextResponse } from 'next/server';
import { getLocalBanners, saveLocalBanner, saveLocalFile } from '@/lib/storage/local';
import { deleteServerMedia } from '@/lib/storage/serverUpload';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import type { Banner } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Banners API
// Production Source of Truth: Supabase PostgreSQL (public.banners table)
// Development Fallback: Local filesystem (only when Supabase is not configured)
//
// GET: Authenticated users.
// POST: Administrator only.
// ─────────────────────────────────────────────────────────────────────────────

interface DatabaseBannerRow {
  id: string;
  slot: number;
  title: string;
  subtitle: string | null;
  category: string | null;
  stats: string | null;
  image_path: string | null;
  image_url: string | null;
  gradient: string | null;
  link_url: string | null;
  created_at: string;
  updated_at: string;
}

function mapDatabaseRowToBanner(row: DatabaseBannerRow): Banner {
  const imagePath = row.image_path ? row.image_path.trim() : null;
  const derivedUrl = imagePath
    ? `/api/media?bucket=covers&path=${encodeURIComponent(imagePath)}`
    : undefined;

  return {
    id: row.slot,
    stable_id: row.id,
    slot: row.slot,
    title: row.title,
    subtitle: row.subtitle || '',
    category: row.category || 'CURATED PLAYLIST',
    stats: row.stats || '',
    gradient: row.gradient || undefined,
    image_path: imagePath,
    image_url: derivedUrl || row.image_url || undefined,
    link_url: row.link_url || undefined,
    updated_at: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    // 1. Local development fallback only when Supabase is genuinely not configured
    if (!isSupabaseConfigured()) {
      const banners = await getLocalBanners();
      return NextResponse.json(banners);
    }

    // 2. Production: Supabase PostgreSQL is the strict source of truth
    const supabase = await createClient();
    const { data: dbBanners, error } = await supabase
      .from('banners')
      .select('*')
      .order('slot', { ascending: true });

    if (error) {
      console.error('[GET /api/banners] Database error:', error.message);
      return NextResponse.json(
        { error: `Database error fetching banners: ${error.message}` },
        { status: 500 }
      );
    }

    if (!dbBanners || dbBanners.length === 0) {
      console.error('[GET /api/banners] No banner records found in database');
      return NextResponse.json(
        {
          error:
            'No banner records found in database. Please ensure migration 20260920000000_create_banners_table.sql has been executed in the Supabase project.',
        },
        { status: 500 }
      );
    }

    const banners: Banner[] = (dbBanners as DatabaseBannerRow[]).map(mapDatabaseRowToBanner);
    return NextResponse.json(banners);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch banners' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requireAdmin(req);
    if (isAuthError(adminRes)) return adminRes;

    const contentType = req.headers.get('content-type') || '';

    let slot = 0;
    let title: string | undefined = undefined;
    let subtitle: string | undefined = undefined;
    let category: string | undefined = undefined;
    let stats: string | undefined = undefined;
    let gradient: string | undefined = undefined;
    let explicitImageUrl: string | undefined = undefined;
    let file: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const idStr = formData.get('id');

      if (!idStr) {
        return NextResponse.json({ error: 'Banner slot id is required' }, { status: 400 });
      }

      slot = parseInt(idStr.toString(), 10);
      title = formData.get('title')?.toString().trim();
      subtitle = formData.get('subtitle')?.toString().trim();
      category = formData.get('category')?.toString().trim();
      stats = formData.get('stats')?.toString().trim();
      gradient = formData.get('gradient')?.toString().trim();

      const rawFile = formData.get('file');
      if (rawFile && rawFile instanceof File && rawFile.size > 0) {
        file = rawFile;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      const { id, title: bTitle, subtitle: bSub, category: bCat, stats: bStats, image_url: bImg, gradient: bGrad } = body;

      if (!id) {
        return NextResponse.json({ error: 'Banner slot id is required' }, { status: 400 });
      }

      slot = parseInt(id.toString(), 10);
      title = bTitle !== undefined ? bTitle.trim() : undefined;
      subtitle = bSub !== undefined ? bSub.trim() : undefined;
      category = bCat !== undefined ? bCat.trim() : undefined;
      stats = bStats !== undefined ? bStats.trim() : undefined;
      explicitImageUrl = bImg !== undefined ? (bImg || undefined) : undefined;
      gradient = bGrad !== undefined ? bGrad.trim() : undefined;
    }

    if (isNaN(slot) || slot < 1 || slot > 4) {
      return NextResponse.json({ error: 'Banner slot must be between 1 and 4' }, { status: 400 });
    }

    // ── Local Development Branch (Supabase Unconfigured) ─────────────────────
    if (!isSupabaseConfigured()) {
      const currentBanners = await getLocalBanners();
      const existing = currentBanners.find((b) => b.id === slot);

      let localImagePath: string | null = existing?.image_path || null;
      let localImageUrl: string | undefined = explicitImageUrl || existing?.image_url;

      if (file) {
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Uploaded file must be a valid image.' }, { status: 400 });
        }

        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const rawExt = cleanName.split('.').pop()?.toLowerCase() || (isGif ? 'gif' : 'jpg');
        const ext = isGif ? 'gif' : rawExt;

        const storagePath = `banners/banner_slot_${slot}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const localKey = await saveLocalFile('covers', storagePath, buffer);
        localImagePath = localKey;
        localImageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(localKey)}`;

        if (existing?.image_url && existing.image_url !== localImageUrl) {
          try {
            await deleteServerMedia('covers', existing.image_url);
          } catch {
            // ignore local cleanup errors
          }
        }
      }

      const updatedBanner: Banner = {
        ...(existing || {}),
        id: slot,
        stable_id: `banner-slot-${slot}`,
        slot,
        title: title !== undefined ? title : (existing?.title || `Banner ${slot}`),
        subtitle: subtitle !== undefined ? subtitle : (existing?.subtitle || ''),
        category: category !== undefined ? category : (existing?.category || 'CURATED PLAYLIST'),
        stats: stats !== undefined ? stats : (existing?.stats || ''),
        image_path: localImagePath,
        ...(localImageUrl ? { image_url: localImageUrl } : {}),
        ...(gradient !== undefined ? { gradient } : (existing?.gradient ? { gradient: existing.gradient } : {})),
        updated_at: new Date().toISOString(),
      };

      const allBanners = await saveLocalBanner(updatedBanner);
      return NextResponse.json({ banner: updatedBanner, banners: allBanners });
    }

    // ── Production Branch: Supabase Storage & Database Persistence ───────────
    const supabase = await createClient();

    // 1. Fetch current row from public.banners to preserve existing properties
    const { data: existingRow, error: fetchErr } = await supabase
      .from('banners')
      .select('*')
      .eq('slot', slot)
      .maybeSingle();

    if (fetchErr) {
      console.error('[POST /api/banners] Error checking existing banner:', fetchErr.message);
      return NextResponse.json(
        { error: `Database error checking banner: ${fetchErr.message}` },
        { status: 500 }
      );
    }

    let newStoragePath: string | null = null;
    let newDerivedUrl: string | undefined = undefined;

    // 2. Handle Image Upload if file provided
    if (file) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Uploaded file must be a valid image.' }, { status: 400 });
      }

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const rawExt = cleanName.split('.').pop()?.toLowerCase() || (isGif ? 'gif' : 'jpg');
      const ext = isGif ? 'gif' : rawExt;
      const fileContentType = isGif ? 'image/gif' : (file.type || 'image/jpeg');

      const storagePath = `banners/banner_slot_${slot}_${Date.now()}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(storagePath, buffer, {
          contentType: fileContentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('[POST /api/banners] Storage upload error:', uploadError.message);
        return NextResponse.json(
          { error: `Storage upload failed: ${uploadError.message}` },
          { status: 500 }
        );
      }

      newStoragePath = storagePath;
      newDerivedUrl = `/api/media?bucket=covers&path=${encodeURIComponent(storagePath)}`;

      // Clean up previous storage asset if replacing
      const previousImagePath = existingRow?.image_path || (existingRow?.image_url && existingRow.image_url.includes('path=') ? decodeURIComponent(existingRow.image_url.split('path=')[1].split('&')[0]) : null);
      if (previousImagePath && previousImagePath !== storagePath) {
        try {
          await deleteServerMedia('covers', previousImagePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    // 3. Resolve metadata fields
    const finalImagePath = newStoragePath !== null ? newStoragePath : (existingRow?.image_path ?? null);
    const finalImageUrl = newDerivedUrl
      || (explicitImageUrl !== undefined ? explicitImageUrl : undefined)
      || (finalImagePath ? `/api/media?bucket=covers&path=${encodeURIComponent(finalImagePath)}` : existingRow?.image_url);

    const finalTitle = title !== undefined ? title : (existingRow?.title || `Banner ${slot}`);
    const finalSubtitle = subtitle !== undefined ? subtitle : (existingRow?.subtitle ?? '');
    const finalCategory = category !== undefined ? category : (existingRow?.category ?? 'CURATED PLAYLIST');
    const finalStats = stats !== undefined ? stats : (existingRow?.stats ?? '');
    const finalGradient = gradient !== undefined
      ? gradient
      : (existingRow?.gradient ?? 'linear-gradient(135deg, #FF5722 0%, #E64A19 100%)');

    const stableId = existingRow?.id || `banner-slot-${slot}`;

    // 4. Persist banner record to Supabase
    const { data: savedRow, error: upsertErr } = await supabase
      .from('banners')
      .upsert(
        {
          id: stableId,
          slot,
          title: finalTitle,
          subtitle: finalSubtitle,
          category: finalCategory,
          stats: finalStats,
          image_path: finalImagePath,
          image_url: finalImageUrl,
          gradient: finalGradient,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slot' }
      )
      .select('*')
      .single();

    if (upsertErr || !savedRow) {
      console.error('[POST /api/banners] Upsert error:', upsertErr?.message);
      return NextResponse.json(
        { error: `Database update failed: ${upsertErr?.message || 'Unknown database error'}` },
        { status: 500 }
      );
    }

    // 5. Query all 4 banners to return complete updated state
    const { data: allRows, error: reloadErr } = await supabase
      .from('banners')
      .select('*')
      .order('slot', { ascending: true });

    if (reloadErr || !allRows) {
      console.error('[POST /api/banners] Reload error:', reloadErr?.message);
      return NextResponse.json(
        { error: `Failed to reload updated banners: ${reloadErr?.message}` },
        { status: 500 }
      );
    }

    const allBanners: Banner[] = (allRows as DatabaseBannerRow[]).map(mapDatabaseRowToBanner);
    const returnedBanner: Banner = mapDatabaseRowToBanner(savedRow as DatabaseBannerRow);

    return NextResponse.json({ banner: returnedBanner, banners: allBanners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update banner' },
      { status: 500 }
    );
  }
}
