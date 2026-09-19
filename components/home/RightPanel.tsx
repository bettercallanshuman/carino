'use client';

import { useState, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUIStore } from '@/stores/uiStore';
import { getCoverUrl } from '@/lib/supabase/storage';
import { CoverImage } from '@/components/ui/CoverImage';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Lyrics Drawer (Dedicated Right Panel)
// Evolved to a dedicated, sliding/floating lyrics surface:
// - Geometric corners: top-left & bottom-left are ROUNDED (facing central dashboard)
//   top-right & bottom-right are SQUARE (flush with viewport)
// - Slides in from the right edge when opened; hidden when closed so the
//   main dashboard receives full available width.
// - Clean typography, intentional empty state, and Karaoke entry point.
// - Responsive adaptation: slides up as a smooth sheet on narrow mobile viewports.
// - Exports both `LyricsDrawer` and `RightPanel` alias for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

export function LyricsDrawer() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isOpen = useUIStore((state) => state.isLyricsDrawerOpen);
  const setIsOpen = useUIStore((state) => state.setIsLyricsDrawerOpen);

  const [karaokeToast, setKaraokeToast] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Synchronize drawer-open class on #app-root to push main content and align MiniPlayer
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.getElementById('app-root');
      if (root) {
        if (isOpen && !isMobile) {
          root.classList.add('drawer-open');
        } else {
          root.classList.remove('drawer-open');
        }
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        const root = document.getElementById('app-root');
        if (root) root.classList.remove('drawer-open');
      }
    };
  }, [isOpen, isMobile]);

  const handleKaraokeClick = () => {
    setKaraokeToast(true);
    setTimeout(() => setKaraokeToast(false), 2400);
  };

  const coverUrl = currentTrack ? getCoverUrl(currentTrack.cover_url || currentTrack.cover_path) : null;

  return (
    <>
      {/* Mobile backdrop dimming when open */}
      {isMobile && isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 44,
            transition: 'opacity 0.25s ease',
          }}
          aria-hidden="true"
        />
      )}

      <aside
        className="lyrics-drawer"
        aria-label="Lyrics and Karaoke Drawer"
        aria-hidden={!isOpen}
        style={{
          position: 'fixed',
          top: isMobile ? 'auto' : 0,
          bottom: 0,
          right: 0,
          left: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : '380px',
          maxWidth: isMobile ? '100%' : 'calc(100vw - 40px)',
          height: isMobile ? '82dvh' : '100dvh',
          zIndex: 45,
          background: 'rgba(12, 12, 14, 0.92)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          // Corner geometry: ONLY dashboard-facing corners are rounded
          borderTopLeftRadius: '24px',
          borderBottomLeftRadius: isMobile ? 0 : '24px',
          borderTopRightRadius: isMobile ? '24px' : 0,
          borderBottomRightRadius: 0,
          borderLeft: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          borderBottom: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.04)',
          borderRight: 'none',
          boxShadow: isMobile
            ? '0 -8px 36px rgba(0, 0, 0, 0.75)'
            : '-10px 0 36px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          transform: isMobile
            ? isOpen
              ? 'translateY(0)'
              : 'translateY(105%)'
            : isOpen
              ? 'translateX(0)'
              : 'translateX(105%)',
          transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          userSelect: 'none',
        }}
      >
        {/* ── Mobile Grab Handle ───────────────────────────────────────────── */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
            <div
              style={{
                width: '36px',
                height: '4px',
                borderRadius: '2px',
                background: 'rgba(255, 255, 255, 0.2)',
              }}
            />
          </div>
        )}

        {/* ── Header: Title, Karaoke Entry Point & Close Control ───────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Lyrics
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* ── Karaoke Entry Point ───────────────────────────────────────── */}
            <button
              onClick={handleKaraokeClick}
              title="Karaoke Mode (Entry point)"
              aria-label="Karaoke Mode"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 13px',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              <span>Karaoke</span>
            </button>

            {/* ── Close Drawer Control ────────────────────────────────────── */}
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close Lyrics Drawer"
              title="Close"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#8E8E93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.color = '#8E8E93';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Toast notification for Karaoke Entry Point ───────────────────── */}
        {karaokeToast && (
          <div
            style={{
              padding: '8px 16px',
              margin: '8px 20px 0',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#FFFFFF',
              fontSize: '12px',
              textAlign: 'center',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            🎤 Karaoke mode is coming soon to Cariño!
          </div>
        )}

        {/* ── Active Track Summary ─────────────────────────────────────────── */}
        {currentTrack && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '16px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#18181A',
                position: 'relative',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {coverUrl ? (
                <CoverImage
                  src={coverUrl}
                  alt={currentTrack.title}
                  fill
                  sizes="44px"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/carino-symbol.svg"
                    alt=""
                    style={{ width: '100%', height: '100%', opacity: 0.35 }}
                  />
                </div>
              )}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em',
                }}
              >
                {currentTrack.title}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: '#8E8E93',
                  margin: '2px 0 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentTrack.artist}
              </p>
            </div>
          </div>
        )}

        {/* ── Lyrics Content Area ──────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '36px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {currentTrack ? (
            <div style={{ maxWidth: '280px' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  margin: '0 auto 20px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/carino-symbol.svg"
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.4,
                    filter: 'grayscale(100%) brightness(1.2)',
                  }}
                />
              </div>

              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  letterSpacing: '-0.01em',
                  margin: '0 0 8px',
                  lineHeight: 1.4,
                }}
              >
                Lyrics aren&apos;t available for this track yet.
              </h3>
              <p
                style={{
                  fontSize: '13px',
                  color: '#8E8E93',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Enjoy the music or sing along with instrumental playback in Karaoke mode.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: '260px' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  margin: '0 auto 20px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/carino-symbol.svg"
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.3,
                    filter: 'grayscale(100%)',
                  }}
                />
              </div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  letterSpacing: '-0.01em',
                  margin: '0 0 6px',
                }}
              >
                No song selected
              </h3>
              <p style={{ fontSize: '13px', color: '#8E8E93', margin: 0, lineHeight: 1.4 }}>
                Choose a track from your library to read lyrics while listening.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// Export drop-in alias to preserve compatibility across all existing pages
export const RightPanel = LyricsDrawer;
