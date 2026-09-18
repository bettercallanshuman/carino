// ─────────────────────────────────────────────────────────────────────────────
// HeroBanner — Large featured card at the top of the main area
// Matches reference: colorful bg + overlay text + stats + album art
// ─────────────────────────────────────────────────────────────────────────────

interface HeroBannerProps {
  /** Background gradient or solid color */
  gradient?: string;
  /** Feature label */
  label?: string;
  /** Main title */
  title?: string;
  /** Subtitle / description */
  description?: string;
  /** Stats string */
  stats?: string;
}

export function HeroBanner({
  gradient = 'linear-gradient(120deg, #3BB2F6 0%, #8B5CF6 35%, #EC4899 65%, #F97316 100%)',
  label = 'SHARED LIBRARY',
  title = 'Your Music.',
  description = 'Listen together, feel closer. Upload songs and share them with the one you love.',
  stats = '❤️  Together, apart.',
}: HeroBannerProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 'var(--r-2xl)',
        overflow: 'hidden',
        background: gradient,
        minHeight: '240px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '28px',
      }}
    >
      {/* Overlay scrim for legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(120deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      {/* Decorative circles (mimics the logo in large scale) */}
      <div
        style={{
          position: 'absolute',
          right: '-20px',
          top: '-20px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          filter: 'blur(2px)',
        }}
        aria-hidden="true"
      />
      <div
        style={{
          position: 'absolute',
          right: '40px',
          top: '20px',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        }}
        aria-hidden="true"
      />

      {/* Text content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.75)',
            marginBottom: '10px',
          }}
        >
          {label}
        </p>

        <h1
          style={{
            fontSize: 'clamp(28px, 4vw, 48px)',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
            marginBottom: '10px',
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.75)',
            maxWidth: '360px',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}
        >
          {description}
        </p>

        <p
          style={{
            fontSize: '12.5px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {stats}
        </p>
      </div>
    </div>
  );
}
