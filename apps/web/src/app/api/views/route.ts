import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db, events, userViews } from '@sortir/db'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { errors, getSessionUser, idSchema, parseBody } from '@/app/club/_lib/api'

export const dynamic = 'force-dynamic'

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|go-http|axios|node-fetch/i

const bodySchema = z.object({ eventId: idSchema })

// POST /api/views — count a view (no bots, once per IP + event per hour).
export async function POST(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: true, counted: false })

  const ip = clientIp(request.headers)
  // Global burst protection per IP, then per-event dedupe.
  if (!rateLimit(`views:${ip}`, 120, 60_000).ok) return NextResponse.json({ ok: true, counted: false })

  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { eventId } = body.data

  if (!rateLimit(`view:${ip}:${eventId}`, 1, 3600_000).ok) return NextResponse.json({ ok: true, counted: false })

  try {
    const updated = await db
      .update(events)
      .set({ viewCount: sql`${events.viewCount} + 1` })
      .where(eq(events.id, eventId))
      .returning({ id: events.id })
    if (!updated.length) return errors.notFound('Événement introuvable.')

    const user = await getSessionUser()
    if (user) {
      // Member history (best effort: the users row may not exist yet).
      await db
        .insert(userViews)
        .values({ userId: user.id, eventId })
        .catch(() => {})
    }
    return NextResponse.json({ ok: true, counted: true })
  } catch (err) {
    console.error('[api/views] failed', err)
    return errors.server()
  }
}
