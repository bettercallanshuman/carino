-- =============================================================================
-- CARIÑO — Phase 3 Fix: Admin Upload RLS, Profile Promotion & Storage Hardening
-- Resolves: "new row violates row-level security policy"
-- =============================================================================

-- 1. Ensure 'genre' column exists on public.songs
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS genre TEXT DEFAULT 'General';

-- 2. Security Definer Helper Function: is_admin()
-- Authenticated users evaluate this. Checks persisted database role first,
-- with exact primary-admin email check from JWT claim as verified identity.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
  OR (
    lower(COALESCE(auth.jwt() ->> 'email', '')) = 'iam.anshumannn@gmail.com'
  );
$$;

-- Grant execute permission so RLS policies and RPC callers can evaluate is_admin()
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 3. Promote primary admin in public.profiles
-- Ensure profile exists and role is strictly set to 'admin'
INSERT INTO public.profiles (id, full_name, display_name, role)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Anshuman'),
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Anshuman'),
  'admin'
FROM auth.users
WHERE lower(COALESCE(email, '')) = 'iam.anshumannn@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  updated_at = NOW();

-- Also ensure any existing profile with matching ID is promoted
UPDATE public.profiles
SET role = 'admin', updated_at = NOW()
WHERE id IN (
  SELECT id FROM auth.users WHERE lower(COALESCE(email, '')) = 'iam.anshumannn@gmail.com'
);

-- 4. Update handle_new_user() trigger function
-- Guarantees primary admin is assigned role = 'admin' on registration/sign-in
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_name TEXT;
  extracted_avatar TEXT;
  assigned_role TEXT;
BEGIN
  extracted_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Cariño Listener'
  );

  extracted_avatar := COALESCE(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture',
    NULL
  );

  IF lower(COALESCE(new.email, '')) = 'iam.anshumannn@gmail.com' THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.profiles (id, full_name, display_name, avatar_url, role)
  VALUES (new.id, extracted_name, extracted_name, extracted_avatar, assigned_role)
  ON CONFLICT (id) DO UPDATE SET
    role = CASE 
      WHEN lower(COALESCE(new.email, '')) = 'iam.anshumannn@gmail.com' THEN 'admin' 
      ELSE public.profiles.role 
    END,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Hardened RLS Policies on public.songs
-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public songs are viewable by everyone" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can delete songs" ON public.songs;
DROP POLICY IF EXISTS "Authenticated users can view songs" ON public.songs;
DROP POLICY IF EXISTS "Admin insert songs" ON public.songs;
DROP POLICY IF EXISTS "Admin update songs" ON public.songs;
DROP POLICY IF EXISTS "Admin delete songs" ON public.songs;
DROP POLICY IF EXISTS "Only admin can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Only admin can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only admin can delete songs" ON public.songs;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

-- SELECT: Authenticated users can view catalog
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

-- Table grants
GRANT SELECT ON public.songs TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.songs TO authenticated;

-- 6. Hardened Storage RLS Policies for 'audio' and 'covers'
DROP POLICY IF EXISTS "Authenticated users view audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin update audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users view covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar insert covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar update covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view covers" ON storage.objects;

-- Audio policies (strictly admin-only for writes)
CREATE POLICY "Authenticated users view audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'audio');

CREATE POLICY "Admin upload audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'audio' AND public.is_admin());

CREATE POLICY "Admin update audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'audio' AND public.is_admin());

CREATE POLICY "Admin delete audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'audio' AND public.is_admin());

-- Covers policies (admin can manage catalog; users can only manage own avatar)
CREATE POLICY "Authenticated users view covers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'covers');

CREATE POLICY "Admin or user avatar insert covers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Admin or user avatar update covers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Admin or user avatar delete covers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- 7. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
