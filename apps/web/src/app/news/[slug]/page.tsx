import { safeJsonLd } from '@/lib/json-ld'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Clock, Tag } from 'lucide-react'
import { ShareButton } from '@/components/ui/share-button'
import { EventRail, SectionHeader } from '@/components/events/blocks'
import { bucketNow, safeQueryEvents } from '@/lib/events/query'
import { db, articles } from '@sortir/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { cache } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  actualite: { label: 'Actualité', icon: '🔴', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
  selection: { label: 'Sélection', icon: '⭐', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  focus: { label: 'Focus', icon: '🔍', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  tendance: { label: 'Tendance', icon: '📈', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  interview: { label: 'Interview', icon: '🎙️', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
}

const getArticle = cache(async function getArticle(slug: string) {
  const result = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
    .limit(1)

  return result[0] ?? null
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only the related events that are still upcoming. */
async function getRelatedEvents(eventIds: string) {
  const ids = eventIds.split(',').map((id) => id.trim()).filter((id) => UUID.test(id)).slice(0, 40)
  if (ids.length === 0) return []
  return (await safeQueryEvents({ ids, limit: 12 })).events
}

async function getMoreArticles(currentId: string, type: string) {
  return db
    .select()
    .from(articles)
    .where(and(
      eq(articles.status, 'published'),
      eq(articles.type, type as 'actualite' | 'selection' | 'focus' | 'tendance' | 'interview'),
      sql`${articles.id} != ${currentId}`,
    ))
    .orderBy(desc(articles.publishedAt))
    .limit(3)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) return { title: 'Article introuvable' }

  return {
    title: (article.metaTitle ?? article.title).replace(/\s*[—|-]\s*Paname Club$/, ''),
    robots: isArchived(article) ? { index: false, follow: true } : undefined,
    description: article.metaDescription ?? article.excerpt,
    keywords: article.keywords ?? undefined,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      title: article.metaTitle ?? article.title,
      description: article.metaDescription ?? article.excerpt,
      images: article.imageUrl ? [article.imageUrl] : undefined,
      type: 'article',
      publishedTime: article.publishedAt?.toISOString(),
    },
  }
}

export const revalidate = 600

/** Seasonal articles older than 4 months are kept for links but not indexed. */
function isArchived(a: { publishedAt: Date | null }) {
  return !a.publishedAt || Date.now() - new Date(a.publishedAt).getTime() > 120 * 86400_000
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()


  const typeCfg = TYPE_CONFIG[article.type]
  const publishedDate = new Date(article.publishedAt)
  const tags = article.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? []

  const relatedEvents = article.relatedEventIds
    ? await getRelatedEvents(article.relatedEventIds)
    : []

  const moreArticles = await getMoreArticles(article.id, article.type)

  // Structured data for Google
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt,
    image: article.imageUrl ?? undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt?.toISOString(),
    author: { '@type': 'Organization', name: 'Paname Club' },
    publisher: {
      '@type': 'Organization',
      name: 'Paname Club',
      url: 'https://www.panameclub.fr',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.panameclub.fr/news/${slug}`,
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <article className="pb-16">
        {/* Back */}
        <div className="px-4 py-3">
          <Link href="/news" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            News
          </Link>
        </div>

        {/* Hero image */}
        {article.imageUrl && (
          <div className="relative aspect-[2/1] w-full overflow-hidden bg-surface-hover md:aspect-[2.5/1] md:rounded-2xl md:mx-4 md:max-w-[calc(100%-2rem)]">
            <Image
              src={article.imageUrl}
              alt={article.imageAlt ?? article.title}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>
        )}

        <div className="mx-auto max-w-2xl px-4 pt-6">
          {/* Type badge + date */}
          <div className="flex items-center gap-3">
            {typeCfg && (
              <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider', typeCfg.color)}>
                {typeCfg.icon} {typeCfg.label}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
              <Clock className="h-3 w-3" />
              {publishedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}
            </div>
          </div>

          {isArchived(article) && (
            <p className="mt-4 rounded-lg bg-paper-deep px-4 py-3 text-[15px] text-text-secondary" role="note">
              Article d’archive : les dates et programmations citées peuvent être dépassées.{' '}
              <Link href="/ce-week-end" className="font-semibold text-accent underline underline-offset-2">Voir les sorties de ce week-end</Link>
            </p>
          )}

          {/* Title */}
          <h1 className="font-display mt-4 text-[2.4rem] text-ink md:text-[3rem]">
            {article.title}
          </h1>

          {/* Excerpt */}
          <p className="mt-3 text-[15px] leading-relaxed text-text-secondary font-medium">
            {article.excerpt}
          </p>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-3">
            <ShareButton title={article.title} text={article.excerpt} className="h-9 w-9" />

          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-3 py-1 text-[11px] font-medium text-text-muted"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <div
            className="article-content mt-8 prose prose-invert prose-sm max-w-none
              prose-headings:text-text-primary prose-headings:font-bold
              prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
              prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
              prose-p:text-[14px] prose-p:leading-[1.8] prose-p:text-text-secondary prose-p:mb-4
              prose-strong:text-text-primary prose-strong:font-semibold
              prose-a:text-accent prose-a:no-underline hover:prose-a:underline
              prose-ul:text-[14px] prose-ul:text-text-secondary
              prose-li:mb-1
              prose-blockquote:border-l-accent prose-blockquote:bg-surface prose-blockquote:rounded-r-xl prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:not-italic
              prose-blockquote:text-text-secondary"
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.content) }}
          />

          {/* Source */}
          {article.sourceUrls && (
            <div className="mt-8 rounded-xl bg-surface-hover/50 px-4 py-3">
              <p className="text-[11px] text-text-muted">
                Sources : {article.sourceUrls.split(',').map((url, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <a href={url.trim()} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {new URL(url.trim()).hostname}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>

        {relatedEvents.length > 0 && (
          <section className="mt-12 px-4" aria-labelledby="related-title">
            <SectionHeader id="related-title" kicker="Toujours à l’affiche" title="Les sorties de l’article" />
            <EventRail events={relatedEvents} now={bucketNow()} className="mt-5" />
          </section>
        )}

        {/* More articles */}
        {moreArticles.length > 0 && (
          <div className="mt-12 px-4">
            <h2 className="text-lg font-bold text-text-primary">À lire aussi</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {moreArticles.map((a) => {
                const aCfg = TYPE_CONFIG[a.type]
                return (
                  <Link
                    key={a.id}
                    href={`/news/${a.slug}`}
                    className="group overflow-hidden rounded-2xl border border-border/60 bg-surface transition-all hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-surface-hover">
                      {a.imageUrl ? (
                        <Image
                          src={a.imageUrl}
                          alt={a.imageAlt ?? a.title}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-3xl opacity-30">{aCfg?.icon ?? '📰'}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3.5">
                      <span className={cn('inline-block rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', aCfg?.color ?? 'bg-accent/10 text-accent')}>
                        {aCfg?.label}
                      </span>
                      <h3 className="mt-1.5 text-[13px] font-bold text-text-primary leading-snug group-hover:text-accent transition-colors line-clamp-2">
                        {a.title}
                      </h3>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </article>
    </>
  )
}
