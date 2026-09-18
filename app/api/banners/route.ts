import { NextRequest, NextResponse } from 'next/server';
import { getLocalBanners, saveLocalBanner } from '@/lib/storage/local';
import { deleteServerMedia } from '@/lib/storage/serverUpload';
import { requireAuth, requireAdmin, isAuthError } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
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

      let imageUrl: string | undefined = undefined;
      if (file && file instanceof File && file.size > 0) {
        // MIME type validation
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Uploaded file must be a valid image.' }, { status: 400 });
        }

        // Upload using authenticated admin session (storage policy grants upload to public.is_admin())
        const supabase = await createClient();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const ext = cleanName.split('.').pop() || 'jpg';
        const storagePath = `banners/banner_slot_${id}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from('covers')
          .upload(storagePath, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          return NextResponse.json(
            { error: uploadError.message || 'Failed to upload banner image' },
            { status: 500 }
          );
        }

        imageUrl = `/api/media?bucket=covers&path=${encodeURIComponent(storagePath)}`;

        // Clean up previous banner image for this slot if it exists
        try {
          const currentBanners = await getLocalBanners();
          const oldBanner = currentBanners.find((b) => b.id === id);
          if (oldBanner?.image_url && oldBanner.image_url !== imageUrl) {
            await deleteServerMedia('covers', oldBanner.image_url);
          }
        } catch {
          // ignore cleanup errors
        }
      }

      const updatedBanner: Banner = {
        id,
        title: title ? title.toString().trim() : `Banner ${id}`,
        subtitle: subtitle ? subtitle.toString().trim() : '',
        category: category ? category.toString().trim() : 'FEATURED',
        stats: stats ? stats.toString().trim() : '',
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };

      const allBanners = await saveLocalBanner(updatedBanner);
      return NextResponse.json({ banner: updatedBanner, banners: allBanners });
    }

    const body = await req.json();
    const { id, title, subtitle, category, stats, image_url, gradient } = body;

    if (!id || id < 1 || id > 4) {
      return NextResponse.json({ error: 'Invalid banner id (1-4 required)' }, { status: 400 });
    }

    const updatedBanner: Banner = {
      id: Number(id),
      title: (title || '').trim(),
      subtitle: (subtitle || '').trim(),
      category: (category || '').trim(),
      stats: (stats || '').trim(),
      image_url: image_url || undefined,
      gradient: gradient || undefined,
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
