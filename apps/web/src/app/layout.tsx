import type { Metadata, Viewport } from 'next';
import './globals.css';

const DESCRIPTION = 'A little farm, a long evening. Tend it, harvest it, earn $AMBER.';

/**
 * The share card is a static PNG rather than a generated one: it never
 * changes per page, and every crawler that matters fetches it cold — paying
 * for a render on each of those requests buys nothing.
 */
export const metadata: Metadata = {
  // Without a base, Next resolves /og.png against localhost and every share
  // card links at a machine nobody else can reach.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ambervale.fun'),
  title: 'AMBERVALE',
  description: DESCRIPTION,
  applicationName: 'AMBERVALE',
  openGraph: {
    title: 'AMBERVALE',
    description: DESCRIPTION,
    siteName: 'AMBERVALE',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'AMBERVALE' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AMBERVALE',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a2e3d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
