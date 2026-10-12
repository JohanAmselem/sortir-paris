import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronRight } from 'lucide-react'
import { listPosts } from '@/lib/instagram/data'
import { themeLabel } from '@/lib/instagram/themes'
import { addDays } from '@/lib/instagram/schedule'
import { parisISODate } from '@/lib/paris-time'
import { withTimeout } from '@/lib/events/query'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nos sorties Instagram',
  description: 'Les sorties de nos publications Instagram, avec le lien vers chaque événement.',
  alternates: { canonical: '/instagram' },
  // Thin page (link in bio): not for search engines.
  robots: { index: false, follow: true },
}

type PublicPost = {
  id: string
  label: string
  theme: string
  forDate: string
  publishedAt: string | null
  events: { slug: string; title: string; subtitle: string | null; when: string | null }[]
}

/** Published posts of the last 10 days, events only (slugs and the text shown on the slides). */
const loadPublished = unstable_cache(
  async (fromDate: string): Promise<PublicPost[]> => {
    const rows = await listPosts({ fromDate, statuses: ['published'], limit: 40, order: 'desc' })
    return rows.map((p) => ({
      id: p.id,
      label: themeLabel(p.kind, p.theme),
      theme: p.theme,
      forDate: p.forDate,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      events: p.items
        .filter((i) => i.type === 'event' && i.slug)
        .map((i) => ({ slug: i.slug!, title: i.title, subtitle: i.subtitle ?? null, when: i.when ?? null })),
    }))
  },
  ['instagram-published-v1'],
  { revalidate: 300, tags: ['instagram'] }
)

const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })

function eventHref(slug: string, theme: string): string {
  const q = new URLSearchParams({ utm_source: 'instagram', utm_medium: 'social', utm_campaign: theme })
  return `/evenements/${encodeURIComponent(slug)}?${q}`
}

const LINKS = [
  { href: '/ce-soir', label: 'Ce soir à Paris', desc: 'Tout ce qui commence ce soir' },
  { href: '/ce-week-end', label: 'Ce week-end', desc: 'Concerts, expos, spectacles, sorties gratuites' },
  { href: '/alertes-concerts', label: 'Alertes concerts', desc: 'Sois prévenu quand tes artistes passent à Paris' },
]

export default async function InstagramLinksPage() {
  const today = parisISODate(new Date())
  let posts: PublicPost[] = []
  let failed = false
  try {
    posts = await withTimeout(loadPublished(addDays(today, -10)), 8000, 'instagram posts')
  } catch (err) {
    console.error('[instagram page] load failed', err)
    failed = true
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Vu sur Instagram</p>
      <h1 className="font-display mt-1 text-[2.6rem] leading-tight text-ink">Les sorties de nos publications</h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Retrouve chaque sortie de nos carrousels et stories, avec les horaires et la billetterie. Infos à vérifier auprès de l’organisateur.
      </p>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-[60px] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-hover">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{l.label}</span>
                <span className="block truncate text-[13px] text-text-secondary">{l.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="font-display mt-10 text-[2rem] text-ink">Publications récentes</h2>
      {failed ? (
        <p className="mt-3 text-[14px] text-text-secondary">Les publications sont momentanément indisponibles. Réessaie dans un instant.</p>
      ) : posts.length === 0 ? (
        <p className="mt-3 text-[14px] text-text-secondary">
          Pas encore de publication. En attendant, <Link href="/ce-soir" className="text-accent underline">vois ce qui se passe ce soir</Link>.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {posts.map((p, i) => (
            <li key={p.id}>
              <details className="group rounded-2xl border border-border bg-surface" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold text-ink">{p.label}</span>
                    <span className="block text-[13px] text-text-secondary">
                      Publié le {dayFmt.format(new Date(p.publishedAt ?? `${p.forDate}T12:00:00Z`))} · {p.events.length} sorties
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {p.events.map((e) => (
                    <li key={e.slug}>
                      <Link href={eventHref(e.slug, p.theme)} className="block px-5 py-3 transition-colors hover:bg-surface-hover">
                        <span className="block text-[15px] font-semibold text-ink">{e.title}</span>
                        <span className="block text-[13px] text-text-secondary">{[e.when, e.subtitle].filter(Boolean).join(' · ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
