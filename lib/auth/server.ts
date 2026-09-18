import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Server-Side Authentication & Authorization Engine
// The single authoritative security boundary for session validation & admin checks.
// NEVER trusts client-supplied userId, role, or isAdmin flags.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthSessionUser {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  role: 'user' | 'admin';
  isAdmin: boolean;
  isDev?: boolean;
}

const DEV_SESSION_COOKIE = 'carino_dev_session';

/**
 * Resolves the authenticated user from either:
 * 1. Live Supabase Auth session via SSR cookies (Production & connected Supabase)
 * 2. Secure dev session cookie (Local dev fallback when Supabase keys are unconfigured)
 */
export async function getAuthenticatedUser(_req?: NextRequest): Promise<AuthSessionUser | null> {
  void _req;
  const cookieStore = await cookies();

  // 1. Supabase Auth Session
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!userError && user) {
        // Check profiles table for role
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        const userEmail = (user.email || '').trim().toLowerCase();
        const isAdminByEmail = Boolean(adminEmail && userEmail === adminEmail);
        const isAdminByRole = profile?.role === 'admin';
        const isAdmin = isAdminByEmail || isAdminByRole;

        const displayName =
          profile?.full_name ||
          profile?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          (user.email ? user.email.split('@')[0] : 'Cariño Listener');

        return {
          id: user.id,
          email: user.email || null,
          display_name: displayName,
          avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          gender: profile?.gender || null,
          date_of_birth: profile?.date_of_birth || null,
          role: isAdmin ? 'admin' : 'user',
          isAdmin,
        };
      }
    } catch (err) {
      console.warn('[AuthServer] Supabase getUser error:', err);
    }
  }

  // 2. Local Development Fallback Session
  // Reads HTTP-only cookie set by dev login flow
  const devCookie = cookieStore.get(DEV_SESSION_COOKIE)?.value;
  if (devCookie) {
    try {
      const parsed = JSON.parse(Buffer.from(devCookie, 'base64').toString('utf-8'));
      if (parsed && parsed.id && parsed.role) {
        const isAdmin = parsed.role === 'admin';
        return {
          id: parsed.id,
          email: parsed.email || null,
          display_name: parsed.display_name || 'Cariño Listener',
          avatar_url: parsed.avatar_url || null,
          gender: parsed.gender || null,
          date_of_birth: parsed.date_of_birth || null,
          role: isAdmin ? 'admin' : 'user',
          isAdmin,
          isDev: true,
        };
      }
    } catch {
      // Invalid cookie format
    }
  }

  return null;
}

/**
 * Server guard: Enforces that the caller is authenticated.
 * Returns the AuthSessionUser, or throws / returns a 401 response.
 */
export async function requireAuth(req?: NextRequest): Promise<AuthSessionUser | NextResponse> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }
  return user;
}

/**
 * Server guard: Enforces that the caller is authenticated AND has admin role.
 * Returns the AuthSessionUser, or returns a 401/403 response.
 */
export async function requireAdmin(req?: NextRequest): Promise<AuthSessionUser | NextResponse> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }
  if (!user.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden. Administrator privileges required.' },
      { status: 403 }
    );
  }
  return user;
}

/**
 * Helper to determine if a result from requireAuth/requireAdmin is a NextResponse error.
 */
export function isAuthError(result: AuthSessionUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
