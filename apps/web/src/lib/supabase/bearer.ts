/**
 * Mobile app authentication: the app sends the Supabase access token as
 * `Authorization: Bearer <jwt>` instead of cookies. The token is validated by
 * the Supabase auth server (getUser), exactly like the cookie path.
 */
import 'server-only'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return client
}

const BEARER = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/

/** The bearer token of a request, or null (absent or malformed). */
export function bearerToken(headers: Pick<Headers, 'get'>): string | null {
  const value = headers.get('authorization')
  if (!value) return null
  const m = BEARER.exec(value.trim())
  return m ? m[1] : null
}

/** The user owning this access token, or null (expired, revoked, invalid). Never throws. */
export async function getBearerUser(token: string): Promise<User | null> {
  try {
    const { data, error } = await supabase().auth.getUser(token)
    return error ? null : (data.user ?? null)
  } catch {
    return null
  }
}
