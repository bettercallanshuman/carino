'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Sidebar (Floating Left Navigation)
// Evolved to a detached, floating navigation surface:
// - Geometric corners: top-left & bottom-left are SQUARE (flush with viewport)
//   top-right & bottom-right are ROUNDED (facing central dashboard)
// - Translucent dark backdrop with subtle border & depth
// - Route-specific subtle accent lighting on active destination:
//   Home: soft yellow (#FEF08A), Albums: sky blue (#38BDF8),
//   Tracks: red (#F87171), Genres: blue (#3B82F6),
//   Recently Played: violet (#A855F7), Favourites: green (#4ADE80),
//   Playlists: orange (#FB923C)
// - Inactive items remain monochrome & restrained
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  color: string;
  icon: (active: boolean, color: string) => React.ReactNode;
}

const browseItems: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    color: '#FEF08A',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={active ? color : 'none'}
        stroke={active ? color : 'currentColor'}
        strokeWidth={active ? '1.5' : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/albums',
    label: 'Albums',
    color: '#38BDF8',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={active ? color : 'none'}
        stroke={active ? color : 'currentColor'}
        strokeWidth={active ? '1.5' : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? color : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" fill={active ? color : 'none'} />
        <circle cx="18" cy="16" r="3" fill={active ? color : 'none'} />
      </svg>
    ),
  },
  {
    href: '/genres',
    label: 'Genres',
    color: '#3B82F6',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? color : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h6" />
      </svg>
    ),
  },
];

const secondaryItems: NavItem[] = [
  {
    href: '/recently-played',
    label: 'Recently Played',
    color: '#A855F7',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? color : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: '/favorites',
    label: 'Favourite Tracks',
    color: '#4ADE80',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={active ? color : 'none'}
        stroke={active ? color : 'currentColor'}
        strokeWidth={active ? '1.5' : '2'}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    href: '/playlists',
    label: 'Playlists',
    color: '#FB923C',
    icon: (active, color) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? color : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="14" y="3" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="3" y="14" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
        <rect x="14" y="14" width="7" height="7" rx="1.5" fill={active ? color : 'none'} />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="sidebar-area"
      style={{
        background: 'rgba(10, 10, 12, 0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: '24px',
        borderBottomRightRadius: '24px',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        borderLeft: 'none',
        padding: 'calc(24px + var(--safe-top, 0px)) 16px 24px',
        userSelect: 'none',
        boxShadow: '4px 0 28px rgba(0, 0, 0, 0.45)',
        zIndex: 25,
      }}
    >
      {/* ── Brand Lockup (Symbol + Wordmark) ──────────────────────────────── */}
      <div style={{ padding: '0 8px 24px', flexShrink: 0 }}>
        <Link
          href="/"
          aria-label="Cariño Home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
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
      </div>

      {/* ── Navigation List ───────────────────────────────────────────────── */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }} aria-label="Sidebar navigation">
        {/* Browse Section */}
        <p className="nav-section-label">Browse</p>
        {browseItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              style={{
                color: active ? item.color : '#8E8E93',
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: '8px 12px',
                transition: 'color 0.15s ease, opacity 0.15s ease',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: active ? item.color : '#8E8E93',
                  transition: 'color 0.15s ease',
                }}
              >
                {item.icon(active, item.color)}
              </span>
              <span style={{ fontWeight: active ? 600 : 500, color: active ? item.color : '#8E8E93' }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Lower Section */}
        <div style={{ height: '24px' }} />
        {secondaryItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              style={{
                color: active ? item.color : '#8E8E93',
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: '8px 12px',
                transition: 'color 0.15s ease, opacity 0.15s ease',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: active ? item.color : '#8E8E93',
                  transition: 'color 0.15s ease',
                }}
              >
                {item.icon(active, item.color)}
              </span>
              <span style={{ fontWeight: active ? 600 : 500, color: active ? item.color : '#8E8E93' }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
