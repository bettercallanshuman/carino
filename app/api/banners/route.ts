import { NextRequest, NextResponse } from 'next/server';
import { getLocalBanners, saveLocalBanner, saveLocalFile } from '@/lib/storage/local';
import { deleteServerMedia } from '@/lib/storage/serverUpload';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import type { Banner } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Banners API
// Manages exactly 4 dashboard banner slots.
// GET: Authenticated users.
// POST: Administrator only.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authRes = await requireAuth(req);
    if (isAuthError(authRes)) return authRes;

    const banners = await getLocalBanners();
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

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const idStr = formData.get('id');
      const title = formData.get('title');
      const subtitle = formData.get('subtitle');
      const category = formData.get('category');
      const stats = formData.get('stats');
      const file = formData.get('file');

      if (!idStr) {
        return NextResponse.json({ error: 'Banner id is required' }, { status: 400 });
      }

      const id = parseInt(idStr.toString(), 10);
      if (id < 1 || id > 4) {
        return NextResponse.json({ error: 'Banner slot must be between 1 and 4' }, { status: 400 });
      }

      const currentBanners = await getLocalBanners();
      const existing = currentBanners.find((b) => b.id === id);

      let imageUrl: string | undefined = undefined;
      if (file && file instanceof File && file.size > 0) {
        // MIME type validation
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Uploaded file must be a valid image.' }, { status: 400 });
        }

        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const rawExt = cleanName.split('.').pop()?.toLowerCase() || (isGif ? 'gif' : 'jpg');
        const ext = isGif ? 'gif' : rawExt;
        const fileContentType = isGif ? 'image/gif' : (file.type || 'image/jpeg');

        const storagePath = `banners/banner_slot_${id}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (!isSupabaseConfigured()) {
          const localKey = await saveLocalFile('covers', storagePath, buffer);
          imageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(localKey)}`;
        } else {
          try {
            const supabase = await createClient();
            const { error: uploadError } = await supabase.storage
              .from('covers')
              .upload(storagePath, buffer, {
                contentType: fileContentType,
                upsert: true,
              });

            if (uploadError) {
              const localKey = await saveLocalFile('covers', storagePath, buffer);
              imageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(localKey)}`;
            } else {
              imageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(storagePath)}`;
            }
          } catch {
            const localKey = await saveLocalFile('covers', storagePath, buffer);
            imageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(localKey)}`;
          }
        }

        imageUrl = imageUrl || `/api/media?bucket=covers&path=${encodeURIComponent(storagePath)}`;

        // Clean up previous banner image for this slot if it exists
        try {
          if (existing?.image_url && existing.image_url !== imageUrl) {
            await deleteServerMedia('covers', existing.image_url);
          }
        } catch {
          // ignore cleanup errors
        }
      }

      const finalImageUrl = imageUrl || existing?.image_url;

      const updatedBanner: Banner = {
        ...(existing || {}),
        id,
        title: title !== null && title !== undefined ? title.toString().trim() : (existing?.title || `Banner ${id}`),
        subtitle: subtitle !== null && subtitle !== undefined ? subtitle.toString().trim() : (existing?.subtitle || ''),
        category: category !== null && category !== undefined ? category.toString().trim() : (existing?.category || 'CURATED PLAYLIST'),
        stats: stats !== null && stats !== undefined ? stats.toString().trim() : (existing?.stats || ''),
        ...(finalImageUrl ? { image_url: finalImageUrl } : {}),
      };

      const allBanners = await saveLocalBanner(updatedBanner);
      return NextResponse.json({ banner: updatedBanner, banners: allBanners });
    }

    const body = await req.json();
    const { id, title, subtitle, category, stats, image_url, gradient } = body;

    if (!id || id < 1 || id > 4) {
      return NextResponse.json({ error: 'Invalid banner id (1-4 required)' }, { status: 400 });
    }

    const currentBanners = await getLocalBanners();
    const existing = currentBanners.find((b) => b.id === Number(id));
    const finalImageUrl = image_url !== undefined ? (image_url || undefined) : existing?.image_url;

    const updatedBanner: Banner = {
      ...(existing || {}),
      id: Number(id),
      title: title !== undefined ? title.trim() : (existing?.title || `Banner ${id}`),
      subtitle: subtitle !== undefined ? subtitle.trim() : (existing?.subtitle || ''),
      category: category !== undefined ? category.trim() : (existing?.category || 'CURATED PLAYLIST'),
      stats: stats !== undefined ? stats.trim() : (existing?.stats || ''),
      ...(finalImageUrl ? { image_url: finalImageUrl } : {}),
      ...(gradient !== undefined ? { gradient } : (existing?.gradient ? { gradient: existing.gradient } : {})),
    };

    const allBanners = await saveLocalBanner(updatedBanner);
    return NextResponse.json({ banner: updatedBanner, banners: allBanners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update banner' },
      { status: 500 }
    );
  }
}
