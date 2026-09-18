'use client';

import React, { useState, Component, ReactNode, ErrorInfo } from 'react';
import Image from 'next/image';
import { getCoverUrl, isUnoptimizedFormat } from '@/lib/supabase/storage';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ImageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[CoverImage] Caught image render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export interface CoverImageProps {
  src: string | null | undefined;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  style?: React.CSSProperties;
  className?: string;
  priority?: boolean;
  fallbackSrc?: string;
  unoptimized?: boolean;
}

/**
 * CARIÑO — Defensive Universal Cover Artwork Component
 * - Validates & sanitizes any cover URL or storage path to prevent "Invalid URL" exceptions.
 * - Supports JPEG, PNG, SVG, WEBP, GIF, AVIF, BMP, ICO without alteration.
 * - Applies unoptimized={true} for SVGs, GIFs, and Blob/Data URLs to preserve animations & vector fidelity.
 * - Gracefully falls back to brand icon on error without crashing the surrounding page.
 */
export function CoverImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  style,
  className,
  priority,
  fallbackSrc = '/icons/icon-192.png',
  unoptimized: forcedUnoptimized,
}: CoverImageProps) {
  const safeSrc = getCoverUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [prevSafeSrc, setPrevSafeSrc] = useState(safeSrc);

  // Reset failedSrc during render whenever safeSrc changes (React recommended pattern)
  if (prevSafeSrc !== safeSrc) {
    setPrevSafeSrc(safeSrc);
    setFailedSrc(null);
  }

  // If the current safeSrc has previously failed to load, fall back to fallbackSrc
  const currentSrc = failedSrc === safeSrc ? fallbackSrc : safeSrc;

  const shouldBeUnoptimized =
    forcedUnoptimized !== undefined
      ? forcedUnoptimized
      : isUnoptimizedFormat(currentSrc) || currentSrc.startsWith('/api/media');

  const handleError = () => {
    if (currentSrc !== fallbackSrc) {
      setFailedSrc(safeSrc);
    }
  };

  const defaultPlaceholder = (
    <div
      style={{
        width: fill ? '100%' : width,
        height: fill ? '100%' : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-3, #262626)',
        color: 'var(--text-3, #737373)',
        fontSize: '18px',
        ...style,
      }}
      className={className}
      aria-label={alt}
    >
      🎵
    </div>
  );

  return (
    <ImageErrorBoundary fallback={defaultPlaceholder}>
      <Image
        src={currentSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width || 48 : undefined}
        height={!fill ? height || 48 : undefined}
        sizes={sizes}
        style={style}
        className={className}
        priority={priority}
        unoptimized={shouldBeUnoptimized}
        onError={handleError}
      />
    </ImageErrorBoundary>
  );
}

export default CoverImage;
