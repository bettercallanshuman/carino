import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Dev Mode Login Bridge
// Active ONLY in development or when Supabase project keys are unconfigured.
// Mints an HTTP-only session cookie so real browser testing across Chrome,
// Brave Incognito, and cross-tab can be performed immediately without manual
// OAuth provider credentials in local test setups.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { role = 'user', name, email, avatar_url } = body;

    const actualRole = role === 'admin' ? 'admin' : 'user';
    const actualName = name || (actualRole === 'admin' ? 'Anshuman (Admin)' : 'Guest Listener');
    const actualEmail = email || (actualRole === 'admin' ? (process.env.ADMIN_EMAIL || 'iam.anshumannn@gmail.com') : 'listener@carino.app');
    const actualId = body.id || (actualRole === 'admin' ? '0fd43c02-58c1-4bae-a51b-57ef78b9450a' : '00000000-0000-0000-0000-000000000002');

    const sessionPayload = {
      id: actualId,
      email: actualEmail,
      display_name: actualName,
      avatar_url: avatar_url || null,
      gender: 'Not specified',
      date_of_birth: '2000-01-01',
      role: actualRole,
    };

    const encoded = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');
    const cookieStore = await cookies();

    cookieStore.set('carino_dev_session', encoded, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      success: true,
      user: {
        ...sessionPayload,
        isAdmin: actualRole === 'admin',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dev login failed' },
      { status: 500 }
    );
  }
}
