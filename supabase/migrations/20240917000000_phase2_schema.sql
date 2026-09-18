-- =============================================================================
-- CARIÑO — Phase 2: Complete Database & Storage Schema
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

-- Songs Table
CREATE TABLE IF NOT EXISTS public.songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  audio_path TEXT NOT NULL,
  cover_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Playlists Table
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Playlist Tracks Junction Table
CREATE TABLE IF NOT EXISTS public.playlist_tracks (
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, song_id)
);

-- Listening Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code TEXT NOT NULL UNIQUE,
  host_user_id TEXT NOT NULL,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Room Members Table
CREATE TABLE IF NOT EXISTS public.room_members (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Room State Table (Synchronized Playback Engine)
CREATE TABLE IF NOT EXISTS public.room_state (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  current_song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  queue_index INTEGER NOT NULL DEFAULT 0,
  is_playing BOOLEAN NOT NULL DEFAULT FALSE,
  position_ms INTEGER NOT NULL DEFAULT 0,
  state_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Indexes for Performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON public.songs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_title_artist ON public.songs(title, artist);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON public.playlist_tracks(playlist_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);

-- -----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_state ENABLE ROW LEVEL SECURITY;

-- Songs Policies: anyone can read songs, but only authenticated users or service_role can insert/update/delete
CREATE POLICY "Public songs are viewable by everyone" 
  ON public.songs FOR SELECT USING (true);

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

-- Playlists Policies
CREATE POLICY "Public playlists are viewable by everyone" 
  ON public.playlists FOR SELECT USING (true);

CREATE POLICY "Anyone can insert playlists" 
  ON public.playlists FOR INSERT WITH CHECK (true);

CREATE POLICY "Playlist tracks are viewable by everyone" 
  ON public.playlist_tracks FOR SELECT USING (true);

CREATE POLICY "Anyone can manage playlist tracks" 
  ON public.playlist_tracks FOR ALL USING (true);

-- Rooms Policies
CREATE POLICY "Rooms are viewable by everyone" 
  ON public.rooms FOR SELECT USING (true);

CREATE POLICY "Anyone can create rooms" 
  ON public.rooms FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update rooms" 
  ON public.rooms FOR UPDATE USING (true);

-- Room Members Policies
CREATE POLICY "Room members are viewable by everyone" 
  ON public.room_members FOR SELECT USING (true);

CREATE POLICY "Anyone can join rooms" 
  ON public.room_members FOR ALL USING (true);

-- Room State Policies
CREATE POLICY "Room state is viewable by everyone" 
  ON public.room_state FOR SELECT USING (true);

CREATE POLICY "Anyone can update room state" 
  ON public.room_state FOR ALL USING (true);

-- -----------------------------------------------------------------------------
-- 4. Realtime Configuration
-- -----------------------------------------------------------------------------
-- Enable realtime broadcasting on room_state & room_members tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;

-- -----------------------------------------------------------------------------
-- 5. Storage Buckets Setup (PRIVATE BUCKETS)
-- -----------------------------------------------------------------------------
-- Both 'covers' and 'audio' are strictly private (public = false).
-- Anonymous users cannot read directly without signed URLs and CANNOT upload.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('covers', 'covers', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio', 'audio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage Security Policies for 'covers' (PRIVATE)
CREATE POLICY "Authenticated users can view covers" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'covers');

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

-- Storage Security Policies for 'audio' (PRIVATE)
CREATE POLICY "Authenticated users can view audio" 
  ON storage.objects FOR SELECT 
  TO authenticated 
  USING (bucket_id = 'audio');

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
