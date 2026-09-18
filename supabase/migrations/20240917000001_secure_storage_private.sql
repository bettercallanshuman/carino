-- =============================================================================
-- CARIÑO — Migration 20240917000001: Enforce Private Buckets & Secure Storage
-- Run this in Supabase Dashboard > SQL Editor to secure existing projects.
-- =============================================================================

-- 1. Switch buckets to strictly PRIVATE
INSERT INTO storage.buckets (id, name, public) 
VALUES ('covers', 'covers', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio', 'audio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Drop old overly-permissive storage policies
DROP POLICY IF EXISTS "Public covers are accessible by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Public audio is accessible by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete audio" ON storage.objects;

-- 3. Create hardened storage policies for 'covers'
-- READ: Authenticated users can read directly. Anonymous users must use Signed URLs.
CREATE POLICY "Authenticated users can view covers" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'covers');

-- WRITE: Anonymous users cannot upload. Only authenticated users (or service_role) can upload.
CREATE POLICY "Only authenticated users can upload covers" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'covers');

CREATE POLICY "Only authenticated users can update covers" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'covers');

CREATE POLICY "Only authenticated users can delete covers" 
  ON storage.objects FOR DELETE 
  TO authenticated 
  USING (bucket_id = 'covers');

-- 4. Create hardened storage policies for 'audio'
-- READ: Authenticated users can read directly. Anonymous listeners must use Signed URLs.
CREATE POLICY "Authenticated users can view audio" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'audio');

-- WRITE: Anonymous users cannot upload. Only authenticated users (or service_role) can upload.
CREATE POLICY "Only authenticated users can upload audio" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Only authenticated users can update audio" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'audio');

CREATE POLICY "Only authenticated users can delete audio" 
  ON storage.objects FOR DELETE 
  TO authenticated 
  USING (bucket_id = 'audio');

-- 5. Harden public.songs table RLS
DROP POLICY IF EXISTS "Anyone can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Anyone can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can delete songs" ON public.songs;

CREATE POLICY "Only authenticated users can insert songs" 
  ON public.songs FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Only authenticated users can update songs" 
  ON public.songs FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Only authenticated users can delete songs" 
  ON public.songs FOR DELETE 
  TO authenticated 
  USING (true);
