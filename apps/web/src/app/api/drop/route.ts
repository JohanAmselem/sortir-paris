import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { clientSignalsSchema, clientToSignals } from '@/lib/recommendations'
import { errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'
import { getAnonymousDrop, getMemberDrop } from '@/app/club/_lib/drop'

export const dynamic = 'force-dynamic'

// GET /api/drop — this week's drop (member: personal + stored; anonymous: generic).
export async function GET() {
  const user = await getSessionUser()
  try {
    const drop = user ? await getMemberDrop(user.id) : await getAnonymousDrop()
    return NextResponse.json({ ...drop, loggedIn: Boolean(user) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[api/drop] GET failed', err)
    return errors.server()
  }
}

const bodySchema = z.object({ signals: clientSignalsSchema })

// POST /api/drop — anonymous drop personalised with local signals (quiz, swipes). Not stored.
export async function POST(request: NextRequest) {
  const limited = limit(request, 'drop', 20, 60_000)
  if (limited) return limited
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  try {
    const drop = await getAnonymousDrop(clientToSignals(body.data.signals))
    return NextResponse.json(drop, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[api/drop] POST failed', err)
    return errors.server()
  }
}
