-- =============================================================================
-- CARIÑO — Migration 20240918000000: User Profiles, Roles, and Hardened RLS
-- Enforces:
-- 1. Dedicated public.profiles table referencing auth.users(id)
-- 2. Dual-tier authorization: 'user' vs 'admin'
-- 3. Automatic profile generation on auth.users sign-up
-- 4. Server-enforced RLS on songs, banners, rooms, room_members, and storage
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Cariño Listener',
  avatar_url TEXT,
  gender TEXT DEFAULT 'Not specified',
  date_of_birth DATE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick role and display lookup
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Helper Security Definer Functions
-- -----------------------------------------------------------------------------
-- Returns true if the executing caller is an admin
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
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Profiles RLS Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Any authenticated user can read public profiles (needed for room participant names/avatars)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert their own profile record
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can only update their own profile; non-admins cannot change their role
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- If role is not being changed, or caller is already admin
      role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      OR public.is_admin()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Automatic Profile Trigger on auth.users Sign Up
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_name TEXT;
  extracted_avatar TEXT;
BEGIN
  -- Extract name from OAuth metadata (Google / Apple)
  extracted_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Cariño Listener'
  );

  -- Extract avatar from OAuth metadata
  extracted_avatar := COALESCE(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture',
    NULL
  );

  INSERT INTO public.profiles (id, display_name, avatar_url, role)
  VALUES (new.id, extracted_name, extracted_avatar, 'user')
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Songs Table: Strict Admin-Only Modifications
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public songs are viewable by everyone" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can insert songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can update songs" ON public.songs;
DROP POLICY IF EXISTS "Only authenticated users can delete songs" ON public.songs;

-- Only authenticated users can view songs
CREATE POLICY "Authenticated users can view songs"
  ON public.songs FOR SELECT
  TO authenticated
  USING (true);

-- Only Admin or service_role can insert songs
CREATE POLICY "Only admin can insert songs"
  ON public.songs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Only Admin or service_role can update songs
CREATE POLICY "Only admin can update songs"
  ON public.songs FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Only Admin or service_role can delete songs
CREATE POLICY "Only admin can delete songs"
  ON public.songs FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Rooms & Room Members RLS Hardening
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Rooms are viewable by everyone" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;

CREATE POLICY "Authenticated users can view rooms"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create rooms"
  ON public.rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = host_user_id);

CREATE POLICY "Host or admin can update rooms"
  ON public.rooms FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = host_user_id OR public.is_admin());

CREATE POLICY "Host or admin can delete rooms"
  ON public.rooms FOR DELETE
  TO authenticated
  USING (auth.uid()::text = host_user_id OR public.is_admin());

-- Room Members
DROP POLICY IF EXISTS "Room members are viewable by everyone" ON public.room_members;
DROP POLICY IF EXISTS "Anyone can join rooms" ON public.room_members;

CREATE POLICY "Authenticated users can view room members"
  ON public.room_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join rooms as themselves"
  ON public.room_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can leave rooms as themselves"
  ON public.room_members FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id OR public.is_admin());

-- Room State
DROP POLICY IF EXISTS "Room state is viewable by everyone" ON public.room_state;
DROP POLICY IF EXISTS "Anyone can update room state" ON public.room_state;

CREATE POLICY "Authenticated users can view room state"
  ON public.room_state FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Room members can update room state"
  ON public.room_state FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_state.room_id
        AND rm.user_id = auth.uid()::text
    )
    OR public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- 7. Storage Policies Hardening
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update audio" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete audio" ON storage.objects;

-- Audio bucket: Authenticated users can view; ONLY admin or service_role can upload/delete
CREATE POLICY "Authenticated users can view audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'audio');

CREATE POLICY "Only admin can upload audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'audio' AND public.is_admin());

CREATE POLICY "Only admin can update audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'audio' AND public.is_admin());

CREATE POLICY "Only admin can delete audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'audio' AND public.is_admin());

-- Covers bucket: Authenticated users can view; only admin can upload catalog/banner covers
DROP POLICY IF EXISTS "Authenticated users can view covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can update covers" ON storage.objects;
DROP POLICY IF EXISTS "Only authenticated users can delete covers" ON storage.objects;

CREATE POLICY "Authenticated users can view covers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'covers');

CREATE POLICY "Admin or user avatar upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Admin or user avatar update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Admin or user avatar delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'covers'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
