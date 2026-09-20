import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import { Readable } from 'stream';
import { createClient, getServiceRoleClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { getLocalFilePath } from '@/lib/storage/local';
import { getAuthenticatedUser } from '@/lib/auth/server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Signed Media Access Proxy (Server Route)
// Securely resolves private audio & covers for Authenticated users only.
// Never exposes service role key to client.
// Full support for HTTP 206 Partial Content (audio seeking & timeline scrubbing).
// ─────────────────────────────────────────────────────────────────────────────

function getMimeType(bucket: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (bucket === 'audio') {
    switch (ext) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'ogg':
      case 'oga':
        return 'audio/ogg';
      case 'flac':
        return 'audio/flac';
      case 'aac':
        return 'audio/aac';
      default:
        return 'audio/mpeg';
    }
  }
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
      return 'image/jpeg';
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get('bucket');
    const rawPath = searchParams.get('path');
    const redirect = searchParams.get('redirect') !== 'false';

    // 1. Validate bucket
    if (bucket !== 'audio' && bucket !== 'covers') {
      return NextResponse.json(
        { error: 'Invalid bucket. Only "audio" and "covers" are permitted.' },
        { status: 400 }
      );
    }

    // 2. Validate authentication
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required to access media.' },
        { status: 401 }
      );
    }

    // 2. Validate and sanitize path
    if (!rawPath || rawPath.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid storage path.' },
        { status: 400 }
      );
    }

    const path = rawPath.replace(/^\/+/, '').trim();
    if (!path) {
      return NextResponse.json(
        { error: 'Storage path is required.' },
        { status: 400 }
      );
    }

    // 3. Check local storage persistence first (for dev uploads & offline playback)
    const localFilePath = await getLocalFilePath(bucket, path);
    if (localFilePath) {
      const stat = await fs.stat(localFilePath);
      const fileSize = stat.size;
      const contentType = getMimeType(bucket, path);

      // Support Range requests (206 Partial Content) for audio seeking
      const rangeHeader = req.headers.get('range');
      if (rangeHeader && bucket === 'audio') {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
          return new Response(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
            },
          });
        }

        const chunkSize = end - start + 1;
        const nodeStream = fsSync.createReadStream(localFilePath, { start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      // Standard full response
      const nodeStream = fsSync.createReadStream(localFilePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // 4. Supabase Storage: Authenticated media retrieval
    if (isSupabaseConfigured()) {
      // Optional optimization: If a genuine service role key is configured, mint signed URL
      const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const hasRealServiceKey = Boolean(
        rawServiceKey &&
        !rawServiceKey.includes('your-service-role') &&
        rawServiceKey !== 'your-service-role-key-here'
      );

      if (hasRealServiceKey) {
        const serviceClient = getServiceRoleClient();
        const expiresIn = 3600; // 1 hour
        const { data, error } = await serviceClient.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn);

        if (!error && data?.signedUrl) {
          if (redirect) {
            const response = NextResponse.redirect(data.signedUrl, { status: 307 });
            const cacheHeader = bucket === 'covers'
              ? 'private, max-age=86400, stale-while-revalidate=604800'
              : 'private, max-age=3600';
            response.headers.set('Cache-Control', cacheHeader);
            return response;
          }

          return NextResponse.json({
            url: data.signedUrl,
            expiresIn,
          });
        }
      }

      // Authoritative authenticated retrieval using user's SSR session client:
      // Satisfies storage RLS for private 'covers' and 'audio'
      try {
        const supabase = await createClient();
        const { data: blob, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(path);

        if (!downloadError && blob) {
          const contentType = blob.type || getMimeType(bucket, path);
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const cacheHeader = bucket === 'covers'
            ? 'private, max-age=86400, stale-while-revalidate=604800'
            : 'private, max-age=3600';

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(buffer.length),
              'Cache-Control': cacheHeader,
            },
          });
        }
      } catch (dlErr) {
        console.warn('[MediaProxy] Authenticated download exception:', dlErr);
      }
    }

    // 5. Media file not found in storage -> return 404 error (do NOT redirect to fallback icon)
    return NextResponse.json(
      { error: 'Media file not found in storage.' },
      { status: 404 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
