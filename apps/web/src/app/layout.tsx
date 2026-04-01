import type { Metadata, Viewport } from 'next'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Footer } from '@/components/layout/footer'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Paname Club — Sorties culturelles à Paris',
    template: '%s | Paname Club',
  },
  description:
    'Concerts, expos, spectacles, festivals — toute la culture parisienne en un clic. Trouve ta sortie à Paris.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://sortir-paris.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Paname Club',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="scroll-smooth">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-bg pb-16 md:pb-0 antialiased">
        <Header />
        <main className="mx-auto max-w-7xl">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  )
}
