import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Footer } from '@/components/layout/footer'
import { AlertActivatedBanner } from '@/components/follow/alert-activated-banner'
import { SavedIdsProvider } from '@/components/events/saved-ids'
import { SITE_URL } from '@/lib/site'
import '@/styles/globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

export const metadata: Metadata = {
  title: {
    default: 'Paname Club · Que faire à Paris ce soir ?',
    template: '%s · Paname Club',
  },
  description:
    'Concerts, expos, théâtre, sorties gratuites : que faire à Paris ce soir, ce week-end ou dans six mois, jour par jour, parmi des milliers de sorties.',
  metadataBase: new URL(SITE_URL),
  applicationName: 'Paname Club',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Paname Club',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Paname Club : que faire à Paris ce soir ?' }],
  },
  twitter: { card: 'summary_large_image' },
  verification: {
    google: 'X1NKo4arOgih-em9dFreJ4wnXL_uNek-dlbYomcNmes',
  },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0b11',
}

const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body className="min-h-screen bg-bg antialiased">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Aller au contenu
        </a>
        <SavedIdsProvider>
          <Header />
          <main id="contenu" className="mx-auto max-w-7xl">
            {children}
          </main>
          <Footer />
          <BottomNav />
        </SavedIdsProvider>
        <AlertActivatedBanner />
        {/* Enable Web Analytics / Speed Insights in the Vercel dashboard, then set these flags. */}
        {process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === '1' && <Analytics />}
        {process.env.NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS === '1' && <SpeedInsights />}
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.outbound-links.tagged-events.js"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  )
}
