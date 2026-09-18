-- =============================================================================
-- CARIÑO — Phase 3: Harden Songs Schema, Genre Column, RLS & Realtime
-- =============================================================================

-- 1. Ensure 'genre' column exists on public.songs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'songs'
      AND column_name = 'genre'
  ) THEN
    ALTER TABLE public.songs ADD COLUMN genre TEXT DEFAULT 'General';
  END IF;
END $$;

-- 2. Drop old permissive songs policies
DROP POLICY IF EXISTS "Public songs are viewable by everyone" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can delete songs" ON public.songs;
DROP POLICY IF EXISTS "Authenticated users can view songs" ON public.songs;
DROP POLICY IF EXISTS "Admin insert songs" ON public.songs;
DROP POLICY IF EXISTS "Admin update songs" ON public.songs;
DROP POLICY IF EXISTS "Admin delete songs" ON public.songs;

-- 3. Hardened RLS Policies on public.songs
-- SELECT: Authenticated users can view live catalog
CREATE POLICY "Authenticated users can view songs"
  ON public.songs FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Only Administrator can insert shared catalog songs
CREATE POLICY "Admin insert songs"
  ON public.songs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- UPDATE: Only Administrator can update shared catalog songs
CREATE POLICY "Admin update songs"
  ON public.songs FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: Only Administrator can delete shared catalog songs
CREATE POLICY "Admin delete songs"
  ON public.songs FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. Ensure public.songs is included in Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'songs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- publication might not exist in some local setups
    NULL;
END $$;
