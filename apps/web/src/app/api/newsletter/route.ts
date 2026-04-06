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

    // Upsert into a simple newsletter_subscribers approach using raw SQL
    // Since we don't have a dedicated table yet, store in a lightweight way
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        email TEXT PRIMARY KEY,
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        unsubscribed BOOLEAN DEFAULT FALSE
      )
    `)

    await db.execute(sql`
      INSERT INTO newsletter_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET unsubscribed = FALSE
    `)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Newsletter] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
