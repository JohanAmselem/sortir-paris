import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { COLLECTIONS } from './collections-data'

export const metadata: Metadata = {
  title: 'Collections — Paname Club',
  description: 'Nos sélections thématiques des meilleures sorties culturelles à Paris. Expos, jazz, gratuit, famille...',
  alternates: { canonical: '/collections' },
}

export default function CollectionsPage() {
  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary">Collections</h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Nos sélections thématiques pour ne rien rater
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLLECTIONS.map((col) => (
          <Link
            key={col.slug}
            href={`/collections/${col.slug}`}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-accent/20"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${col.gradient} opacity-50`} />
            <div className="relative">
              <span className="text-4xl">{col.emoji}</span>
              <h2 className="mt-3 text-lg font-bold text-text-primary group-hover:text-accent transition-colors">
                {col.title}
              </h2>
              <p className="mt-1 text-[13px] text-text-secondary line-clamp-2">
                {col.subtitle}
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-accent">
                Découvrir
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
