import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Session refresh only where auth matters. Public pages (the vast majority,
 * and every <Link> prefetch) no longer pay a Supabase round-trip.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/compte/:path*',
    '/login',
    '/onboarding',
    '/match',
    '/drop',
    '/quiz',
    '/club',
    '/api/(saves|attendance|reviews|swipe|drop|preferences|taste-quiz|profile|auth|me|views|newsletter)/:path*',
  ],
}
