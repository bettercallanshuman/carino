import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import type { Song, Playlist, PlaylistTrack, Banner, UserProfile, Room, RoomMember, RoomState } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Local Storage Provider (Development & Fallback)
// Persists uploaded audio files, cover art, songs, and playlists to local disk
// when Supabase is not connected, allowing 100% end-to-end playback, artwork
// rendering, playlists, and true deletion.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_DIR = path.join(process.cwd(), '.storage');
const SONGS_FILE = path.join(STORAGE_DIR, 'songs.json');
const PLAYLISTS_FILE = path.join(STORAGE_DIR, 'playlists.json');
const PLAYLIST_TRACKS_FILE = path.join(STORAGE_DIR, 'playlist_tracks.json');
const BANNERS_FILE = path.join(STORAGE_DIR, 'banners.json');
const PROFILE_FILE = path.join(STORAGE_DIR, 'profile.json');
const ROOMS_FILE = path.join(STORAGE_DIR, 'rooms.json');
const ROOM_MEMBERS_FILE = path.join(STORAGE_DIR, 'room_members.json');
const ROOM_STATE_FILE = path.join(STORAGE_DIR, 'room_state.json');
const FAVORITES_FILE = path.join(STORAGE_DIR, 'favorites.json');

async function ensureDirs(bucket?: 'audio' | 'covers') {
  if (!fsSync.existsSync(STORAGE_DIR)) {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }
  if (bucket) {
    const bucketDir = path.join(STORAGE_DIR, bucket);
    if (!fsSync.existsSync(bucketDir)) {
      await fs.mkdir(bucketDir, { recursive: true });
    }
    return bucketDir;
  }
  return STORAGE_DIR;
}

// ── File Management ──────────────────────────────────────────────────────────

/**
 * Saves an uploaded audio or cover file to local storage.
 * Returns the relative storage path (e.g. "covers_local_1726..._art.jpg").
 */
export async function saveLocalFile(
  bucket: 'audio' | 'covers',
  filename: string,
  data: Uint8Array | Buffer
): Promise<string> {
  const dir = await ensureDirs(bucket);
  const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageKey = `${bucket}_local_${Date.now()}_${cleanFilename}`;
  const filePath = path.join(dir, storageKey);

  await fs.writeFile(filePath, data);
  return storageKey;
}

/**
 * Checks if a file exists in local storage and returns its absolute path.
 */
export async function getLocalFilePath(
  bucket: 'audio' | 'covers',
  filename: string
): Promise<string | null> {
  const sanitized = path.basename(filename.replace(/^\/+/, ''));
  const filePath = path.join(STORAGE_DIR, bucket, sanitized);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      return filePath;
    }
  } catch {
    // File not found locally
  }
  return null;
}

/**
 * Permanently deletes a file from local storage.
 */
export async function deleteLocalFile(
  bucket: 'audio' | 'covers',
  filename: string
): Promise<boolean> {
  const sanitized = path.basename(filename.replace(/^\/+/, ''));
  const filePath = path.join(STORAGE_DIR, bucket, sanitized);

  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
      return true;
    }
  } catch (err) {
    console.warn(`[LocalStorage] Failed to delete file ${filePath}:`, err);
  }
  return false;
}

// ── Songs Data ───────────────────────────────────────────────────────────────

/**
 * Retrieves songs saved in local dev mode.
 */
export async function getLocalSongs(): Promise<Song[]> {
  try {
    if (!fsSync.existsSync(SONGS_FILE)) {
      return [];
    }
    const raw = await fs.readFile(SONGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Appends or updates a song in the local dev songs file.
 */
export async function saveLocalSong(song: Song): Promise<void> {
  try {
    await ensureDirs();
    const existing = await getLocalSongs();
    const updated = [song, ...existing.filter((s) => s.id !== song.id)];
    await fs.writeFile(SONGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LocalStorage] Failed to save song:', err);
  }
}

/**
 * Updates metadata of an existing local song.
 */
export async function updateLocalSong(
  id: string,
  updates: Partial<Song>
): Promise<Song | null> {
  try {
    await ensureDirs();
    const existing = await getLocalSongs();
    const index = existing.findIndex((s) => s.id === id);
    if (index === -1) return null;

    const updatedSong: Song = {
      ...existing[index],
      ...updates,
      id: existing[index].id, // protect immutable id
    };

    existing[index] = updatedSong;
    await fs.writeFile(SONGS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    return updatedSong;
  } catch (err) {
    console.error('[LocalStorage] Failed to update song:', err);
    return null;
  }
}

/**
 * True deletion of a song:
 * 1. Removes database record from songs.json
 * 2. Deletes audio storage file
 * 3. Deletes cover storage file
 * 4. Cleans up all matching playlist_tracks
 */
export async function deleteLocalSong(
  id: string
): Promise<{ success: boolean; deletedSong?: Song; error?: string }> {
  try {
    await ensureDirs();
    const existing = await getLocalSongs();
    const songToDelete = existing.find((s) => s.id === id);

    if (!songToDelete) {
      return { success: false, error: 'Song not found' };
    }

    // 1. Remove from songs.json
    const remainingSongs = existing.filter((s) => s.id !== id);
    await fs.writeFile(SONGS_FILE, JSON.stringify(remainingSongs, null, 2), 'utf-8');

    // 2. Delete audio storage object if it is a local storage key
    if (songToDelete.audio_path && songToDelete.audio_path.includes('audio_local_')) {
      await deleteLocalFile('audio', songToDelete.audio_path);
    }

    // 3. Delete cover storage object if it is a local storage key
    if (songToDelete.cover_path && songToDelete.cover_path.includes('covers_local_')) {
      await deleteLocalFile('covers', songToDelete.cover_path);
    }

    // 4. Remove matching playlist_tracks references
    const tracks = await getLocalAllPlaylistTracks();
    const remainingTracks = tracks.filter((t) => t.song_id !== id);
    if (tracks.length !== remainingTracks.length) {
      await fs.writeFile(
        PLAYLIST_TRACKS_FILE,
        JSON.stringify(remainingTracks, null, 2),
        'utf-8'
      );
    }

    return { success: true, deletedSong: songToDelete };
  } catch (err) {
    console.error('[LocalStorage] Error deleting song:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during deletion',
    };
  }
}

// ── Playlists Data ───────────────────────────────────────────────────────────

export async function getLocalPlaylists(): Promise<Playlist[]> {
  try {
    if (!fsSync.existsSync(PLAYLISTS_FILE)) {
      return [];
    }
    const raw = await fs.readFile(PLAYLISTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLocalPlaylist(playlist: Playlist): Promise<Playlist> {
  await ensureDirs();
  const playlists = await getLocalPlaylists();
  const updated = [playlist, ...playlists.filter((p) => p.id !== playlist.id)];
  await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return playlist;
}

export async function updateLocalPlaylist(
  id: string,
  updates: Partial<Playlist>
): Promise<Playlist | null> {
  await ensureDirs();
  const playlists = await getLocalPlaylists();
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const updatedPlaylist: Playlist = {
    ...playlists[index],
    ...updates,
    id: playlists[index].id,
  };

  playlists[index] = updatedPlaylist;
  await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2), 'utf-8');
  return updatedPlaylist;
}

export async function deleteLocalPlaylist(id: string): Promise<boolean> {
  await ensureDirs();
  const playlists = await getLocalPlaylists();
  const remaining = playlists.filter((p) => p.id !== id);
  await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(remaining, null, 2), 'utf-8');

  // Also remove all tracks in this playlist
  const tracks = await getLocalAllPlaylistTracks();
  const remainingTracks = tracks.filter((t) => t.playlist_id !== id);
  await fs.writeFile(
    PLAYLIST_TRACKS_FILE,
    JSON.stringify(remainingTracks, null, 2),
    'utf-8'
  );
  return true;
}

// ── Playlist Tracks Junction ────────────────────────────────────────────────

async function getLocalAllPlaylistTracks(): Promise<PlaylistTrack[]> {
  try {
    if (!fsSync.existsSync(PLAYLIST_TRACKS_FILE)) {
      return [];
    }
    const raw = await fs.readFile(PLAYLIST_TRACKS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getLocalPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const allTracks = await getLocalAllPlaylistTracks();
  return allTracks
    .filter((t) => t.playlist_id === playlistId)
    .sort((a, b) => a.position - b.position);
}

export async function addLocalPlaylistTrack(
  playlistId: string,
  songId: string
): Promise<PlaylistTrack> {
  await ensureDirs();
  const allTracks = await getLocalAllPlaylistTracks();

  // Guard against duplicate entry
  const existing = allTracks.find(
    (t) => t.playlist_id === playlistId && t.song_id === songId
  );
  if (existing) {
    return existing;
  }

  const playlistTracks = allTracks.filter((t) => t.playlist_id === playlistId);
  const maxPosition = playlistTracks.reduce(
    (max, t) => Math.max(max, t.position),
    -1
  );

  const newTrack: PlaylistTrack = {
    playlist_id: playlistId,
    song_id: songId,
    position: maxPosition + 1,
  };

  allTracks.push(newTrack);
  await fs.writeFile(
    PLAYLIST_TRACKS_FILE,
    JSON.stringify(allTracks, null, 2),
    'utf-8'
  );
  return newTrack;
}

export async function removeLocalPlaylistTrack(
  playlistId: string,
  songId: string
): Promise<boolean> {
  await ensureDirs();
  const allTracks = await getLocalAllPlaylistTracks();
  const remaining = allTracks.filter(
    (t) => !(t.playlist_id === playlistId && t.song_id === songId)
  );

  // Normalize positions
  let pos = 0;
  for (const track of remaining) {
    if (track.playlist_id === playlistId) {
      track.position = pos++;
    }
  }

  await fs.writeFile(
    PLAYLIST_TRACKS_FILE,
    JSON.stringify(remaining, null, 2),
    'utf-8'
  );
  return true;
}

export async function reorderLocalPlaylistTracks(
  playlistId: string,
  songIds: string[]
): Promise<PlaylistTrack[]> {
  await ensureDirs();
  const allTracks = await getLocalAllPlaylistTracks();
  const otherTracks = allTracks.filter((t) => t.playlist_id !== playlistId);

  const updatedPlaylistTracks: PlaylistTrack[] = songIds.map((songId, index) => ({
    playlist_id: playlistId,
    song_id: songId,
    position: index,
  }));

  const combined = [...otherTracks, ...updatedPlaylistTracks];
  await fs.writeFile(
    PLAYLIST_TRACKS_FILE,
    JSON.stringify(combined, null, 2),
    'utf-8'
  );
  return updatedPlaylistTracks;
}

// ── Banners Data (4 Slots) ──────────────────────────────────────────────────
import { DEFAULT_BANNERS, DEFAULT_PROFILE } from '@/lib/constants/defaults';

export async function getLocalBanners(): Promise<Banner[]> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(BANNERS_FILE)) {
      await fs.writeFile(BANNERS_FILE, JSON.stringify(DEFAULT_BANNERS, null, 2), 'utf-8');
      return DEFAULT_BANNERS;
    }
    const raw = await fs.readFile(BANNERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4) {
      return parsed;
    }
    await fs.writeFile(BANNERS_FILE, JSON.stringify(DEFAULT_BANNERS, null, 2), 'utf-8');
    return DEFAULT_BANNERS;
  } catch {
    return DEFAULT_BANNERS;
  }
}

export async function saveLocalBanner(banner: Banner): Promise<Banner[]> {
  await ensureDirs();
  const current = await getLocalBanners();
  const updated = current.map((b) => (b.id === banner.id ? { ...b, ...banner } : b));
  await fs.writeFile(BANNERS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// ── User Profile ─────────────────────────────────────────────────────────────

export async function getLocalProfile(): Promise<UserProfile> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(PROFILE_FILE)) {
      await fs.writeFile(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2), 'utf-8');
      return DEFAULT_PROFILE;
    }
    const raw = await fs.readFile(PROFILE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveLocalProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  await ensureDirs();
  const current = await getLocalProfile();
  const updated: UserProfile = { ...current, ...updates };
  await fs.writeFile(PROFILE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// ── Rooms Data ─────────────────────────────────────────────────────────────

export async function getLocalRooms(): Promise<Room[]> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(ROOMS_FILE)) {
      return [];
    }
    const raw = await fs.readFile(ROOMS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveLocalRoom(room: Room): Promise<Room> {
  await ensureDirs();
  const rooms = await getLocalRooms();
  const existingIdx = rooms.findIndex((r) => r.id === room.id || r.room_code === room.room_code);
  if (existingIdx >= 0) {
    rooms[existingIdx] = room;
  } else {
    rooms.unshift(room);
  }
  await fs.writeFile(ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
  return room;
}

export async function findLocalRoomByCode(code: string): Promise<Room | null> {
  const rooms = await getLocalRooms();
  const upper = code.trim().toUpperCase();
  return rooms.find((r) => r.room_code.toUpperCase() === upper) || null;
}

export async function findLocalRoomById(id: string): Promise<Room | null> {
  const rooms = await getLocalRooms();
  return rooms.find((r) => r.id === id) || null;
}

export async function deleteLocalRoom(id: string): Promise<boolean> {
  await ensureDirs();
  const rooms = await getLocalRooms();
  const filtered = rooms.filter((r) => r.id !== id);
  if (filtered.length === rooms.length) return false;
  await fs.writeFile(ROOMS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');

  // Also remove members and room state
  const members = await getAllLocalRoomMembers();
  await fs.writeFile(
    ROOM_MEMBERS_FILE,
    JSON.stringify(members.filter((m) => m.room_id !== id), null, 2),
    'utf-8'
  );

  const states = await getAllLocalRoomStates();
  await fs.writeFile(
    ROOM_STATE_FILE,
    JSON.stringify(states.filter((s) => s.room_id !== id), null, 2),
    'utf-8'
  );

  return true;
}

// ── Room Members Data ───────────────────────────────────────────────────────

export async function getAllLocalRoomMembers(): Promise<RoomMember[]> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(ROOM_MEMBERS_FILE)) {
      return [];
    }
    const raw = await fs.readFile(ROOM_MEMBERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function getLocalRoomMembers(roomId: string): Promise<RoomMember[]> {
  const all = await getAllLocalRoomMembers();
  return all.filter((m) => m.room_id === roomId);
}

export async function addLocalRoomMember(member: RoomMember): Promise<RoomMember[]> {
  await ensureDirs();
  const all = await getAllLocalRoomMembers();
  const existingIdx = all.findIndex((m) => m.room_id === member.room_id && m.user_id === member.user_id);
  if (existingIdx >= 0) {
    all[existingIdx] = member;
  } else {
    all.push(member);
  }
  await fs.writeFile(ROOM_MEMBERS_FILE, JSON.stringify(all, null, 2), 'utf-8');
  return all.filter((m) => m.room_id === member.room_id);
}

export async function removeLocalRoomMember(roomId: string, userId: string): Promise<RoomMember[]> {
  await ensureDirs();
  const all = await getAllLocalRoomMembers();
  const filtered = all.filter((m) => !(m.room_id === roomId && m.user_id === userId));
  await fs.writeFile(ROOM_MEMBERS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return filtered.filter((m) => m.room_id === roomId);
}

// ── Room State Data ─────────────────────────────────────────────────────────

export async function getAllLocalRoomStates(): Promise<RoomState[]> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(ROOM_STATE_FILE)) {
      return [];
    }
    const raw = await fs.readFile(ROOM_STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function getLocalRoomState(roomId: string): Promise<RoomState | null> {
  const all = await getAllLocalRoomStates();
  return all.find((s) => s.room_id === roomId) || null;
}

export async function updateLocalRoomState(
  roomId: string,
  updates: Partial<RoomState>
): Promise<RoomState> {
  await ensureDirs();
  const all = await getAllLocalRoomStates();
  const existingIdx = all.findIndex((s) => s.room_id === roomId);

  let updatedState: RoomState;
  if (existingIdx >= 0) {
    const existing = all[existingIdx];
    updatedState = {
      ...existing,
      ...updates,
      room_id: roomId,
      state_version: (existing.state_version || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    all[existingIdx] = updatedState;
  } else {
    updatedState = {
      room_id: roomId,
      current_song_id: updates.current_song_id ?? null,
      queue_index: updates.queue_index ?? 0,
      is_playing: updates.is_playing ?? false,
      position_ms: updates.position_ms ?? 0,
      state_version: 1,
      updated_at: new Date().toISOString(),
      ...updates,
    };
    all.push(updatedState);
  }

  await fs.writeFile(ROOM_STATE_FILE, JSON.stringify(all, null, 2), 'utf-8');
  return updatedState;
}

// ── Favourites Data ──────────────────────────────────────────────────────────

/**
 * Retrieves the favorite song IDs for a specific user.
 */
export async function getLocalFavorites(userId: string): Promise<string[]> {
  try {
    await ensureDirs();
    if (!fsSync.existsSync(FAVORITES_FILE)) {
      return [];
    }
    const data = await fs.readFile(FAVORITES_FILE, 'utf-8');
    const allFavs: Record<string, string[]> = JSON.parse(data);
    return Array.isArray(allFavs[userId]) ? allFavs[userId] : [];
  } catch (err) {
    console.error('[LocalStorage] Failed to read favorites:', err);
    return [];
  }
}

/**
 * Persists the favorite song IDs for a specific user.
 */
export async function saveLocalFavorites(userId: string, songIds: string[]): Promise<string[]> {
  try {
    await ensureDirs();
    let allFavs: Record<string, string[]> = {};
    if (fsSync.existsSync(FAVORITES_FILE)) {
      try {
        const data = await fs.readFile(FAVORITES_FILE, 'utf-8');
        allFavs = JSON.parse(data);
      } catch {
        allFavs = {};
      }
    }
    const unique = Array.from(new Set(songIds));
    allFavs[userId] = unique;
    await fs.writeFile(FAVORITES_FILE, JSON.stringify(allFavs, null, 2), 'utf-8');
    return unique;
  } catch (err) {
    console.error('[LocalStorage] Failed to save favorites:', err);
    return songIds;
  }
}

/**
 * Toggles a song favorite status for a user.
 */
export async function toggleLocalFavorite(
  userId: string,
  songId: string
): Promise<{ songIds: string[]; isFavorited: boolean }> {
  const current = await getLocalFavorites(userId);
  const exists = current.includes(songId);
  const updated = exists ? current.filter((id) => id !== songId) : [songId, ...current];
  await saveLocalFavorites(userId, updated);
  return { songIds: updated, isFavorited: !exists };
}

