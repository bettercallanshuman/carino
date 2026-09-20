import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { AudioEngine } from '@/components/player/AudioEngine';
import './globals.css';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Root Layout
// DM Sans (Google Sans equivalent) · Dark · PWA-ready
// Hosts the single authoritative AudioEngine for playback across all routes.
// ─────────────────────────────────────────────────────────────────────────────

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: {
    default: 'Cariño',
    template: '%s — Cariño',
  },
  description: 'Together, apart. A private shared-listening experience for two.',
  applicationName: 'Cariño',
  appleWebApp: {
    capable: true,
    title: 'Cariño',
    statusBarStyle: 'black-translucent',
    startupImage: '/icons/apple-touch-icon.png',
  },
  icons: {
    icon: [
      { url: '/favicon.svg?v=3', type: 'image/svg+xml' },
      { url: '/favicon.ico?v=3', sizes: 'any' },
      { url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/favicon.svg?v=3', type: 'image/svg+xml' },
      { url: '/icons/apple-touch-icon.png?v=3' },
    ],
  },
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(typeof window!=='undefined'&&window.navigator&&window.navigator.standalone){document.documentElement.dataset.standalone="true";}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <div id="app-root">
          {children}
          <AudioEngine />
        </div>
      </body>
    </html>
  );
}
