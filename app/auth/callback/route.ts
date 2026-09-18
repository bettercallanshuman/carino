import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — OAuth Callback Route Handler
// Exchanges PKCE auth code for session cookies and redirects to destination.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const errorParam = searchParams.get('error_description') || searchParams.get('error');

  if (errorParam) {
    console.error('[OAuth Callback] Provider returned error:', errorParam);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_auth_code`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[OAuth Callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }

    // Ensure profile exists in public.profiles table
    if (data?.user) {
      const user = data.user;
      const displayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        (user.email ? user.email.split('@')[0] : 'Cariño Listener');
      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const userEmail = (user.email || '').trim().toLowerCase();
      const role = adminEmail && userEmail === adminEmail ? 'admin' : 'user';

      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              display_name: displayName,
              avatar_url: existingProfile?.avatar_url || avatarUrl,
              role,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
      } catch (err) {
        console.warn('[OAuth Callback] Profile upsert notice:', err);
      }
    }

    // Ensure forward slash or relative path to avoid open redirect vulnerabilities
    const targetPath = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    return NextResponse.redirect(`${origin}${targetPath}`);
  } catch (err) {
    console.error('[OAuth Callback] Unexpected error during code exchange:', err);
    return NextResponse.redirect(`${origin}/login?error=auth_unexpected_failure`);
  }
}
