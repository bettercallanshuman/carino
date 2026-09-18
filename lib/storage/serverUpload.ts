import { getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { saveLocalFile, deleteLocalFile } from '@/lib/storage/local';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Server-Side Storage Upload & Management Utility
// Safely handles file uploads inside Next.js Server Route Handlers without
// performing internal HTTP loopbacks or encountering URL parsing errors.
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerUploadResult {
  path?: string;
  url?: string;
  error?: string;
}

/**
 * Uploads a file buffer directly to storage (Supabase private bucket or local dev storage).
 * Safe for server-side route execution (Node.js runtime).
 */
export async function uploadServerMedia(
  bucket: 'audio' | 'covers',
  file: File
): Promise<ServerUploadResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Local storage dev mode (fallback)
    if (!isSupabaseConfigured()) {
      const storageKey = await saveLocalFile(bucket, file.name, buffer);
      return {
        path: storageKey,
        url: `/api/media?bucket=${bucket}&path=${encodeURIComponent(storageKey)}`,
      };
    }

    // 2. Direct Supabase Storage upload using Service Role Key
    const supabase = getServiceRoleClient();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `${bucket}_${Date.now()}_${cleanName}`;
    const contentType = file.type || (bucket === 'covers' ? 'image/jpeg' : 'audio/mpeg');

    const { error } = await supabase.storage.from(bucket).upload(storageKey, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      return { error: error.message };
    }

    return {
      path: storageKey,
      url: `/api/media?bucket=${bucket}&path=${encodeURIComponent(storageKey)}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Server-side media upload failed' };
  }
}

/**
 * Permanently deletes media from storage by path or storage key.
 */
export async function deleteServerMedia(
  bucket: 'audio' | 'covers',
  storagePathOrUrl: string
): Promise<boolean> {
  if (!storagePathOrUrl) return false;

  try {
    // Extract storage key if a full media URL was provided
    let storageKey = storagePathOrUrl;
    if (storageKey.includes('/api/media')) {
      const url = new URL(storageKey, 'http://localhost');
      storageKey = url.searchParams.get('path') || storageKey;
    }
    storageKey = decodeURIComponent(storageKey).replace(/^\/+/, '');

    if (!isSupabaseConfigured()) {
      return await deleteLocalFile(bucket, storageKey);
    }

    const supabase = getServiceRoleClient();
    const { error } = await supabase.storage.from(bucket).remove([storageKey]);
    return !error;
  } catch (err) {
    console.warn(`[ServerStorage] Failed to delete media ${storagePathOrUrl}:`, err);
    return false;
  }
}
