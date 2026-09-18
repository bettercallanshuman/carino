import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Manage Your Account API
// Authoritative persistent source: Supabase (PostgreSQL public.profiles table).
// Enforces strict RLS: users can only read, insert, and update their own profile (auth.uid() = id).
// Handles avatar uploads to private covers bucket under ${authUser.id}/ path.
// Strictly enforces <= 1 MB profile image limit.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AVATAR_SIZE = 1024 * 1024; // 1 MB

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    if (isAuthError(authUser)) return authUser;

    const supabase = await createClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      name: profile?.full_name || profile?.display_name || authUser.display_name,
      avatar_url: profile?.avatar_url || authUser.avatar_url,
      gender: profile?.gender || authUser.gender || 'Not specified',
      date_of_birth: profile?.date_of_birth
        ? String(profile.date_of_birth).slice(0, 10)
        : authUser.date_of_birth || '2000-01-01',
      role: profile?.role || authUser.role,
      id: authUser.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    if (isAuthError(authUser)) return authUser;

    const supabase = await createClient();
    const contentType = req.headers.get('content-type') || '';

    let name: string | null = null;
    let gender: string | null = null;
    let dateOfBirth: string | null = null;
    let avatarUrl: string | undefined = undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const nameVal = formData.get('name');
      const genderVal = formData.get('gender');
      const dobVal = formData.get('date_of_birth');
      const file = formData.get('avatar');

      if (nameVal !== null) name = nameVal.toString().trim();
      if (genderVal !== null) gender = genderVal.toString().trim();
      if (dobVal !== null) dateOfBirth = dobVal.toString().trim();

      if (file && file instanceof File && file.size > 0) {
        // Enforce <= 1 MB validation
        if (file.size > MAX_AVATAR_SIZE) {
          return NextResponse.json(
            { error: 'Profile picture must be 1 MB or smaller.' },
            { status: 400 }
          );
        }

        // Upload avatar under the user's folder to satisfy storage RLS:
        // (storage.foldername(name))[1] = auth.uid()::text
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const ext = cleanName.split('.').pop() || 'jpg';
        const storagePath = `${authUser.id}/avatar_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from('covers')
          .upload(storagePath, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          return NextResponse.json(
            { error: uploadError.message || 'Failed to upload profile picture' },
            { status: 500 }
          );
        }

        // Store the stable Supabase Storage object path directly:
        // Format: <auth-user-id>/avatar_<timestamp>.<ext>
        avatarUrl = storagePath;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.name !== undefined) name = (body.name || '').trim();
      if (body.gender !== undefined) gender = (body.gender || '').trim();
      if (body.date_of_birth !== undefined) dateOfBirth = (body.date_of_birth || '').trim();
      if (body.avatar_url !== undefined) {
        let cleanAvatar = body.avatar_url;
        if (cleanAvatar && typeof cleanAvatar === 'string' && cleanAvatar.includes('/api/media') && cleanAvatar.includes('path=')) {
          try {
            const dummyUrl = cleanAvatar.startsWith('http') ? new URL(cleanAvatar) : new URL(cleanAvatar, 'http://localhost');
            const extracted = dummyUrl.searchParams.get('path');
            if (extracted) cleanAvatar = extracted.replace(/^\/+/, '');
          } catch {}
        }
        avatarUrl = cleanAvatar;
      }
    }

    // Build database updates
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== null) {
      dbUpdates.full_name = name;
      dbUpdates.display_name = name;
    }
    if (gender !== null) dbUpdates.gender = gender;
    if (dateOfBirth !== null) dbUpdates.date_of_birth = dateOfBirth;
    if (avatarUrl !== undefined) dbUpdates.avatar_url = avatarUrl;

    // Check if profile row already exists in Supabase
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json(
        { error: checkError.message || 'Database error checking profile' },
        { status: 500 }
      );
    }

    let updatedProfile;

    // In local dev test mode without real Supabase session, handle mock user gracefully
    if (authUser.isDev || authUser.id.startsWith('dev_')) {
      return NextResponse.json({
        name: name || authUser.display_name,
        avatar_url: avatarUrl !== undefined ? avatarUrl : authUser.avatar_url,
        gender: gender !== null ? gender : authUser.gender || 'Not specified',
        date_of_birth: dateOfBirth !== null ? dateOfBirth : authUser.date_of_birth || '2000-01-01',
        role: authUser.role,
        id: authUser.id,
      });
    }

    if (!existingProfile) {
      // Idempotent INSERT
      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          full_name: name || authUser.display_name,
          display_name: name || authUser.display_name,
          avatar_url: avatarUrl !== undefined ? avatarUrl : authUser.avatar_url,
          gender: gender !== null ? gender : authUser.gender || 'Not specified',
          date_of_birth: dateOfBirth !== null ? dateOfBirth : authUser.date_of_birth || '2000-01-01',
          role: authUser.role || 'user',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message || 'Failed to create profile' },
          { status: 500 }
        );
      }
      updatedProfile = inserted;
    } else {
      // Idempotent UPDATE
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', authUser.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'Failed to update profile' },
          { status: 500 }
        );
      }
      updatedProfile = updated;
    }

    return NextResponse.json({
      name: updatedProfile.full_name || updatedProfile.display_name,
      avatar_url: updatedProfile.avatar_url,
      gender: updatedProfile.gender,
      date_of_birth: updatedProfile.date_of_birth
        ? String(updatedProfile.date_of_birth).slice(0, 10)
        : '2000-01-01',
      role: updatedProfile.role || authUser.role,
      id: authUser.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update account' },
      { status: 500 }
    );
  }
}
