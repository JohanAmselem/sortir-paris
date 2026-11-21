import { NextResponse } from 'next/server'
import { recommend } from '@/lib/ai/recommend'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { buildEventParams } from '@/lib/events/params'
import { getWindow, parisDate, parisNightDay, parisParts } from '@/lib/paris-time'
import type { HomeResponse, HomeSection } from '@/lib/api-v1/contract'

/**
 * GET /api/v1/home — l'accueil de l'appli, calculé comme la page d'accueil du
 * site (app/page.tsx) : mêmes requêtes, mêmes règles de diversité.
 */
export const dynamic = 'force-dynamic'

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function weekendDays(now: Date): Array<{ key: string; label: string; iso: string }> {
  const w = getWindow('weekend', now)
  const first = parisNightDay(w.start)
  const last = parisNightDay(new Date(w.end.getTime() - 1))
  const days: Array<{ key: string; label: string; iso: string }> = []
  for (let i = 0; i < 4; i++) {
    const d = parisNightDay(parisDate(first.year, first.month, first.day + i, 12))
    const iso = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    days.push({ key: iso, label: WEEKDAYS[d.weekday], iso })
    if (d.year === last.year && d.month === last.month && d.day === last.day) break
  }
  return days
}

export async function GET() {
  try {
    const now = bucketNow()
    const days = weekendDays(now)
    const signatureBase = { signatureOnly: true, withImage: true, oneOffOnly: true, excludeCategories: ['cinema'], limit: 24 }
    const [discover, tonight, weekendPages, expos, lastChance, free, bigTonight] = await Promise.all([
      recommend({ when: 'tonight' }, 4),
      safeQueryEvents({ when: 'tonight', withImage: true, oneOffOnly: true, excludeCategories: ['cinema'], limit: 24 }),
      Promise.all(days.map((d) => safeQueryEvents({ when: d.iso, oneOffOnly: true, limit: 10 }))),
      safeQueryEvents({ categories: ['expos'], when: 'month', runsEndingWithinDays: 400, withImage: true, limit: 16 }),
      safeQueryEvents({ runsEndingWithinDays: 7, withImage: true, sort: 'ending', limit: 10 }),
      safeQueryEvents({ free: true, when: 'week', withImage: true, oneOffOnly: true, limit: 12 }),
      safeQueryEvents({ ...signatureBase, when: 'tonight' }),
    ])
    const bigTonightPicks = diversify(bigTonight.events, 8)
    const bigUseWeek = bigTonightPicks.length < 4
    const bigScenes = bigUseWeek ? diversify((await safeQueryEvents({ ...signatureBase, when: 'week' })).events, 8) : bigTonightPicks

    const shown = new Set(discover.events.map((e) => e.id))
    const picks = diversify(tonight.events.filter((e) => !shown.has(e.id)), 3)
    picks.forEach((e) => shown.add(e.id))
    const freeWeek = diversify(free.events.filter((e) => !shown.has(e.id)), 8)
    const hour = parisParts(now).hour

    const sections: HomeSection[] = [
      {
        id: 'big-scenes',
        kicker: 'Lieux phares',
        title: bigUseWeek ? 'Les grandes scènes cette semaine' : 'Les grandes scènes ce soir',
        layout: 'rail',
        events: bigScenes,
        moreParams: null,
      },
      {
        id: 'expos',
        kicker: 'À voir',
        title: 'Les expos du moment',
        layout: 'posters',
        events: expos.events,
        moreParams: buildEventParams({ categories: ['expos'], when: 'month', runsEndingWithinDays: 400 }).toString(),
      },
      { id: 'last-chance', kicker: 'Ça ferme bientôt', title: 'Dernière chance', layout: 'list', events: lastChance.events, moreParams: null },
      {
        id: 'free',
        kicker: '0 €',
        title: 'Gratuit cette semaine',
        layout: 'rail',
        events: freeWeek,
        moreParams: buildEventParams({ free: true, when: 'week' }).toString(),
      },
    ]

    const body = {
      generatedAt: now.toISOString(),
      discover: { events: discover.events, relaxed: discover.relaxed },
      picks,
      tonightIsLate: hour >= 21 || hour < 4,
      weekend: days.map((d, i) => ({ key: d.key, label: d.label, events: diversify(weekendPages[i].events, 6) })),
      sections: sections.filter((s) => s.events.length > 0),
    } satisfies HomeResponse

    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } })
  } catch (err) {
    console.error('[api/v1/home]', err)
    return NextResponse.json({ error: 'Impossible de charger l’accueil.' }, { status: 503 })
  }
}
