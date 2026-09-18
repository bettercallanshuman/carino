
// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Storage Helpers (Private Buckets Architecture)
// Handles signed uploads and signed URL generation for private 'covers' & 'audio'.
// ─────────────────────────────────────────────────────────────────────────────

export const BUCKET_COVERS = 'covers';
export const BUCKET_AUDIO = 'audio';

/**
 * Returns the exact MIME type for any uploaded cover image.
 * Respects browser-reported type when present, and provides accurate fallback
 * mapping for JPEG, PNG, SVG, WEBP, GIF, AVIF, BMP, ICO, and TIFF.
 */
export function getImageMimeType(file: File): string {
  if (file.type && file.type.startsWith('image/')) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return file.type || 'image/jpeg';
  }
}

/**
 * Determines whether the image format must be rendered unoptimized
 * (e.g. SVG for vector fidelity, GIF for animated frames, blob/data URIs).
 */
export function isUnoptimizedFormat(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.includes('.svg') ||
    lower.includes('image/svg+xml') ||
    lower.includes('.gif') ||
    lower.includes('image/gif') ||
    lower.includes('.ico') ||
    lower.includes('.bmp')
  );
}

/**
 * Returns a secure, valid, accessible URL for a song cover image.
 * Guarantees that the returned string is either a valid absolute URL (http/https/blob/data)
 * or a valid root-relative URL (/api/media... or /icons/...).
 * Next.js <Image> will never throw "Failed to construct URL: Invalid URL" when given this output.
 */
export function getCoverUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string' || !path.trim()) {
    return '/icons/icon-192.png';
  }

  const clean = path.trim();

  // 1. Data URL or Blob URL (e.g. active file selection preview) -> preserve unchanged
  if (clean.startsWith('data:') || clean.startsWith('blob:')) {
    return clean;
  }

  // 2. Compatibility: If the value is already an /api/media URL, extract and normalize its path param
  if (clean.includes('/api/media') && clean.includes('path=')) {
    try {
      const dummyUrl = clean.startsWith('http')
        ? new URL(clean)
        : new URL(clean, 'http://localhost');
      const extractedPath = dummyUrl.searchParams.get('path');
      const extractedBucket = dummyUrl.searchParams.get('bucket') || BUCKET_COVERS;
      if (extractedPath) {
        return `/api/media?bucket=${extractedBucket}&path=${encodeURIComponent(extractedPath.replace(/^\/+/, ''))}`;
      }
    } catch {
      // Fall through if parsing fails
    }
  }

  // 3. If already a root-relative path (e.g. /covers/..., /icons/...)
  if (clean.startsWith('/')) {
    return clean;
  }

  // 4. Absolute HTTP/HTTPS URL (e.g. Google OAuth photo or remote CDN)
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      new URL(clean);
      return clean;
    } catch {
      return '/icons/icon-192.png';
    }
  }

  // 5. Raw Supabase Storage path (e.g., "<user-id>/avatar_<timestamp>.<ext>")
  const sanitizedPath = clean.replace(/^\/+/, '');
  if (!sanitizedPath) {
    return '/icons/icon-192.png';
  }

  // Route to the signed media endpoint for private bucket resolution
  return `/api/media?bucket=${BUCKET_COVERS}&path=${encodeURIComponent(sanitizedPath)}`;
}

/**
 * Returns a secure playback URL for an audio file.
 * If path is already a full/local URL or signed URL, returns as-is.
 * For private Supabase storage paths, points to the signed media proxy.
 */
export function getAudioUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string' || !path.trim()) {
    return '';
  }

  const clean = path.trim();

  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('blob:') ||
    clean.startsWith('/')
  ) {
    return clean;
  }

  const sanitizedPath = clean.replace(/^\/+/, '');
  if (!sanitizedPath) return '';

  // Route to the signed media endpoint for private bucket resolution
  return `/api/media?bucket=${BUCKET_AUDIO}&path=${encodeURIComponent(sanitizedPath)}`;
}

/**
 * Uploads a cover image file to the private 'covers' storage bucket.
 * Uses authenticated /api/upload/file with server admin verification and Supabase SSR client.
 */
export async function uploadCover(
  file: File
): Promise<{ path?: string; url?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('bucket', BUCKET_COVERS);
    formData.append('file', file);

    const res = await fetch('/api/upload/file', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Failed to upload cover artwork' };
    }

    const data = await res.json();
    return {
      path: data.path,
      url: data.url || `/api/media?bucket=${BUCKET_COVERS}&path=${encodeURIComponent(data.path)}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown cover upload error' };
  }
}

/**
 * Uploads an audio file to the private 'audio' storage bucket.
 * Uses authenticated /api/upload/file with server admin verification and Supabase SSR client.
 */
export async function uploadAudio(
  file: File
): Promise<{ path?: string; url?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('bucket', BUCKET_AUDIO);
    formData.append('file', file);

    const res = await fetch('/api/upload/file', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Failed to upload audio file' };
    }

    const data = await res.json();
    return {
      path: data.path,
      url: data.url || `/api/media?bucket=${BUCKET_AUDIO}&path=${encodeURIComponent(data.path)}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown audio upload error' };
  }
}
