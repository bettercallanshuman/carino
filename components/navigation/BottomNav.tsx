'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Mobile Bottom Navigation (Phase 3A)
// Refined 3-item mobile persistent navigation surface:
// - LEFT: Home (with translucent circular surface)
// - CENTER: Join Party (canonical white pill button)
// - RIGHT: More (with translucent circular surface, opens More popover)
// - Frosted glass: translucent (72%), backdrop-blur (24px), rounded (22px), floating
// - Secondary destinations in More: Albums, Tracks, Favourites, Genres,
//   Recently Played, Playlists, Listening Room
// - STRICTLY mobile-only (<= 900px). Returns null / hidden on desktop.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  color: string;
  icon: (active: boolean, color: string) => React.ReactNode;
}

const secondaryNavItems: NavItem[] = [
  {
    href: '/albums',
    label: 'Albums',
    color: '#38BDF8',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={active ? color : 'currentColor'} strokeWidth={active ? '1.5' : '2'} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
  },
  {
    href: '/tracks',
    label: 'Tracks',
    color: '#F87171',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? color : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" fill={active ? color : 'none'} />
        <circle cx="18" cy="16" r="3" fill={active ? color : 'none'} />
      </svg>
    ),
  },
  {
    href: '/favorites',
    label: 'Favourite Tracks',
    color: '#4ADE80',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? color : 'none'} stroke={active ? color : 'currentColor'} strokeWidth={active ? '1.5' : '2'} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    href: '/genres',
    label: 'Genres',
    color: '#3B82F6',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? color : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h6" />
      </svg>
    ),
  },
  {
    href: '/recently-played',
    label: 'Recently Played',
    color: '#C084FC',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? color : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: '/playlists',
    label: 'Playlists',
    color: '#FB923C',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? color : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="14" y="3" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="3" y="14" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="14" y="14" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
      </svg>
    ),
  },
  {
    href: '/room',
    label: 'Listening Room',
    color: '#E4E4E7',
    icon: (active, color) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? color : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isHomeActive = pathname === '/';
  const isMoreActive = secondaryNavItems.some((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  );

  return (
    <>
      {/* ── More Navigation Sheet Popover ─────────────────────────────────── */}
      {isMoreOpen && (
        <>
          <div
            onClick={() => setIsMoreOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              zIndex: 48,
            }}
            aria-hidden="true"
          />
          <div
            style={{
              position: 'fixed',
              bottom: 'calc(var(--safe-bottom-nav, 0px) + 76px)',
              right: '16px',
              width: '230px',
              background: 'rgba(18, 18, 22, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '18px',
              padding: '8px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75)',
              zIndex: 49,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ padding: '4px 8px 6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#8E8E93', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                More Sections
              </span>
            </div>
            {secondaryNavItems.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: active ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    border: 'none',
                    color: active ? item.color : '#8E8E93',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 500,
                    textDecoration: 'none',
                    transition: 'color 0.15s ease, background 0.15s ease',
                  }}
                >
                  <span style={{ color: active ? item.color : '#8E8E93', display: 'flex', alignItems: 'center' }}>
                    {item.icon(active, item.color)}
                  </span>
                  <span style={{ color: active ? item.color : '#8E8E93' }}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ── Floating Atmospheric Control Zone: Continuous progressive atmospheric lens ─ */}
      <div className="nav-atmosphere-zone" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {/* Layer 1: Atmospheric Diffusion (Spans 165px, starting close to the MiniPlayer bar ~33px above it) */}
        <div
          className="nav-atmosphere nav-atmosphere-outer"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: 'calc(var(--safe-bottom-nav, 0px) + 165px)',
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.02) 20%, rgba(255, 255, 255, 0.05) 45%, rgba(255, 255, 255, 0.08) 70%, rgba(255, 255, 255, 0.06) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)',
            pointerEvents: 'none',
            zIndex: 34,
          }}
        />

        {/* Layer 2: Core Continuous Frost Lens (Spans 165px, deep blur through MiniPlayer, nav & bottom) */}
        <div
          className="nav-atmosphere nav-atmosphere-core"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: 'calc(var(--safe-bottom-nav, 0px) + 165px)',
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.02) 20%, rgba(255, 255, 255, 0.03) 40%, rgba(255, 255, 255, 0.06) 70%, rgba(255, 255, 255, 0.04) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 15%, black 40%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 15%, black 40%, black 100%)',
            pointerEvents: 'none',
            zIndex: 35,
          }}
        />
      </div>

      {/* ── Floating Navigation Controls Layer (PURE layout coordinator, NO bar/card/pill) ─ */}
      <nav
        className="nav-area"
        aria-label="Mobile Navigation"
        style={{
          position: 'fixed',
          bottom: 'calc(var(--safe-bottom-nav, 0px) + 12px)',
          left: '16px',
          right: '16px',
          maxWidth: '500px',
          margin: '0 auto',
          height: '52px',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          borderRadius: 0,
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 0,
          zIndex: 38,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {/* LEFT: Independent Home Translucent Circle */}
        <Link
          href="/"
          aria-current={isHomeActive ? 'page' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            textDecoration: 'none',
            color: isHomeActive ? '#FEF08A' : '#8E8E93',
            pointerEvents: 'auto',
            transition: 'transform 0.15s ease, color 0.15s ease',
          }}
          className="press"
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isHomeActive ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
              border: isHomeActive ? '1px solid rgba(255, 255, 255, 0.24)' : '1px solid rgba(255, 255, 255, 0.10)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={isHomeActive ? '#FEF08A' : 'none'}
              stroke={isHomeActive ? '#FEF08A' : 'currentColor'}
              strokeWidth={isHomeActive ? '1.5' : '2'}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: isHomeActive ? 700 : 500,
              letterSpacing: '-0.01em',
              color: isHomeActive ? '#FEF08A' : '#8E8E93',
            }}
          >
            Home
          </span>
        </Link>

        {/* CENTER: Independent Join Party White Rounded Button */}
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
            padding: '10px 24px',
            borderRadius: '9999px',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(255, 255, 255, 0.2)',
            transition: 'transform 0.15s ease, opacity 0.15s ease',
            whiteSpace: 'nowrap',
            pointerEvents: 'auto',
          }}
          className="press"
        >
          Join Party
        </Link>

        {/* RIGHT: Independent More Translucent Circle */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          aria-label="More navigation options"
          title="More"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isMoreActive || isMoreOpen ? '#FFFFFF' : '#8E8E93',
            pointerEvents: 'auto',
            transition: 'transform 0.15s ease, color 0.15s ease',
          }}
          className="press"
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isMoreOpen || isMoreActive ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
              border: isMoreOpen || isMoreActive ? '1px solid rgba(255, 255, 255, 0.24)' : '1px solid rgba(255, 255, 255, 0.10)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1.3" fill="currentColor" />
              <circle cx="18" cy="12" r="1.3" fill="currentColor" />
              <circle cx="6" cy="12" r="1.3" fill="currentColor" />
            </svg>
          </div>
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: isMoreActive || isMoreOpen ? 700 : 500,
              letterSpacing: '-0.01em',
              color: isMoreActive || isMoreOpen ? '#FFFFFF' : '#8E8E93',
            }}
          >
            More
          </span>
        </button>
      </nav>
    </>
  );
}