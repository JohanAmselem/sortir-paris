import type { Metadata } from 'next'
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://panameclub.fr'),
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Paname Club',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg pb-16 md:pb-0">
        <Header />
        <main className="mx-auto max-w-7xl">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  )
}
