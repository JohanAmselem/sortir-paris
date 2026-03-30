import { Metadata } from 'next'
import { SearchBar } from '@/components/search/search-bar'
import { SectionRow } from '@/components/events/section-row'
import { FilterBar } from '@/components/search/filter-bar'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sortir — Tous les événements culturels à Paris',
}

// ISR: refresh every 5 minutes
export const revalidate = 300

async function getHomeData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const [tonightRes, trendingRes, categoriesRes] = await Promise.all([
    fetch(`${baseUrl}/api/events?date=today&limit=10&sort=date`, { next: { revalidate: 300 } }),
    fetch(`${baseUrl}/api/events?limit=10&sort=popular`, { next: { revalidate: 300 } }),
    fetch(`${baseUrl}/api/categories`, { next: { revalidate: 3600 } }),
  ])

  const [tonight, trending, categories] = await Promise.all([
    tonightRes.json(),
    trendingRes.json(),
    categoriesRes.json(),
  ])

  return {
    tonight: tonight.data ?? [],
    trending: trending.data ?? [],
    categories: categories ?? [],
  }
}

export default async function HomePage() {
  const { tonight, trending, categories } = await getHomeData()

  return (
    <div>
      {/* Hero */}
      <section className="bg-primary px-4 pb-8 pt-10 text-white">
        <h1 className="text-center text-2xl font-bold md:text-4xl">
          Trouve ta sortie à Paris
        </h1>
        <p className="mt-2 text-center text-sm text-white/70 md:text-base">
          Concerts, expos, théâtre, cinéma — tout est là.
        </p>
        <SearchBar className="mx-auto mt-6 max-w-xl" />
      </section>

      {/* Quick filters */}
      <div className="border-b border-border bg-surface px-4 py-3">
        <FilterBar categories={categories} />
      </div>

      {/* Ce soir */}
      <SectionRow
        title="Ce soir"
        icon="🌙"
        href="/ce-soir"
        events={tonight.map((r: { event: unknown }) => r.event ?? r)}
      />

      {/* Tendances */}
      <SectionRow
        title="Tendances"
        icon="🔥"
        href="/evenements?sort=popular"
        events={trending.map((r: { event: unknown }) => r.event ?? r)}
      />

      {/* Categories grid */}
      <section className="px-4 py-8 lg:px-0">
        <h2 className="text-xl font-bold text-text-primary">Par catégorie</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {categories.map((cat: { slug: string; name: string; icon: string | null; color: string | null }) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-sm font-medium text-text-primary">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
