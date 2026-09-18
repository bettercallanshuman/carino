import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/songs';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const cookieStore = await cookies();

    // 1. Sign out of Supabase Auth if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = await createClient();
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Auth Logout] Supabase signOut notice:', err);
      }
    }

    // 2. Clear dev session cookie if present
    cookieStore.delete('carino_dev_session');

    // 3. Delete any sb-* auth cookies directly
    const allCookies = cookieStore.getAll();
    for (const c of allCookies) {
      if (c.name.startsWith('sb-') || c.name.includes('supabase') || c.name === 'carino_dev_session') {
        cookieStore.delete(c.name);
      }
    }

    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Logout failed' },
      { status: 500 }
    );
  }
}
