'use client';

import { useState, useEffect, useRef } from 'react';
import type { Banner } from '@/types';
import { DEFAULT_BANNERS } from '@/lib/constants/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Banner Carousel
// Matches visual reference:
// - 4 banner slots
// - Each banner stays visible for 4 seconds
// - Smooth horizontal slide from RIGHT TO LEFT
// - Infinite loop
// - Curated layout with category, title, subtitle, stats, and artwork
// ─────────────────────────────────────────────────────────────────────────────

export const RECOMMENDED_BANNER_RESOLUTION = '1200 x 480 px (Aspect Ratio 2.5:1)';

export function BannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>(DEFAULT_BANNERS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load custom banners if saved
  useEffect(() => {
    async function loadBanners() {
      try {
        const res = await fetch('/api/banners');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length === 4) {
            setBanners(data);
          }
        }
      } catch (err) {
        console.warn('Could not load banners:', err);
      }
    }
    loadBanners();
  }, []);

  // 4-second right-to-left slide interval
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % 4);
    }, 4000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: '24px',
        overflow: 'hidden',
        background: '#0C0C0C',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Slide Track ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          width: '400%',
          transform: `translateX(-${currentIndex * 25}%)`,
          transition: 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {banners.map((banner, index) => {
          const hasCustomImage = Boolean(banner.image_url);

          return (
            <div
              key={banner.id || index}
              style={{
                width: '25%',
                minHeight: '280px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '36px 36px',
                background: banner.gradient || 'linear-gradient(135deg, #FF5500 0%, #D84315 100%)',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              {/* Background Image if uploaded */}
              {hasCustomImage && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${banner.image_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Gradient Overlay for legibility */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: hasCustomImage
                    ? 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.2) 100%)'
                    : 'linear-gradient(120deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
                  zIndex: 1,
                }}
              />

              {/* Top Label */}
              <div style={{ position: 'relative', zIndex: 2 }}>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255, 255, 255, 0.85)',
                    marginBottom: '8px',
                  }}
                >
                  {banner.category || 'CURATED PLAYLIST'}
                </p>

                <h1
                  style={{
                    fontSize: 'clamp(32px, 4vw, 52px)',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.05,
                    marginBottom: '12px',
                    textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                  }}
                >
                  {banner.title}
                </h1>

                <p
                  style={{
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    maxWidth: '440px',
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  {banner.subtitle}
                </p>
              </div>

              {/* Bottom Metadata & Stats */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '28px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                <span style={{ color: '#FF3B30', display: 'flex', alignItems: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </span>
                <span>{banner.stats || '50,056 Likes • 213 Songs, 13 hr 7 min'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Slide Indicators / Dots ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '20px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            style={{
              width: currentIndex === i ? '20px' : '6px',
              height: '6px',
              borderRadius: '9999px',
              background: currentIndex === i ? '#FFFFFF' : 'rgba(255, 255, 255, 0.35)',
              transition: 'all 0.3s ease',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
