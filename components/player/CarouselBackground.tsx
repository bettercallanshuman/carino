'use client';

import React, { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Carousel Background (GPU Optimized Compositor Architecture)
// Renders the currently centered album's cover art as a fullscreen blurred,
// darkened, vignetted atmospheric background.
//
// Cross-fades between artworks when the center card changes using two
// alternating <img> layers with GPU-composited opacity and optimized blur kernel.
//
// This component exists ONLY inside the ExpandedPlayer fullscreen overlay.
// ─────────────────────────────────────────────────────────────────────────────

interface CarouselBackgroundProps {
  coverUrl: string | null;
}

export const CarouselBackground = React.memo(function CarouselBackground({ coverUrl }: CarouselBackgroundProps) {
  // Track two layers for cross-fade
  const [layers, setLayers] = useState<{ url: string; key: number }[]>([]);
  const counterRef = useRef(0);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coverUrl || coverUrl === prevUrlRef.current) return;
    prevUrlRef.current = coverUrl;
    counterRef.current += 1;
    const newKey = counterRef.current;

    setLayers((prev) => {
      // Keep only the most recent previous layer + the new one
      const recent = prev.length > 0 ? [prev[prev.length - 1]] : [];
      return [...recent, { url: coverUrl, key: newKey }];
    });

    // Clean up old layers after transition completes
    const timer = setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, 1000);

    return () => clearTimeout(timer);
  }, [coverUrl]);

  return (
    <div
      className="carousel-bg-container"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {/* Album artwork layers with cross-fade (GPU layer promoted) */}
      {layers.map((layer, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.key}
          src={layer.url}
          alt=""
          draggable={false}
          className="carousel-bg-img"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate3d(-50%, -50%, 0) scale(1.35)',
            width: '130%',
            height: '130%',
            objectFit: 'cover',
            filter: 'blur(36px) brightness(0.4) saturate(1.4) contrast(0.85)',
            opacity: index === layers.length - 1 ? 1 : 0,
            transition: 'opacity 0.8s ease',
            zIndex: index,
            willChange: 'opacity',
            backfaceVisibility: 'hidden',
          }}
        />
      ))}

      {/* Dark vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(
            ellipse 80% 80% at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.3) 50%,
            rgba(0, 0, 0, 0.7) 80%,
            rgba(0, 0, 0, 0.9) 100%
          )`,
          zIndex: 10,
        }}
      />

      {/* Top-to-bottom gradient for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.2) 0%,
            transparent 30%,
            transparent 60%,
            rgba(0, 0, 0, 0.6) 100%
          )`,
          zIndex: 11,
        }}
      />
    </div>
  );
});
