import { beforeEach, describe, expect, it, vi } from 'vitest'

// SQL shape tests: queries go to a fake driver that records them.
const logged: string[] = []
const nextRows: unknown[][] = []
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@sortir/db', async () => {
  const ev = await import('../../../../../packages/db/src/schema/events')
  const ve = await import('../../../../../packages/db/src/schema/venues')
  const ca = await import('../../../../../packages/db/src/schema/categories')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(async (q: string) => {
    logged.push(q)
    return { rows: nextRows.shift() ?? [] }
  })
  return { ...ev, ...ve, ...ca, withStatementTimeout: (_ms: number, fn: (tx: unknown) => unknown) => fn(db) }
})

const { queryEvents, shouldGroupFilms, toCard } = await import('./query')

beforeEach(() => {
  logged.length = 0
  nextRows.length = 0
})

describe('film grouping', () => {
  it('groups séances per film in general listings, in one query + one count', async () => {
    await queryEvents({ when: 'tonight', limit: 5, q: 'grouping-a' })
    expect(logged[0]).toContain('"films" on "film_best" = "events"."id"')
    expect(logged[0]).toContain(`is distinct from 'cinema' or "film_best" is not null`)
    expect(logged[0]).not.toMatch(/over\s*\(/)
  })

  it('does not group when cinema is out of the query', () => {
    expect(shouldGroupFilms({ categories: ['concerts'] })).toBe(false)
    expect(shouldGroupFilms({ excludeCategories: ['cinema'] })).toBe(false)
    expect(shouldGroupFilms({ ids: ['x'] })).toBe(false)
    expect(shouldGroupFilms({ categories: ['cinema'] })).toBe(true)
    expect(shouldGroupFilms({})).toBe(true)
  })

  it('counts each film once in the total', async () => {
    // 6 rows for limit 5 → hasMore → the count query runs.
    nextRows.push(Array.from({ length: 6 }, (_, i) => Array(29).fill(null).map((v, j) => (j === 0 ? `id${i}` : j === 5 ? new Date() : v))))
    nextRows.push([[42]])
    const page = await queryEvents({ when: 'week', limit: 5, q: 'grouping-b' })
    expect(logged[1]).toContain("count(distinct trim(both '-' from regexp_replace(")
    expect(page.total).toBe(42)
  })

  it('excludes recurring classes from tonight only', async () => {
    await queryEvents({ when: 'tonight', limit: 5, q: 'classes-a' })
    expect(logged[0]).toContain("interval '60 days'")
    logged.length = 0
    await queryEvents({ when: 'week', limit: 5, q: 'classes-b' })
    expect(logged[0]).not.toContain("interval '60 days'")
  })
})

describe('toCard', () => {
  const base = {
    id: 'a', slug: 's', title: 'Digger', shortDesc: null, imageUrl: null, startDate: new Date('2026-10-09T18:00:00Z'), endDate: null,
    timeKnown: true, priceMin: 0, priceMax: 0, priceStatus: 'unknown', isFree: false, saveCount: 0, qualityScore: 0,
    categorySlug: 'cinema', categoryName: 'Cinéma', categoryIcon: null, venueName: 'MK2', venueSlug: 'mk2', venueArr: null,
    venueCity: 'Montreuil', venueZip: '93100', venueLat: null, venueLng: null,
  }
  it('builds the film summary and keeps the town outside Paris', () => {
    const c = toCard({ ...base, filmN: '12', filmM: '8', filmTimes: ['2026-10-09T18:00:00Z', '2026-10-09T20:00:00Z'], filmImage: 'https://x/y.jpg' })
    expect(c.film).toEqual({ slug: 'digger', seances: 12, salles: 8, nextTimes: ['2026-10-09T18:00:00.000Z', '2026-10-09T20:00:00.000Z'] })
    expect(c.imageUrl).toBe('https://x/y.jpg')
    expect(c.venue?.city).toBe('Montreuil')
  })
  it('no film block for a single séance, no town in Paris', () => {
    const c = toCard({ ...base, venueArr: '5e', venueCity: 'Paris', venueZip: '75005', filmN: 1, filmM: 1, filmTimes: '{"2026-10-09 18:00:00+00"}', filmImage: null })
    expect(c.film).toBeNull()
    expect(c.venue?.city).toBeNull()
  })
})

describe('lot 4A SQL', () => {
  it('boosts signature venues with one uncorrelated subquery and can filter on them', async () => {
    await queryEvents({ when: 'week', limit: 5, q: 'signature-a' })
    expect(logged[0]).toMatch(/case when "events"\."venue_id" in \(select v\.id from venues v where translate\(lower\(v\.name\)/)
    logged.length = 0
    await queryEvents({ when: 'week', limit: 5, signatureOnly: true, q: 'signature-b' })
    expect(logged[0].match(/select v\.id from venues v where translate/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('sorts by distance, then start time', async () => {
    await queryEvents({ when: 'next3h', near: { lat: 48.85, lng: 2.35, radiusKm: 2 }, limit: 5, q: 'near-a' })
    expect(logged[0]).toMatch(/order by \(111\.32 \* sqrt\([^]*\) asc, "events"\."start_date" asc/)
  })

  it('marks signature venues on cards', () => {
    const row = {
      id: 'a', slug: 's', title: 'X', shortDesc: null, imageUrl: null, startDate: new Date(), endDate: null, timeKnown: true,
      priceMin: 0, priceMax: 0, priceStatus: 'unknown', isFree: false, saveCount: 0, qualityScore: 0, categorySlug: null,
      categoryName: null, categoryIcon: null, venueName: 'Philharmonie de Paris', venueSlug: 'philharmonie', venueArr: '19e',
      venueCity: 'Paris', venueZip: '75019', venueLat: null, venueLng: null,
    }
    expect(toCard(row).venue?.signature).toBe(true)
    expect(toCard({ ...row, venueName: 'Le Petit Bain' }).venue?.signature).toBe(false)
  })
})
