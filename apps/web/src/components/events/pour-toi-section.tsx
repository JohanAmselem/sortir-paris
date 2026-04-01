import { SectionRow } from '@/components/events/section-row'
import { db, events, venues, categories, userPreferences } from '@sortir/db'
import { eq, and, gte, desc, inArray, or, sql } from 'drizzle-orm'

interface PourToiSectionProps {
  userId: string
}

export async function PourToiSection({ userId }: PourToiSectionProps) {
  // Fetch user preferences
  const prefs = await db.query.userPreferences?.findFirst({
    where: eq(userPreferences.userId, userId),
  })

  if (!prefs) return null

  const now = new Date()
  const conditions = [eq(events.status, 'active'), gte(events.startDate, now)]

  // Filter by preferred categories
  // Onboarding stores category slugs as text in a uuid[] column
  // We match by joining categories and checking slugs
  const prefCatSlugs = prefs.categories as unknown as string[]
  if (prefCatSlugs && prefCatSlugs.length > 0) {
    // Get category IDs from slugs
    const matchingCats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, prefCatSlugs))

    if (matchingCats.length > 0) {
      const catIds = matchingCats.map((c) => c.id)
      conditions.push(inArray(events.categoryId, catIds))
    }
  }

  // Filter by preferred zones (arrondissements)
  const prefZones = prefs.zones
  if (prefZones && prefZones.length > 0) {
    // Zones are stored as e.g. ["9e-10e", "3e-4e", "5e-6e"]
    // Need to expand to individual arrondissements
    const arrondissements: string[] = []
    for (const zone of prefZones) {
      // Parse "9e-10e" → ["9e", "10e"]
      const matches = zone.match(/\d+/g)
      if (matches) {
        for (const num of matches) {
          arrondissements.push(`${num}e`)
        }
      }
    }
    if (arrondissements.length > 0) {
      conditions.push(
        or(...arrondissements.map((a) => eq(venues.arrondissement, a)))!
      )
    }
  }

  // Prefer free events if user prefers free
  const orderBy = prefs.prefFree
    ? [desc(events.isFree), desc(events.qualityScore)]
    : [desc(events.qualityScore)]

  let results = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(12)

  // Fallback: popular events if no personalized results
  if (results.length < 3) {
    results = await db
      .select({ event: events, venue: venues, category: categories })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(eq(events.status, 'active'), gte(events.startDate, now)))
      .orderBy(desc(sql`${events.saveCount} + ${events.viewCount}`))
      .limit(12)
  }

  if (results.length === 0) return null

  const mapped = results.map((r) => ({
    ...r.event,
    category: r.category,
    venue: r.venue,
    tags: [],
    ambiances: [],
  })) as never[]

  return (
    <SectionRow
      title="Pour toi"
      icon="✨"
      href="/evenements"
      events={mapped}
    />
  )
}
