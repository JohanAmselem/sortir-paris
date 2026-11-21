/**
 * Appels à l'API du site. Le jeton Supabase du membre part en
 * `Authorization: Bearer` ; sans session, les routes publiques répondent quand même.
 */
import { API_URL } from './config'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
  }
}

/** Fiche fusionnée avec une autre (doublon de source) : aller à `to`. */
export class RedirectSignal extends Error {
  constructor(public to: string) {
    super('redirect')
  }
}

const FALLBACK: Record<number, string> = {
  401: 'Connecte-toi pour continuer.',
  404: 'Introuvable.',
  409: 'Ce n’est plus possible pour cette sortie.',
  429: 'Trop de requêtes, réessaie dans un instant.',
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
  opts.signal?.addEventListener('abort', () => controller.abort())
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await accessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(0, 'Pas de connexion. Vérifie ton réseau et réessaie.')
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => null)) as { error?: string; redirect?: string } | null
  if (res.status === 308 && data?.redirect) throw new RedirectSignal(data.redirect)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? FALLBACK[res.status] ?? 'Une erreur est survenue, réessaie dans un instant.', data)
  return data as T
}

/** Message lisible pour n'importe quelle erreur. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Une erreur est survenue, réessaie dans un instant.'
}
