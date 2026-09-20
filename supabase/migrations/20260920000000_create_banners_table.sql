-- =============================================================================
-- CARIÑO — Persistent Banner Metadata Migration
-- Creates public.banners table, configures RLS, and seeds customized 4 slots.
-- =============================================================================

-- 1. Create banners table
CREATE TABLE IF NOT EXISTS public.banners (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL UNIQUE CHECK (slot >= 1 AND slot <= 4),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'CURATED PLAYLIST',
  stats TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  image_url TEXT,
  gradient TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #FF5722 0%, #E64A19 100%)',
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for ordering by display slot
CREATE INDEX IF NOT EXISTS idx_banners_slot ON public.banners (slot ASC);

-- 2. Enable Row Level Security
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Authenticated users may read banner metadata
DROP POLICY IF EXISTS "Authenticated users can view banners" ON public.banners;
CREATE POLICY "Authenticated users can view banners"
  ON public.banners FOR SELECT
  TO authenticated
  USING (true);

-- Only verified administrators can insert banner records
DROP POLICY IF EXISTS "Admin can insert banners" ON public.banners;
CREATE POLICY "Admin can insert banners"
  ON public.banners FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Only verified administrators can update banner records
DROP POLICY IF EXISTS "Admin can update banners" ON public.banners;
CREATE POLICY "Admin can update banners"
  ON public.banners FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only verified administrators can delete banner records
DROP POLICY IF EXISTS "Admin can delete banners" ON public.banners;
CREATE POLICY "Admin can delete banners"
  ON public.banners FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. Seed customized four banner records from active Cariño configuration
INSERT INTO public.banners (id, slot, title, subtitle, category, stats, gradient, image_path, image_url, created_at, updated_at)
VALUES
  (
    'banner-slot-1',
    1,
    'INDIA TOUR',
    'Get Your Tickets on Book My Show',
    'FEATURED',
    '10,000+ Attendees',
    'linear-gradient(135deg, #FF5722 0%, #E64A19 100%)',
    'banners/banner_slot_1_1789825809399.gif',
    '/api/media?bucket=covers&path=banners%2Fbanner_slot_1_1789825809399.gif',
    NOW(),
    NOW()
  ),
  (
    'banner-slot-2',
    2,
    'Apple',
    'Creator Studio',
    'featured',
    '',
    'linear-gradient(135deg, #4338CA 0%, #312E81 100%)',
    'banners/banner_slot_2_1789825882159.gif',
    '/api/media?bucket=covers&path=banners%2Fbanner_slot_2_1789825882159.gif',
    NOW(),
    NOW()
  ),
  (
    'banner-slot-3',
    3,
    'Promo',
    '',
    'FEATURED',
    '',
    'linear-gradient(135deg, #0D9488 0%, #115E59 100%)',
    'banners/banner_slot_3_1789825825950.gif',
    '/api/media?bucket=covers&path=banners%2Fbanner_slot_3_1789825825950.gif',
    NOW(),
    NOW()
  ),
  (
    'banner-slot-4',
    4,
    'K-POP',
    'India Tour',
    'featured',
    '',
    'linear-gradient(135deg, #BE185D 0%, #881337 100%)',
    'banners/banner_slot_4_1789825916213.gif',
    '/api/media?bucket=covers&path=banners%2Fbanner_slot_4_1789825916213.gif',
    NOW(),
    NOW()
  )
ON CONFLICT (slot) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  category = EXCLUDED.category,
  stats = EXCLUDED.stats,
  gradient = EXCLUDED.gradient,
  image_path = EXCLUDED.image_path,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();
