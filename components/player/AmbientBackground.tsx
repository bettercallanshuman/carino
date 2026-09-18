'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// AmbientBackground
// Renders the warm atmospheric gradient that emanates from the top.
// Used on the home page hero and will wrap the expanded player in Phase 4.
//
// When `imageUrl` is provided (Phase 4), it samples the dominant color
// from the album artwork and transitions the atmosphere accordingly.
// For Phase 1, it uses the fixed CARIÑO amber gradient.
// ─────────────────────────────────────────────────────────────────────────────

interface AmbientBackgroundProps {
  /** Album art URL — when provided, modulates the gradient */
  imageUrl?: string | null;
  /** 0–1 intensity of the gradient */
  intensity?: number;
  /** Additional CSS class names */
  className?: string;
}

export function AmbientBackground({
  imageUrl: _imageUrl,
  intensity = 1,
  className = '',
}: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // In Phase 4, this will extract palette from imageUrl
  // For Phase 1, we use the fixed ambient gradient
  useEffect(() => {
    // Placeholder for Phase 4 color extraction
  }, [_imageUrl]);

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
      style={{ opacity: intensity }}
    >
      {/* Primary ambient bloom — amber core */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(
            ellipse 140% 70% at 50% -10%,
            rgba(244, 162, 54, 0.55) 0%,
            rgba(241, 123, 44, 0.40) 20%,
            rgba(201, 82, 42, 0.25) 40%,
            rgba(139, 32, 0, 0.15) 60%,
            transparent 80%
          )`,
        }}
      />

      {/* Subtle warm vignette — bottom dark anchor */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            to bottom,
            transparent 0%,
            transparent 50%,
            rgba(0, 0, 0, 0.6) 80%,
            rgba(0, 0, 0, 0.95) 100%
          )`,
        }}
      />

      {/* Side feathering */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(
            ellipse 60% 100% at 0% 0%,
            rgba(0, 0, 0, 0.5) 0%,
            transparent 60%
          )`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(
            ellipse 60% 100% at 100% 0%,
            rgba(0, 0, 0, 0.5) 0%,
            transparent 60%
          )`,
        }}
      />

      {/* Hidden canvas for Phase 4 color extraction */}
      <canvas ref={canvasRef} className="hidden" width={1} height={1} />
    </div>
  );
}
