/**
 * Accès aux données de l'appli (TanStack Query). Clés : [famille, …paramètres].
 * Les familles 'home2', 'meta', 'event', 'venue', 'me' sont gardées
 * hors-ligne (lib/query.tsx).
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import type {
  AgendaResponse,
  CardEvent,
  EventPage,
  HomeV2Response,
  HomeWhen,
  EventResponse,
  MeResponse,
  MetaResponse,
  VenueResponse,
  WorkResponse,
} from '@/shared'
import { api, ApiError } from './api'
import { showToast } from './toast'
import { useSession } from './auth'
import { toggleLocalSave, useLocalState } from './local-store'
import { track } from './analytics'
import type {
  ArtistDate,
  ArtistSuggestion,
  AttendanceInfo,
  FollowState,
  GamificationResult,
  MapResponse,
  Suggestions,
} from './types'

// ── Lecture ─────────────────────────────────────────────────────────────

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<MetaResponse>('/api/v1/meta'), staleTime: 24 * 3600_000 })

/** Accueil 2.0 : notre choix pour la fenêtre choisie, envies, week-end, grosses dates, expos. */
export const useHomeV2 = (when: HomeWhen, coords: { lat: number; lng: number } | null = null) =>
  useQuery({
    queryKey: ['home2', when, coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : null],
    queryFn: () => {
      const sp = new URLSearchParams({ when })
      if (coords) {
        sp.set('lat', coords.lat.toFixed(4))
        sp.set('lng', coords.lng.toFixed(4))
      }
      return api<HomeV2Response>(`/api/v2/home?${sp.toString()}`, { timeoutMs: 25_000 })
    },
    placeholderData: keepPreviousData,
  })

/**
 * L'Agenda : tout ce qui vient, trié par date, page après page sans limite
 * (curseur), ou par distance (décalage) quand on cherche près de soi.
 */
export function useAgenda(params: string) {
  return useInfiniteQuery({
    queryKey: ['agenda', params],
    initialPageParam: { cursor: null as string | null, offset: 0 },
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams(params)
      if (pageParam.cursor) sp.set('cursor', pageParam.cursor)
      if (pageParam.offset) sp.set('offset', String(pageParam.offset))
      return api<AgendaResponse>(`/api/v2/agenda?${sp.toString()}`, { timeoutMs: 20_000 })
    },
    getNextPageParam: (last) =>
      last.nextCursor ? { cursor: last.nextCursor, offset: 0 } : last.nextOffset != null ? { cursor: null, offset: last.nextOffset } : undefined,
    placeholderData: keepPreviousData,
  })
}

export const useEvent = (slug: string) =>
  useQuery({ queryKey: ['event', slug], queryFn: () => api<EventResponse>(`/api/v1/events/${encodeURIComponent(slug)}`), enabled: !!slug })

export const useVenue = (slug: string) =>
  useQuery({ queryKey: ['venue', slug], queryFn: () => api<VenueResponse>(`/api/v1/venues/${encodeURIComponent(slug)}`), enabled: !!slug })

export const useWork = (slug: string, kind: 'work' | 'film') =>
  useQuery({ queryKey: ['work', kind, slug], queryFn: () => api<WorkResponse>(`/api/v1/works/${encodeURIComponent(slug)}?kind=${kind}`), enabled: !!slug })

/** Liste paginée, mêmes paramètres que les URL du site (?when=…&cat=…). */
export function useEventList(params: string, pageSize = 24) {
  return useInfiniteQuery({
    queryKey: ['events', params],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams(params)
      sp.set('limit', String(pageSize))
      sp.set('offset', String(pageParam))
      return api<EventPage>(`/api/events?${sp.toString()}`)
    },
    getNextPageParam: (last, all) => (last.hasMore ? all.reduce((n, p) => n + p.events.length, 0) : undefined),
  })
}

export const useMapData = (params: string) =>
  useQuery({ queryKey: ['map', params], queryFn: () => api<MapResponse>(`/api/map?${params}`, { timeoutMs: 25_000 }), staleTime: 5 * 60_000 })

export const useSuggest = (q: string) =>
  useQuery({
    queryKey: ['suggest', q],
    queryFn: () => api<Suggestions>(`/api/suggest?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  })

export const useMe = () => {
  const session = useSession()
  return useQuery({ queryKey: ['me', session?.user.id], queryFn: () => api<MeResponse>('/api/v1/me'), enabled: !!session })
}

export const useAttendance = (eventId: string | undefined) => {
  const session = useSession()
  return useQuery({
    queryKey: ['attendance', eventId, session?.user.id ?? 'anon'],
    queryFn: () => api<AttendanceInfo>(`/api/attendance?eventId=${eventId}`),
    enabled: !!eventId,
  })
}

export const useArtistFollow = (term: string | undefined) => {
  const session = useSession()
  return useQuery({
    queryKey: ['follow', 'artist', term, session?.user.id ?? 'anon'],
    queryFn: () => api<FollowState>(`/api/follows?term=${encodeURIComponent(term!)}`),
    enabled: !!term && !!session,
  })
}

export const useVenueFollow = (venueId: string | undefined) => {
  const session = useSession()
  return useQuery({
    queryKey: ['follow', 'venue', venueId, session?.user.id ?? 'anon'],
    queryFn: () => api<FollowState>(`/api/follows?venueId=${venueId}`),
    enabled: !!venueId && !!session,
  })
}

export const useArtistSuggest = (q: string) =>
  useQuery({
    queryKey: ['artist-suggest', q],
    queryFn: () => api<{ artists: ArtistSuggestion[] }>(`/api/artists/suggest?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })

export const useArtistDates = (key: string | undefined) =>
  useQuery({
    queryKey: ['artist-dates', key],
    queryFn: () => api<{ dates: ArtistDate[] }>(`/api/artists/${encodeURIComponent(key!)}/dates`),
    enabled: !!key,
  })

// ── Garder (avec ou sans compte) ────────────────────────────────────────

/** Ids gardés : ceux du compte si connecté, sinon ceux du téléphone. */
export function useSavedIds(): Set<string> {
  const session = useSession()
  const me = useMe()
  const local = useLocalState((s) => s.saves)
  if (session && me.data) return new Set([...me.data.saved.upcoming, ...me.data.saved.past].map((e) => e.id))
  return new Set(Object.keys(local))
}

export function useToggleSave() {
  const session = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ event, saved }: { event: CardEvent; saved: boolean }) => {
      Haptics.selectionAsync().catch(() => {})
      track('save', { saved })
      if (!session) {
        toggleLocalSave(event)
        return { saved }
      }
      return api<{ saved: boolean } & GamificationResult>('/api/saves', { method: 'POST', body: { eventId: event.id, saved } })
    },
    onMutate: async ({ event, saved }) => {
      if (!session) return
      const key = ['me', session.user.id]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<MeResponse>(key)
      if (prev) {
        const upcoming = saved ? [...prev.saved.upcoming.filter((e) => e.id !== event.id), event] : prev.saved.upcoming.filter((e) => e.id !== event.id)
        const past = saved ? prev.saved.past : prev.saved.past.filter((e) => e.id !== event.id)
        qc.setQueryData<MeResponse>(key, { ...prev, saved: { upcoming, past } })
      }
      return { prev, key }
    },
    onError: (err, { saved }, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev)
      showToast(err instanceof ApiError && err.status === 0 ? 'Pas de connexion : réessaie quand tu as du réseau.' : saved ? 'La sortie n’a pas pu être gardée.' : 'La sortie n’a pas pu être retirée.')
    },
    onSettled: () => {
      if (session) qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

// ── J'y vais, suivis, avis ──────────────────────────────────────────────

export function useToggleAttend(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attending: boolean) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      track('attend', { attending })
      return api<{ attending: boolean } & GamificationResult>('/api/attendance', { method: 'POST', body: { eventId, attending } })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['attendance', eventId] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useFollowArtist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ term, label, follow, id }: { term: string; label: string; follow: boolean; id?: string | null }) => {
      Haptics.selectionAsync().catch(() => {})
      track('follow', { kind: 'artist', follow })
      return follow
        ? api('/api/follows', { method: 'POST', body: { kind: 'artist', term, label } })
        : api('/api/follows', { method: 'DELETE', body: id ? { id } : { kind: 'artist', term } })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['follow'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useFollowVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ venueId, follow }: { venueId: string; follow: boolean }) => {
      Haptics.selectionAsync().catch(() => {})
      track('follow', { kind: 'venue', follow })
      return api('/api/follows', { method: follow ? 'POST' : 'DELETE', body: { kind: 'venue', venueId } })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['follow'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useUnfollow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api('/api/follows', { method: 'DELETE', body: { id } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['follow'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useUpdateAlerts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<MeResponse['alerts']>) => api<{ alerts: MeResponse['alerts'] }>('/api/v1/me', { method: 'PATCH', body: changes }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

/** Compte une vue de fiche (comme le site), une fois par ouverture. */
export function countView(eventId: string) {
  api('/api/views', { method: 'POST', body: { eventId } }).catch(() => {})
}
