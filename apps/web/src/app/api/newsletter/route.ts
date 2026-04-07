import { NextRequest, NextResponse } from 'next/server'
import { db } from '@sortir/db'
import { sql } from 'drizzle-orm'

// POST /api/newsletter — Subscribe email to newsletter
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = body.email?.trim().toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    // Upsert into newsletter_subscribers
    // Note: table must exist (created via migration or manually)
    await db.execute(sql`
      INSERT INTO newsletter_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET unsubscribed = FALSE, subscribed_at = NOW()
    `)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Newsletter] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
