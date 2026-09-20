'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getCoverUrl } from '@/lib/supabase/storage';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — TopBar Navigation
// Rebuilt strictly according to visual reference:
// - Left: White rounded button "Join Party" (black text)
// - Center: Search bar with icon + placeholder "Type your fav song"
// - Right: User avatar + name -> opens Manage Your Account
// - Rightmost: Sphere/orb icon -> opens Manage Your Cockpit (ADMIN ONLY)
// ─────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  breadcrumb?: Array<{ label: string; href?: string }>;
  navLinks?: Array<{ label: string; href: string; active?: boolean }>;
}

export function TopBar(props: TopBarProps = {}) {
  void props;
  const router = useRouter();
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);
  const userProfile = useLibraryStore((state) => state.userProfile);
  const setIsAccountModalOpen = useLibraryStore((state) => state.setIsAccountModalOpen);
  const setIsCockpitModalOpen = useLibraryStore((state) => state.setIsCockpitModalOpen);
  const loadFavoritesFromServer = useLibraryStore((state) => state.loadFavoritesFromServer);

  const authUser = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const isLyricsDrawerOpen = useUIStore((state) => state.isLyricsDrawerOpen);

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const avatarSrc = authUser?.avatar_url || userProfile.avatar_url;
  const showAvatar = Boolean(avatarSrc && failedSrc !== avatarSrc);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync profile and favorites from authenticated session in parallel
  useEffect(() => {
    void Promise.allSettled([refreshSession(), loadFavoritesFromServer()]);
  }, [refreshSession, loadFavoritesFromServer]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      router.push(`/tracks?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  // ── Mobile Header ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          padding: 'calc(16px + var(--safe-top, 0px)) 20px 14px',
          gap: '14px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* ── Row 1: Wordmark + Avatar + Cockpit Orb ─────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: Cariño brand lockup (matches Sidebar brand lockup exactly) */}
          <Link
            href="/"
            aria-label="Cariño Home"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/carino-symbol.svg"
              alt=""
              width={21}
              height={20}
              style={{
                width: '21px',
                height: 'auto',
                display: 'block',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '21px',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: '#FFFFFF',
                lineHeight: 1,
              }}
            >
              cariño
            </span>
          </Link>

          {/* Right: Avatar + Cockpit Orb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Avatar */}
            <button
              onClick={() => setIsAccountModalOpen(true)}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#222226',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFFFFF',
                border: '1.5px solid rgba(255, 255, 255, 0.25)',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
              }}
              className="press"
              title="Manage Your Account"
              aria-label="Manage Your Account"
            >
              {showAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getCoverUrl(avatarSrc)}
                  alt={authUser?.display_name || userProfile.name}
                  onError={() => setFailedSrc(avatarSrc || '')}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (authUser?.display_name || userProfile.name || 'C').charAt(0).toUpperCase()
              )}
            </button>

            {/* Cockpit Orb (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setIsCockpitModalOpen(true)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4D4D8 50%, #52525B 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  boxShadow: '0 0 14px rgba(255, 255, 255, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: 0,
                }}
                className="press"
                title="Manage Your Cockpit"
                aria-label="Manage Your Cockpit"
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.9)',
                    filter: 'blur(1px)',
                    transform: 'translate(-3px, -3px)',
                  }}
                />
              </button>
            )}
          </div>
        </div>

        {/* ── Row 2: Full-width Search Pill ───────────────────────────────── */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: '14px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#8E8E93',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Type your fav song"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{
              width: '100%',
              height: '38px',
              background: '#121212',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '9999px',
              padding: '0 16px 0 38px',
              fontSize: '13px',
              color: '#FFFFFF',
              outline: 'none',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              e.currentTarget.style.background = '#161616';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.background = '#121212';
            }}
          />
        </div>
      </header>
    );
  }

  // ── Desktop Header ────────────────────────────────────────────────────────
  return (
    <header
      style={{
        height: 'calc(var(--topbar-h) + var(--safe-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--safe-top, 0px) 24px 0',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 20,
        gap: '16px',
      }}
    >
      {/* ── Left: Join Party Button ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Link
          href="/room"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFFFFF',
            color: '#000000',
            fontSize: '13px',
            fontWeight: 700,
            padding: '8px 20px',
            borderRadius: '9999px',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            transition: 'transform 0.15s ease, opacity 0.15s ease',
            boxShadow: '0 2px 10px rgba(255, 255, 255, 0.15)',
          }}
          className="press"
        >
          Join Party
        </Link>
      </div>

      {/* ── Center: Search Field (Shared Centerline with MiniPlayer) ───────── */}
      <div
        style={{
          position: 'absolute',
          left: isLyricsDrawerOpen
            ? 'calc(50% - 190px)'
            : '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          alignItems: 'center',
          transition: 'left 0.32s cubic-bezier(0.16, 1, 0.3, 1), transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: '14px',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            color: '#8E8E93',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Type your fav song"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{
            width: '100%',
            height: '38px',
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '9999px',
            padding: '0 16px 0 38px',
            fontSize: '13px',
            color: '#FFFFFF',
            outline: 'none',
            transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.background = '#161616';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.background = '#121212';
          }}
        />
      </div>

      {/* ── Right: User Area + Cockpit Orb ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        {/* User Avatar + Name */}
        <button
          onClick={() => setIsAccountModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '9999px',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          className="press"
          title="Manage Your Account"
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#222226',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              color: '#FFFFFF',
              border: '1.5px solid #FFFFFF',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
              flexShrink: 0,
            }}
          >
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getCoverUrl(avatarSrc)}
                alt={authUser?.display_name || userProfile.name}
                onError={() => setFailedSrc(avatarSrc || '')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              (authUser?.display_name || userProfile.name || 'C').charAt(0).toUpperCase()
            )}
          </div>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '-0.01em',
            }}
          >
            {authUser?.display_name || userProfile.name || 'Listener'}
          </span>
        </button>

        {/* Rightmost: Sphere / Orb Control (Strictly visible only for authenticated admin) */}
        {isAdmin && (
          <button
            onClick={() => setIsCockpitModalOpen(true)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #FFFFFF 0%, #D4D4D8 50%, #52525B 100%)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 0 14px rgba(255, 255, 255, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              flexShrink: 0,
            }}
            className="press"
            title="Manage Your Cockpit"
            aria-label="Manage Your Cockpit"
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.9)',
                filter: 'blur(1px)',
                transform: 'translate(-4px, -4px)',
              }}
            />
          </button>
        )}
      </div>
    </header>
  );
}
