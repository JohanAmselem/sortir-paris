import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, newsletterSubscribers } from '@sortir/db'
import { limit } from '@/app/club/_lib/api'

export const dynamic = 'force-dynamic'

// GET /api/newsletter/confirm?token= — double opt-in confirmation link.
export async function GET(request: NextRequest) {
  const url = new URL('/newsletter', request.nextUrl.origin)
  const limited = limit(request, 'newsletter-confirm', 20, 10 * 60_000)
  if (limited) return limited

  const token = request.nextUrl.searchParams.get('token') ?? ''
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    url.searchParams.set('confirmation', 'invalide')
    return NextResponse.redirect(url)
  }
  try {
    const updated = await db
      .update(newsletterSubscribers)
      .set({ confirmed: true, confirmedAt: new Date(), confirmToken: null })
      .where(and(eq(newsletterSubscribers.confirmToken, token), eq(newsletterSubscribers.unsubscribed, false)))
      .returning({ id: newsletterSubscribers.id })
    url.searchParams.set('confirmation', updated.length ? 'ok' : 'invalide')
  } catch (err) {
    console.error('[newsletter/confirm] failed', err)
    url.searchParams.set('confirmation', 'erreur')
  }
  return NextResponse.redirect(url)
}
