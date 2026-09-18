import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Edge Middleware: Authentication & Route Protection
// Protects the main application, listener rooms, and admin areas.
// Automatically redirects unauthenticated visitors to /login.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.webmanifest', '.mp3', '.wav', '.json'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets and system routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  ) {
    return NextResponse.next();
  }

  // 2. Allow public auth routes
  if (
    pathname === '/login' ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(
    supabaseUrl &&
    !supabaseUrl.includes('your-project.supabase.co') &&
    supabaseKey &&
    !supabaseKey.includes('your-anon-key-here') &&
    supabaseKey !== 'sb_publishable_...'
  );

  let isAuthenticated = false;
  let isAdmin = false;

  // Check Supabase Auth session via SSR cookies
  if (isConfigured) {
    try {
      const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        isAuthenticated = true;

        const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const userEmail = (user.email || '').trim().toLowerCase();
        if (adminEmail && userEmail === adminEmail) {
          isAdmin = true;
        } else {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.role === 'admin') {
            isAdmin = true;
          }
        }
      }
    } catch (err) {
      console.warn('[Middleware] Supabase auth check notice:', err);
    }
  }

  // Check Dev Session cookie fallback (for local development)
  if (!isAuthenticated) {
    const devCookie = request.cookies.get('carino_dev_session')?.value;
    if (devCookie) {
      try {
        const parsed = JSON.parse(Buffer.from(devCookie, 'base64').toString('utf-8'));
        if (parsed && parsed.id) {
          isAuthenticated = true;
          isAdmin = parsed.role === 'admin';
        }
      } catch {
        // Invalid dev cookie
      }
    }
  }

  // 3. Unauthenticated Gate: Redirect to /login
  if (!isAuthenticated) {
    // For API routes, return 401 JSON rather than HTML redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required.' },
        { status: 401 }
      );
    }

    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Admin-Only Page Route Gate (/cockpit, /admin, /upload)
  if (
    pathname === '/cockpit' ||
    pathname.startsWith('/cockpit/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/upload' ||
    pathname.startsWith('/upload/')
  ) {
    if (!isAdmin) {
      // Normal users are rejected and redirected to home
      return NextResponse.redirect(new URL('/?error=forbidden_admin_only', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
