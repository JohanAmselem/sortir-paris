import type { Metadata } from 'next'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Footer } from '@/components/layout/footer'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Sortir — Tous les événements culturels à Paris',
    template: '%s | Sortir',
  },
  description:
    'Découvrez concerts, expos, théâtre, cinéma et festivals à Paris et petite couronne. Trouvez votre sortie en 30 secondes.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://sortir.paris'),
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Sortir',
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
