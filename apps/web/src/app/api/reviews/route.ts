import { NextRequest, NextResponse } from 'next/server'
import { db, eventReviews, users } from '@sortir/db'
import { eq, and, desc, sql, avg, count } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'

// GET /api/reviews?eventId=xxx — Get reviews for an event
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const reviews = await db
    .select({
      id: eventReviews.id,
      rating: eventReviews.rating,
      comment: eventReviews.comment,
      createdAt: eventReviews.createdAt,
      userName: users.name,
      userAvatar: users.avatarUrl,
    })
    .from(eventReviews)
    .innerJoin(users, eq(eventReviews.userId, users.id))
    .where(eq(eventReviews.eventId, eventId))
    .orderBy(desc(eventReviews.createdAt))
    .limit(50)

  // Aggregate stats
  const [stats] = await db
    .select({
      avgRating: avg(eventReviews.rating),
      totalReviews: count(),
    })
    .from(eventReviews)
    .where(eq(eventReviews.eventId, eventId))

  // Check if current user has already reviewed
  let userReview = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const existing = await db
        .select()
        .from(eventReviews)
        .where(and(eq(eventReviews.userId, user.id), eq(eventReviews.eventId, eventId)))
        .limit(1)
      userReview = existing[0] ?? null
    }
  } catch {
    // Not authenticated, that's fine
  }

  return NextResponse.json({
    reviews,
    stats: {
      avgRating: stats.avgRating ? parseFloat(String(stats.avgRating)) : null,
      totalReviews: Number(stats.totalReviews),
    },
    userReview,
  })
}

// POST /api/reviews — Create or update a review
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId, rating, comment } = await request.json()

  if (!eventId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'eventId and rating (1-5) required' }, { status: 400 })
  }

  // Upsert review
  const existing = await db
    .select()
    .from(eventReviews)
    .where(and(eq(eventReviews.userId, user.id), eq(eventReviews.eventId, eventId)))
    .limit(1)

  if (existing.length > 0) {
    // Update
    await db
      .update(eventReviews)
      .set({
        rating,
        comment: comment?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(eventReviews.id, existing[0].id))
  } else {
    // Insert
    await db.insert(eventReviews).values({
      userId: user.id,
      eventId,
      rating,
      comment: comment?.trim() || null,
    })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/reviews?eventId=xxx — Delete user's review
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  await db
    .delete(eventReviews)
    .where(and(eq(eventReviews.userId, user.id), eq(eventReviews.eventId, eventId)))

  return NextResponse.json({ success: true })
}
