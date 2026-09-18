-- =============================================================================
-- CARIÑO — Migration 20240918000002: Hardened Profiles, RBAC & Storage (Verified)
-- Execute in Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Create public.profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  display_name TEXT NOT NULL DEFAULT 'Cariño Listener',
  avatar_url TEXT,
  gender TEXT DEFAULT 'Not specified',
  date_of_birth DATE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Security Definer Helper Function: is_admin()
-- Checks persisted database role first, with exact primary-admin email fallback ONLY as a bootstrap mechanism
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

-- 4. Profiles RLS Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile without escalation" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile without escalation" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- SELECT: Authenticated user can SELECT only their own profile (admin can view all)
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_admin()
  );

-- INSERT: Authenticated user can create only their own profile.
-- ANTI-ESCALATION: Normal user CANNOT set role = 'admin'; inserted role must be 'user'.
CREATE POLICY "Users can insert own profile without escalation"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (
      role = 'user'
      OR public.is_admin()
    )
  );

-- UPDATE: Authenticated user can update only their own profile.
-- ANTI-ESCALATION: Simple non-recursive check. Normal users must remain role = 'user'.
CREATE POLICY "Users can update own profile without escalation"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = id
    AND (
      role = 'user'
      OR public.is_admin()
    )
  );

-- 5. Storage RLS Policies for 'covers' and 'audio'
DROP POLICY IF EXISTS "Admin or user avatar upload" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar update" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users view covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar insert covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar update covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin or user avatar delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view covers" ON storage.objects;

-- Read covers: Authenticated users can view
CREATE POLICY "Authenticated users view covers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'covers');

-- Insert covers: Admin can upload shared banners & catalog covers; normal users only upload under personal folder ${auth.uid()}/...
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

-- Update & Delete covers: Admin or owner of personal avatar folder
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

-- Audio bucket: Strictly admin-only for writes
DROP POLICY IF EXISTS "Authenticated users can view audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin update audio" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete audio" ON storage.objects;

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

-- 6. Automatic Trigger on auth.users Sign-Up
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

-- 7. Backfill existing auth.users into public.profiles (Promoting primary admin)
INSERT INTO public.profiles (id, full_name, display_name, avatar_url, role)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Cariño Listener'),
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'Cariño Listener'),
  COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture', NULL),
  CASE 
    WHEN lower(email) = 'iam.anshumannn@gmail.com' THEN 'admin' 
    ELSE 'user' 
  END
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
  avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
  updated_at = NOW();

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
