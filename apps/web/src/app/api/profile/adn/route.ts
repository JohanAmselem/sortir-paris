import { NextResponse } from 'next/server'
import { db, users, userSaves, userSwipes, eventReviews, userAttendances, events, categories } from '@sortir/db'
import { eq, and, sql, count, desc } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { getLevelForXp, getXpProgress, BADGES, type BadgeSlug } from '@/lib/gamification'

// GET /api/profile/adn — Get user's cultural DNA profile
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user data
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Get category distribution from all interactions (saves, reviews, attendances, right swipes)
  const categoryStats = await db
    .select({
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryIcon: categories.icon,
      interactionCount: sql<number>`count(*)::int`,
    })
    .from(
      sql`(
        SELECT event_id FROM user_saves WHERE user_id = ${user.id}
        UNION ALL
        SELECT event_id FROM event_reviews WHERE user_id = ${user.id}
        UNION ALL
        SELECT event_id FROM user_attendances WHERE user_id = ${user.id}
        UNION ALL
        SELECT event_id FROM user_swipes WHERE user_id = ${user.id} AND direction = 'right'
      ) AS interactions`
    )
    .innerJoin(events, eq(events.id, sql`interactions.event_id`))
    .innerJoin(categories, eq(events.categoryId, categories.id))
    .groupBy(categories.name, categories.slug, categories.icon)
    .orderBy(desc(sql`count(*)`))

  // Calculate total interactions
  const totalInteractions = categoryStats.reduce((sum, c) => sum + c.interactionCount, 0)

  // Build ADN percentages
  const adn = categoryStats.map(c => ({
    category: c.categoryName,
    slug: c.categorySlug,
    icon: c.categoryIcon,
    count: c.interactionCount,
    percentage: totalInteractions > 0 ? Math.round((c.interactionCount / totalInteractions) * 100) : 0,
  }))

  // Get stats
  const [[saveCount], [reviewCount], [attendCount], [swipeCount]] = await Promise.all([
    db.select({ count: count() }).from(userSaves).where(eq(userSaves.userId, user.id)),
    db.select({ count: count() }).from(eventReviews).where(eq(eventReviews.userId, user.id)),
    db.select({ count: count() }).from(userAttendances).where(eq(userAttendances.userId, user.id)),
    db.select({ count: count() }).from(userSwipes).where(eq(userSwipes.userId, user.id)),
  ])

  const stats = {
    saves: Number(saveCount.count),
    reviews: Number(reviewCount.count),
    attendances: Number(attendCount.count),
    swipes: Number(swipeCount.count),
    totalInteractions,
  }

  // Parse badges
  const badgeSlugs = dbUser.badges ? dbUser.badges.split(',').filter(Boolean) as BadgeSlug[] : []
  const userBadges = badgeSlugs
    .filter(slug => slug in BADGES)
    .map(slug => ({ slug, ...BADGES[slug] }))

  // Level info
  const xpInfo = getXpProgress(dbUser.xp)

  return NextResponse.json({
    adn,
    stats,
    xp: dbUser.xp,
    level: xpInfo.current,
    nextLevel: xpInfo.next,
    xpProgress: xpInfo.progress,
    xpInLevel: xpInfo.xpInLevel,
    xpNeeded: xpInfo.xpNeeded,
    badges: userBadges,
    userName: dbUser.name ?? user.email?.split('@')[0],
    avatarUrl: dbUser.avatarUrl ?? user.user_metadata?.avatar_url,
    memberSince: dbUser.createdAt,
  })
}
