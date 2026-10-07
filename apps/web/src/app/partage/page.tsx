import type { Metadata } from 'next'
import { z } from 'zod'
import { DataUnavailable, EmptyState, EventGrid } from '@/components/events/blocks'
import type { CardEvent } from '@/lib/events/types'
import { getCardsByIds } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Une sélection de sorties à Paris',
  description: 'Une sélection de sorties à Paris partagée depuis Paname Club.',
  robots: { index: false, follow: true },
}

const MAX_IDS = 20
const idsSchema = z.array(z.guid()).min(1).max(MAX_IDS)

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** "a,b,c" → unique valid ids, or null when the list is invalid / too long. */
function parseIds(raw: string | undefined): string[] | null {
  if (!raw) return null
  const list = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
  const parsed = idsSchema.safeParse(list)
  return parsed.success ? parsed.data : null
}

function cleanTitle(raw: string | undefined): string {
  const t = (raw ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80)
  return t || 'Une sélection de sorties'
}

export default async function PartagePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; title?: string | string[] }>
}) {
  const sp = await searchParams
  const ids = parseIds(first(sp.ids))
  const title = cleanTitle(first(sp.title))

  let events: CardEvent[] | null = []
  if (ids) {
    try {
      events = await getCardsByIds(ids)
    } catch (err) {
      console.error('[partage] failed', err)
      events = null
    }
  }

  return (
    <div className="px-4 pb-16 pt-8 sm:pt-12">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Sélection partagée</p>
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.8rem]">{title}</h1>

      {events === null ? (
        <DataUnavailable className="mt-8" />
      ) : events.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Lien invalide ou expiré"
          actions={[
            { href: '/ce-week-end', label: 'Ce week-end' },
            { href: '/evenements', label: 'Tout l’agenda' },
          ]}
        >
          Cette sélection n’existe plus ou le lien est incomplet.
        </EmptyState>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-text-secondary">
            {events.length} sortie{events.length > 1 ? 's' : ''} dans cette sélection.
          </p>
          <EventGrid events={events} now={new Date()} className="mt-8" />
        </>
      )}
    </div>
  )
}
