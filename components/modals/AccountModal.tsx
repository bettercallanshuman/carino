'use client';

import { useState, useEffect } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAuthStore } from '@/stores/authStore';
import { getCoverUrl } from '@/lib/supabase/storage';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Manage Your Account Modal
// Account fields:
// - name
// - profile picture (maximum 1 MB, validates file size)
// - gender
// - date of birth
// - Log Out button
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AVATAR_SIZE = 1024 * 1024; // 1 MB

export function AccountModal() {
  const isOpen = useLibraryStore((state) => state.isAccountModalOpen);
  if (!isOpen) return null;
  return <AccountModalContent />;
}

function AccountModalContent() {
  const setIsOpen = useLibraryStore((state) => state.setIsAccountModalOpen);
  const userProfile = useLibraryStore((state) => state.userProfile);
  const setUserProfile = useLibraryStore((state) => state.setUserProfile);

  const authUser = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const refreshSession = useAuthStore((state) => state.refreshSession);

  const [name, setName] = useState(authUser?.display_name || userProfile.name);
  const [gender, setGender] = useState(authUser?.gender || userProfile.gender || 'Prefer not to say');
  const [dateOfBirth, setDateOfBirth] = useState(authUser?.date_of_birth || userProfile.date_of_birth || '2000-01-01');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(authUser?.avatar_url || userProfile.avatar_url);
  const [imageError, setImageError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Fetch fresh profile directly from Supabase /api/account on open
  useEffect(() => {
    async function loadAccount() {
      try {
        const res = await fetch('/api/account');
        if (res.ok) {
          const data = await res.json();
          if (data.name) setName(data.name);
          if (data.gender) setGender(data.gender);
          if (data.date_of_birth) setDateOfBirth(data.date_of_birth);
          if (data.avatar_url) {
            setAvatarPreview(data.avatar_url);
            setImageError(false);
          }
        }
      } catch {
        // Fall back to existing authUser store values
      }
    }
    loadAccount();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WEBP, GIF).');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setErrorMessage('Profile picture must be 1 MB or smaller.');
      e.target.value = '';
      return;
    }

    setAvatarFile(file);
    setImageError(false);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('gender', gender.trim());
      formData.append('date_of_birth', dateOfBirth.trim());
      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const res = await fetch('/api/account', {
        method: 'PATCH',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update account');
      }

      setUserProfile(data);
      await refreshSession();
      setIsOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        padding: '20px',
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
              Manage Your Account
            </h2>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '4px 0 0' }}>
              Update your Cariño personal profile
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#8E8E93',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              fontSize: '12px',
              fontWeight: 500,
              marginBottom: '16px',
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Avatar Preview & Upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#222226',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
                color: '#FFFFFF',
                flexShrink: 0,
                border: '2px solid #FFFFFF',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)',
              }}
            >
              {avatarPreview && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getCoverUrl(avatarPreview)}
                  alt="Avatar"
                  onError={() => setImageError(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (name || 'A').charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'inline-block',
                  padding: '7px 14px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                Change Picture
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ fontSize: '11px', color: '#8E8E93', margin: '4px 0 0' }}>
                Maximum size: 1 MB
              </p>
            </div>
          </div>

          {/* Name Field */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '6px' }}>
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#1A1A1A',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Gender Field */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '6px' }}>
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#1A1A1A',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          {/* Date of Birth Field */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#D1D1D6', marginBottom: '6px' }}>
              Date of Birth
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#1A1A1A',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Action Buttons: Sign Out on Left, Cancel & Save on Right */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={async () => {
                setIsLoggingOut(true);
                await signOut();
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#F87171',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isLoggingOut ? 'default' : 'pointer',
                opacity: isLoggingOut ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              className="press"
            >
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  background: 'transparent',
                  border: 'none',
                  color: '#8E8E93',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  background: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isSaving ? 'default' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
