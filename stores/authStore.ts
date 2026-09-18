'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import type { AuthSessionUser } from '@/lib/auth/server';

interface AuthState {
  user: AuthSessionUser | null;
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  signInWithGoogle: (nextUrl?: string) => Promise<void>;
  signInWithApple: (nextUrl?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  devLogin: (role: 'user' | 'admin', name?: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,
  isAdmin: false,

  refreshSession: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!res.ok) {
        set({ user: null, isAdmin: false, isLoading: false });
        return;
      }
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        set({
          user: data.user,
          isAdmin: Boolean(data.user.isAdmin),
          isLoading: false,
        });
      } else {
        set({ user: null, isAdmin: false, isLoading: false });
      }
    } catch (err) {
      set({
        user: null,
        isAdmin: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Session check failed',
      });
    }
  },

  signInWithGoogle: async (nextUrl = '/') => {
    set({ isLoading: true, error: null });
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        const msg = error.message || '';
        if (
          msg.toLowerCase().includes('provider is not enabled') ||
          msg.toLowerCase().includes('not enabled') ||
          msg.toLowerCase().includes('not configured') ||
          msg.toLowerCase().includes('unsupported provider') ||
          msg.toLowerCase().includes('disabled')
        ) {
          throw new Error(
            'Google OAuth provider is not configured or enabled in your Supabase project. Please enable Google in Supabase Dashboard → Authentication → Providers.'
          );
        }
        throw error;
      }

      if (!data?.url) {
        throw new Error('Supabase did not return a valid Google OAuth authorization URL.');
      }

      // Check if Supabase project has Google OAuth enabled before redirecting
      try {
        const probeRes = await fetch(data.url, { redirect: 'manual' });
        if (probeRes.status === 400) {
          const body = await probeRes.json().catch(() => null);
          if (body?.msg?.includes('not enabled') || body?.error_code === 'validation_failed') {
            throw new Error(
              'Google OAuth provider is not enabled in your Supabase project. Enable it in Supabase Dashboard → Authentication → Providers → Google.'
            );
          }
        }
      } catch (probeErr) {
        if (probeErr instanceof Error && probeErr.message.includes('Google OAuth provider is not enabled')) {
          throw probeErr;
        }
        // If probe fails due to CORS/network, proceed with browser redirect
      }

      window.location.href = data.url;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Google sign-in failed',
      });
    }
  },

  signInWithApple: async (nextUrl = '/') => {
    set({ isLoading: true, error: null });
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          skipBrowserRedirect: true,
          redirectTo,
        },
      });

      if (error) {
        const msg = error.message || '';
        if (
          msg.toLowerCase().includes('provider is not enabled') ||
          msg.toLowerCase().includes('not enabled') ||
          msg.toLowerCase().includes('not configured') ||
          msg.toLowerCase().includes('unsupported provider') ||
          msg.toLowerCase().includes('disabled')
        ) {
          throw new Error(
            'Apple OAuth provider is not configured or enabled in your Supabase project. Please enable Apple in Supabase Dashboard → Authentication → Providers.'
          );
        }
        throw error;
      }

      if (!data?.url) {
        throw new Error('Supabase did not return a valid Apple OAuth authorization URL.');
      }

      // Check if Supabase project has Apple OAuth enabled before redirecting
      try {
        const probeRes = await fetch(data.url, { redirect: 'manual' });
        if (probeRes.status === 400) {
          const body = await probeRes.json().catch(() => null);
          if (body?.msg?.includes('not enabled') || body?.error_code === 'validation_failed') {
            throw new Error(
              'Apple OAuth provider is not enabled in your Supabase project. Enable it in Supabase Dashboard → Authentication → Providers → Apple.'
            );
          }
        }
      } catch (probeErr) {
        if (probeErr instanceof Error && probeErr.message.includes('Apple OAuth provider is not enabled')) {
          throw probeErr;
        }
      }

      window.location.href = data.url;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Apple sign-in failed',
      });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut().catch(() => {});
      }
      // Clear client-side identity storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('carino_user_id');
        localStorage.removeItem('carino_display_name');
      }
      set({ user: null, isAdmin: false, isLoading: false });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch {
      set({ isLoading: false });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }
  },

  devLogin: async (role: 'user' | 'admin', name?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Dev login failed');
      }
      const data = await res.json();
      set({
        user: data.user,
        isAdmin: data.user.isAdmin,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Dev login error',
      });
    }
  },
}));
