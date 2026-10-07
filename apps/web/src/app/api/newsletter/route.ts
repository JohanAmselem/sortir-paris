import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, newsletterSubscribers } from '@sortir/db'
import { errors, limit, parseBody } from '@/app/club/_lib/api'
import { absoluteUrl, SITE_NAME } from '@/lib/site'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Adresse email invalide.')
    .pipe(z.email({ message: 'Adresse email invalide.' })),
  /** Honeypot: hidden field, humans leave it empty. */
  website: z.string().max(500).optional(),
  source: z
    .string()
    .max(40)
    .regex(/^[a-z0-9_-]*$/i)
    .optional(),
})

/**
 * Same answer whatever the address's state (new, pending, confirmed,
 * unsubscribed): never reveals whether someone is subscribed, never
 * re-subscribes someone who left.
 */
function neutral(emailEnabled: boolean) {
  return NextResponse.json({ ok: true, confirmBy: emailEnabled ? 'email' : 'later' })
}

const emailEnabled = () => Boolean(process.env.RESEND_API_KEY)

async function sendConfirmation(email: string, token: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const link = absoluteUrl(`/api/newsletter/confirm?token=${encodeURIComponent(token)}`)
  const from = process.env.NEWSLETTER_FROM ?? `${SITE_NAME} <newsletter@panameclub.fr>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Confirme ton inscription à la lettre Paname Club',
        text: `Salut !\n\nConfirme ton inscription à la lettre hebdo de ${SITE_NAME} en ouvrant ce lien :\n${link}\n\nSi tu n'as rien demandé, ignore simplement ce message.`,
        html: `<p>Salut !</p><p>Confirme ton inscription à la lettre hebdo de ${SITE_NAME} :</p><p><a href="${link}">Je confirme mon inscription</a></p><p style="color:#666">Si tu n'as rien demandé, ignore simplement ce message.</p>`,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[newsletter] resend status', res.status)
    return res.ok
  } catch (err) {
    console.error('[newsletter] resend failed', err)
    return false
  }
}

// POST /api/newsletter — double opt-in signup.
export async function POST(request: NextRequest) {
  const limited = limit(request, 'newsletter', 5, 10 * 60_000)
  if (limited) return limited

  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response
  const { email, website, source } = body.data
  if (website) return neutral(emailEnabled()) // bot

  try {
    const [existing] = await db
      .select({
        id: newsletterSubscribers.id,
        confirmed: newsletterSubscribers.confirmed,
        unsubscribed: newsletterSubscribers.unsubscribed,
        token: newsletterSubscribers.confirmToken,
      })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1)

    if (existing) {
      // Pending: resend the confirmation (rate-limited per address).
      if (!existing.confirmed && !existing.unsubscribed && existing.token && emailEnabled()) {
        const perAddress = limit(request, `newsletter-resend:${email}`, 1, 60 * 60_000, email)
        if (!perAddress) await sendConfirmation(email, existing.token)
      }
      return neutral(emailEnabled())
    }

    const token = randomBytes(24).toString('base64url')
    const inserted = await db
      .insert(newsletterSubscribers)
      .values({ email, confirmToken: token, source: source || 'site' })
      .onConflictDoNothing()
      .returning({ id: newsletterSubscribers.id })
    if (inserted.length) await sendConfirmation(email, token)
    return neutral(emailEnabled())
  } catch (err) {
    console.error('[api/newsletter] failed', err)
    return errors.server()
  }
}
