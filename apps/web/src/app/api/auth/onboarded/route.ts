import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, users } from '@sortir/db'
import { ensureUserRow, errors, getSessionUser, limit } from '@/app/club/_lib/api'

export const dynamic = 'force-dynamic'

// POST /api/auth/onboarded — mark onboarding as done (also when skipped).
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'onboarded', 10, 60_000, user.id)
  if (limited) return limited
  try {
    await ensureUserRow(user)
    await db.update(users).set({ onboarded: true, updatedAt: new Date() }).where(eq(users.id, user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/auth/onboarded] failed', err)
    return errors.server()
  }
}
