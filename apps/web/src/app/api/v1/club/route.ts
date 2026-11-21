import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/club/_lib/api'
import { getMemberOverview, getMembersLovedPast, getMembersTopThisWeek } from '@/app/club/_lib/member'
import { getAnonymousDrop, getMemberDrop } from '@/app/club/_lib/drop'
import { getCommunityHighlights, getWeeklyChallenge } from '@/app/club/_lib/community'
import { BADGES, getXpProgress } from '@/lib/gamification'
import type { ClubMemberV1, ClubResponse } from '@/lib/api-v1/contract'

/**
 * GET /api/v1/club — l'écran « Le Club » de l'appli : Drop de la semaine, défi,
 * Top des membres, plus consultées et plus gardées, coups de cœur notés ;
 * niveau, XP et badges quand le membre est connecté. Mêmes sources que /club.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  try {
    const [overview, drop, top, community, challenge, loved] = await Promise.all([
      user ? getMemberOverview(user.id) : Promise.resolve(null),
      (user ? getMemberDrop(user.id) : getAnonymousDrop()).catch((err) => {
        console.error('[api/v1/club] drop', err)
        return null
      }),
      getMembersTopThisWeek().catch(() => []),
      getCommunityHighlights(),
      getWeeklyChallenge(user?.id ?? null),
      getMembersLovedPast().catch(() => []),
    ])

    let member: ClubMemberV1 | null = null
    if (overview) {
      const p = getXpProgress(overview.xp)
      const earned = new Set(overview.badges)
      member = {
        name: overview.name,
        avatarUrl: overview.avatarUrl,
        memberSince: overview.memberSince,
        xp: overview.xp,
        level: p.current.level,
        levelName: p.current.name,
        nextLevel: p.next ? { level: p.next.level, name: p.next.name, xp: p.next.minXp } : null,
        progress: p.progress,
        badges: BADGES.map((b) => {
          const g = b.progress(overview.stats)
          return { slug: b.slug, name: b.name, emoji: b.emoji, desc: b.desc, earned: earned.has(b.slug), value: g.value, goal: g.goal }
        }),
        archetype: overview.archetype,
        upcomingSaved: overview.upcomingSaved,
      }
    }

    const body = {
      member,
      drop: drop
        ? { weekStart: drop.weekStart, events: drop.events, personalized: drop.personalized, archetype: drop.archetype, ended: drop.ended }
        : { weekStart: '', events: [], personalized: false, archetype: null, ended: 0 },
      challenge: {
        slug: challenge.challenge.slug,
        title: challenge.challenge.title,
        text: challenge.challenge.text,
        goal: challenge.challenge.goal,
        progress: challenge.progress,
        ideas: challenge.ideas,
      },
      topThisWeek: top,
      mostViewed: community.mostViewed,
      mostSaved: community.mostSaved,
      lovedPast: loved,
    } satisfies ClubResponse
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[api/v1/club]', err)
    return NextResponse.json({ error: 'Le Club est indisponible pour le moment.' }, { status: 503 })
  }
}
