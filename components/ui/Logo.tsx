// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO Logo — Three overlapping orbs + logotype
// Matches brand asset: colorful overlapping spheres (blue + purple + orange)
// ─────────────────────────────────────────────────────────────────────────────

interface LogoProps {
  /** Full logo with text (default) or mark only */
  variant?: 'full' | 'mark';
  /** Height of the logo mark in px */
  size?: number;
}

export function Logo({ variant = 'full', size = 32 }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* ── Overlapping orbs mark ──────────────────────────────────────── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          {/* Pink/magenta orb */}
          <radialGradient id="orb1" cx="40%" cy="35%" r="65%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F472B6" />
            <stop offset="50%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#9333EA" stopOpacity="0.8" />
          </radialGradient>
          {/* Blue orb */}
          <radialGradient id="orb2" cx="60%" cy="35%" r="65%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60C8FF" />
            <stop offset="50%" stopColor="#3BB2F6" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.8" />
          </radialGradient>
          {/* Orange orb */}
          <radialGradient id="orb3" cx="50%" cy="70%" r="65%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FBB040" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.8" />
          </radialGradient>
          {/* Glow filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Three overlapping circles with screen blend */}
        <g filter="url(#glow)" style={{ isolation: 'isolate' }}>
          {/* Pink orb — top left */}
          <circle
            cx="15"
            cy="16"
            r="13"
            fill="url(#orb1)"
            style={{ mixBlendMode: 'screen' } as React.CSSProperties}
            opacity="0.95"
          />
          {/* Blue orb — top right */}
          <circle
            cx="25"
            cy="16"
            r="13"
            fill="url(#orb2)"
            style={{ mixBlendMode: 'screen' } as React.CSSProperties}
            opacity="0.95"
          />
          {/* Orange orb — bottom center */}
          <circle
            cx="20"
            cy="26"
            r="13"
            fill="url(#orb3)"
            style={{ mixBlendMode: 'screen' } as React.CSSProperties}
            opacity="0.90"
          />
        </g>
      </svg>

      {/* ── Logotype ───────────────────────────────────────────────────── */}
      {variant === 'full' && (
        <span
          style={{
            fontFamily: 'DM Sans, var(--font-dm-sans), sans-serif',
            fontSize: `${Math.round(size * 0.65)}px`,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          cariño
        </span>
      )}
    </div>
  );
}
