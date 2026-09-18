'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Authentication Gateway
// Full-viewport cinematic music atmosphere · Pure black & silver typography.
// Strict Google & Apple OAuth only. Zero anonymous / guest access.
// ─────────────────────────────────────────────────────────────────────────────

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/';
  const urlError = searchParams.get('error');

  const { user, isLoading, error: storeError, signInWithGoogle, signInWithApple, refreshSession } = useAuthStore();
  const [submittingProvider, setSubmittingProvider] = useState<'google' | 'apple' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeError = actionError || (urlError ? decodeURIComponent(urlError) : storeError || null);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // If already authenticated, redirect to next destination
  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextUrl);
    }
  }, [user, isLoading, nextUrl, router]);

  const handleGoogleLogin = async () => {
    setSubmittingProvider('google');
    setActionError(null);
    try {
      await signInWithGoogle(nextUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Google authentication failed');
    } finally {
      setSubmittingProvider(null);
    }
  };

  const handleAppleLogin = async () => {
    setSubmittingProvider('apple');
    setActionError(null);
    try {
      await signInWithApple(nextUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Apple authentication failed');
    } finally {
      setSubmittingProvider(null);
    }
  };

  return (
    <main
      className="carino-auth-viewport"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        backgroundColor: '#000000',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'clamp(40px, 8vh, 80px) 24px clamp(28px, 5vh, 48px)',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        userSelect: 'none',
        fontFamily: 'var(--font-dm-sans), -apple-system, BlinkMacSystemFont, sans-serif',
        zIndex: 100,
      }}
    >
      {/* ── Atmospheric Music Background Layers ───────────────────────────── */}
      {/* 1. Deep ambient illumination */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '900px',
          height: '600px',
          background: 'radial-gradient(ellipse 900px 600px at 50% 50%, rgba(255, 255, 255, 0.028) 0%, rgba(10, 10, 14, 0.015) 55%, rgba(0, 0, 0, 0) 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* 2. Ultra-subtle acoustic warm harmonic glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '35%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px',
          height: '460px',
          background: 'radial-gradient(ellipse 700px 460px at 50% 50%, rgba(249, 115, 22, 0.016) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* 3. Concentric sound-horizon arcs (purely atmospheric vinyl reference) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '620px',
          height: '620px',
          borderRadius: '50%',
          border: '1px solid rgba(255, 255, 255, 0.025)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '880px',
          height: '880px',
          borderRadius: '50%',
          border: '1px solid rgba(255, 255, 255, 0.015)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── Top Spacer (maintains optical balance across viewport heights) ── */}
      <div style={{ flex: '1 1 0%', minHeight: '16px', zIndex: 1 }} />

      {/* ── Central Focal Stage: Cariño Brand & Authentication Actions ────── */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          padding: '0 8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Primary Cariño Brand Logo */}
        <h1 style={{ margin: 0, padding: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/carino-logo.svg"
            alt="Cariño"
            width={240}
            height={71}
            style={{
              width: 'clamp(190px, 32vw, 250px)',
              height: 'auto',
              display: 'block',
              margin: '0 auto 20px',
            }}
          />
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontSize: 'clamp(20px, 2.8vw, 24px)',
            fontWeight: 500,
            color: '#E4E4E7',
            letterSpacing: '-0.02em',
            margin: '0 0 12px 0',
            lineHeight: 1.25,
          }}
        >
          Together, apart.
        </p>

        {/* Sub-description with editorial break */}
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 17px)',
            fontWeight: 400,
            color: '#8E8E93',
            letterSpacing: '-0.01em',
            margin: '0 0 clamp(44px, 6.5vh, 60px) 0',
            lineHeight: 1.5,
            maxWidth: '360px',
          }}
        >
          A private real-time synchronized
          <br />
          music room.
        </p>

        {/* Error Alert */}
        {activeError && (
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.22)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#F87171',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              lineHeight: 1.4,
              textAlign: 'left',
              boxSizing: 'border-box',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{activeError}</span>
          </div>
        )}

        {/* Substantial, First-Class Authentication Buttons */}
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxSizing: 'border-box',
          }}
        >
          {/* Continue with Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={submittingProvider !== null}
            style={{
              width: '100%',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: '#FFFFFF',
              color: '#0A0A0A',
              border: 'none',
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              cursor: submittingProvider !== null ? 'not-allowed' : 'pointer',
              opacity: submittingProvider !== null && submittingProvider !== 'google' ? 0.5 : 1,
              transition: 'transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(255, 255, 255, 0.25) inset',
            }}
            className="press"
          >
            {submittingProvider === 'google' ? (
              <span style={{ fontSize: '15px', color: '#555555' }}>Connecting to Google...</span>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Continue with Apple */}
          <button
            onClick={handleAppleLogin}
            disabled={submittingProvider !== null}
            style={{
              width: '100%',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: '#111114',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              cursor: submittingProvider !== null ? 'not-allowed' : 'pointer',
              opacity: submittingProvider !== null && submittingProvider !== 'apple' ? 0.5 : 1,
              transition: 'transform 0.15s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
            }}
            className="press"
          >
            {submittingProvider === 'apple' ? (
              <span style={{ fontSize: '15px', color: '#888888' }}>Connecting to Apple...</span>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 0.6-2.65 1.35-.58.66-1.09 1.73-.95 2.76 1.01.08 2.05-.51 2.68-1.26z" />
                </svg>
                <span>Continue with Apple</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Bottom Footer with Factual Statement ─────────────────────────── */}
      <div
        style={{
          flex: '1 1 0%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingTop: '32px',
          zIndex: 1,
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: '#52525B',
            letterSpacing: '0.015em',
            margin: 0,
            textAlign: 'center',
          }}
        >
          Private listening, authenticated securely.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="carino-auth-viewport"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888888',
            fontFamily: 'var(--font-dm-sans), sans-serif',
            zIndex: 100,
          }}
        >
          Loading Cariño...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
