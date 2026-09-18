import { createBrowserClient } from '@supabase/ssr';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Supabase Browser Client
// Safe for use in Client Components ('use client').
// Reads only NEXT_PUBLIC_ env vars — no server secrets exposed.
// ─────────────────────────────────────────────────────────────────────────────

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  return createBrowserClient(url, key);
}
