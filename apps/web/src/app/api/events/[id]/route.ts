import { NextResponse } from 'next/server'
import { db, events, venues, categories, eventTags, tags, eventAmbiances, ambiances } from '@sortir/db'
import { eq } from 'drizzle-orm'

// GET /api/events/:id — Single event with all relations
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch event + venue + category
  const result = await db
    .select({
      event: events,
      venue: venues,
      category: categories,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(eq(events.slug, id))
    .limit(1)

  if (result.length === 0) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { event, venue, category } = result[0]

  // Fetch tags
  const eventTagsList = await db
    .select({ tag: tags })
    .from(eventTags)
    .innerJoin(tags, eq(eventTags.tagId, tags.id))
    .where(eq(eventTags.eventId, event.id))

  // Fetch ambiances
  const eventAmbiancesList = await db
    .select({ ambiance: ambiances })
    .from(eventAmbiances)
    .innerJoin(ambiances, eq(eventAmbiances.ambianceId, ambiances.id))
    .where(eq(eventAmbiances.eventId, event.id))

  return NextResponse.json({
    ...event,
    venue,
    category,
    tags: eventTagsList.map((t) => t.tag),
    ambiances: eventAmbiancesList.map((a) => a.ambiance),
  })
}
