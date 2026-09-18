import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    return NextResponse.json({
      authenticated: Boolean(user),
      user: user || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve session' },
      { status: 500 }
    );
  }
}
