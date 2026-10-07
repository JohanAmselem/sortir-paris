import { safeJsonLd } from '@/lib/json-ld'
import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, ArrowRight, TrendingUp } from 'lucide-react'
import { db, articles } from '@sortir/db'
import { eq, desc, and } from 'drizzle-orm'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'News culturelles — Paname Club',
  description: 'Toute l\'actualité culturelle à Paris : expos, spectacles, concerts, tendances, bons plans. Mis à jour quotidiennement.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'News culturelles — Paname Club',
    description: 'Toute l\'actualité culturelle à Paris.',
    type: 'website',
  },
}

export const revalidate = 300

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  actualite: { label: 'Actualité', icon: '🔴', color: 'bg-red-500/10 text-red-500' },
  selection: { label: 'Sélection', icon: '⭐', color: 'bg-amber-500/10 text-amber-600' },
  focus: { label: 'Focus', icon: '🔍', color: 'bg-blue-500/10 text-blue-500' },
  tendance: { label: 'Tendance', icon: '📈', color: 'bg-purple-500/10 text-purple-500' },
  interview: { label: 'Interview', icon: '🎙️', color: 'bg-emerald-500/10 text-emerald-600' },
}

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (hours < 1) return 'Il y a quelques minutes'
  if (hours < 24) return `Il y a ${hours}h`
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} jours`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

interface Props {
  searchParams: Promise<{ [key: string]: string | undefined }>
}

async function getArticles(type?: string) {
  const conditions = [eq(articles.status, 'published')]
  if (type && type in TYPE_CONFIG) {
    conditions.push(eq(articles.type, type as 'actualite' | 'selection' | 'focus' | 'tendance' | 'interview'))
  }

  return db
    .select()
    .from(articles)
    .where(and(...conditions))
    .orderBy(desc(articles.priority), desc(articles.publishedAt))
    .limit(50)
}

export default async function NewsPage({ searchParams }: Props) {
  const params = await searchParams
  const articlesList = await getArticles(params.type)

  const featured = articlesList.filter((a) => a.priority >= 8).slice(0, 3)
  const rest = articlesList.filter((a) => !featured.includes(a))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'News culturelles — Paname Club',
    description: 'Toute l\'actualité culturelle à Paris.',
    url: 'https://www.panameclub.fr/news',
  }

  return (
    <div className="px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">News culturelles</h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            L&apos;actualité culturelle parisienne, mise à jour chaque jour
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          <span className="text-[12px] font-medium text-accent">{articlesList.length} articles</span>
        </div>
      </div>

      {/* Type filters */}
      <div className="scrollbar-hide mt-4 flex gap-1.5 overflow-x-auto">
        <Link
          href="/news"
          className={cn(
            'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
            !params.type
              ? 'border-accent bg-accent text-white shadow-sm'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
          )}
        >
          Tous
        </Link>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <Link
            key={key}
            href={`/news?type=${key}`}
            className={cn(
              'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
              params.type === key
                ? 'border-accent bg-accent text-white shadow-sm'
                : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
            )}
          >
            <span>{cfg.icon}</span>
            {cfg.label}
          </Link>
        ))}
      </div>

      {/* Featured articles */}
      {featured.length > 0 && !params.type && (
        <div className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Main featured */}
            <Link
              href={`/news/${featured[0].slug}`}
              className="group relative col-span-1 overflow-hidden rounded-2xl bg-primary md:col-span-2 md:row-span-2"
            >
              <div className="relative aspect-[16/9] md:aspect-auto md:h-full overflow-hidden">
                {featured[0].imageUrl ? (
                  <Image
                    src={featured[0].imageUrl}
                    alt={featured[0].imageAlt ?? featured[0].title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 66vw"
                    priority
                  />
                ) : (
                  <div className="flex h-full min-h-[250px] items-center justify-center bg-gradient-to-br from-accent/20 to-neon/20">
                    <span className="text-7xl opacity-30">{TYPE_CONFIG[featured[0].type]?.icon ?? '📰'}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                  <span className={cn('inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TYPE_CONFIG[featured[0].type]?.color ?? 'bg-accent/10 text-accent')}>
                    {TYPE_CONFIG[featured[0].type]?.label ?? 'News'}
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-white leading-snug md:text-2xl">
                    {featured[0].title}
                  </h2>
                  <p className="mt-2 text-[13px] text-white/70 line-clamp-2">
                    {featured[0].excerpt}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-white/50">
                    <Clock className="h-3 w-3" />
                    {formatRelativeDate(new Date(featured[0].publishedAt))}
                  </div>
                </div>
              </div>
            </Link>

            {/* Side featured */}
            {featured.slice(1).map((article) => (
              <Link
                key={article.id}
                href={`/news/${article.slug}`}
                className="group relative overflow-hidden rounded-2xl bg-surface border border-border/60"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  {article.imageUrl ? (
                    <Image
                      src={article.imageUrl}
                      alt={article.imageAlt ?? article.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-accent/5 to-neon/5">
                      <span className="text-4xl opacity-30">{TYPE_CONFIG[article.type]?.icon ?? '📰'}</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <span className={cn('inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TYPE_CONFIG[article.type]?.color ?? 'bg-accent/10 text-accent')}>
                    {TYPE_CONFIG[article.type]?.label ?? 'News'}
                  </span>
                  <h3 className="mt-2 text-[14px] font-bold text-text-primary leading-snug group-hover:text-accent transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <Clock className="h-3 w-3" />
                    {formatRelativeDate(new Date(article.publishedAt))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Article list */}
      {rest.length > 0 ? (
        <div className="mt-8 space-y-4">
          {rest.map((article) => {
            const typeCfg = TYPE_CONFIG[article.type]
            return (
              <Link
                key={article.id}
                href={`/news/${article.slug}`}
                className="group flex gap-4 rounded-2xl border border-border/60 bg-surface p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                {/* Image */}
                <div className="relative hidden h-28 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-surface-hover sm:block">
                  {article.imageUrl ? (
                    <Image
                      src={article.imageUrl}
                      alt={article.imageAlt ?? article.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="160px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-3xl opacity-30">{typeCfg?.icon ?? '📰'}</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', typeCfg?.color ?? 'bg-accent/10 text-accent')}>
                      {typeCfg?.label ?? 'News'}
                    </span>
                    {article.tags && (
                      <span className="text-[11px] text-text-muted">
                        {article.tags.split(',').slice(0, 2).map((t) => `#${t.trim()}`).join(' ')}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-bold text-text-primary leading-snug group-hover:text-accent transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="mt-1 text-[13px] text-text-secondary line-clamp-2">
                    {article.excerpt}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      <Clock className="h-3 w-3" />
                      {formatRelativeDate(new Date(article.publishedAt))}
                    </div>
                    <span className="flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                      Lire <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : articlesList.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-5xl">📰</p>
          <p className="mt-4 text-lg font-bold text-text-primary">Aucun article pour le moment</p>
          <p className="mt-1 text-[13px] text-text-muted">
            Les news culturelles arrivent bientôt !
          </p>
        </div>
      ) : null}
    </div>
  )
}
