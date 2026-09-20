import withPWAInit from '@ducanh2912/next-pwa';
import type { NextConfig } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Next.js Configuration
// ─────────────────────────────────────────────────────────────────────────────

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Disable service worker in dev — avoids caching conflicts
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['192.168.1.4', 'localhost', '127.0.0.1'],
  // Turbopack config — required in Next.js 16 when using webpack plugins like next-pwa
  turbopack: {},
  typescript: {
    // Verified independently via npx tsc --noEmit to avoid Windows child_process spawn UNKNOWN
    ignoreBuildErrors: true,
  },
  // Images from Supabase storage and remote sources
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    formats: ['image/avif', 'image/webp'],
    localPatterns: [
      {
        pathname: '/api/media',
      },
      {
        pathname: '/api/media/**',
      },
      {
        pathname: '/icons/**',
      },
      {
        pathname: '**',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
        pathname: '/storage/v1/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Required for Supabase realtime + streaming
  experimental: {
    cpus: 4,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default withPWA(nextConfig);
