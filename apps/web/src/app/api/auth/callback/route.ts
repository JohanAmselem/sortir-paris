import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db, users } from '@sortir/db'
import { eq } from 'drizzle-orm'

// GET /api/auth/callback — OAuth / Magic Link callback handler
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Ensure user exists in our DB
        const existing = await db
          .select({ id: users.id, onboarded: users.onboarded })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)

        if (existing.length === 0) {
          // Create user in DB on first login
          await db.insert(users).values({
            id: user.id,
            email: user.email!,
            name:
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              user.email?.split('@')[0] ||
              null,
            avatarUrl:
              user.user_metadata?.avatar_url ||
              user.user_metadata?.picture ||
              null,
            onboarded: false,
          })
          // New user → go to onboarding
          return NextResponse.redirect(`${origin}/onboarding`)
        }

        // Existing user — check if onboarded
        if (!existing[0].onboarded) {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
