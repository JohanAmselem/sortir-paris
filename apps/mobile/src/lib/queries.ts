/**
 * Accès aux données de l'appli (TanStack Query). Clés : [famille, …paramètres].
 * Les familles 'home', 'meta', 'event', 'venue', 'me', 'club', 'drop' sont
 * gardées hors-ligne (lib/query.tsx).
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import type {
  CardEvent,
  ClubResponse,
  EventPage,
  EventResponse,
  HomeResponse,
  MeResponse,
  MetaResponse,
  VenueResponse,
  WorkResponse,
} from '@/shared'
import { api } from './api'
import { useSession } from './auth'
import { toggleLocalSave, useLocalState } from './local-store'
import { track } from './analytics'
import type {
  AdnResponse,
  ArtistDate,
  ArtistSuggestion,
  AttendanceInfo,
  DropResponse,
  FollowState,
  GamificationResult,
  MapResponse,
  Recommendation,
  ReviewsResponse,
  Suggestions,
  SwipeDeck,
  TasteQuizState,
} from './types'

// ── Lecture ─────────────────────────────────────────────────────────────

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<MetaResponse>('/api/v1/meta'), staleTime: 24 * 3600_000 })

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => api<HomeResponse>('/api/v1/home', { timeoutMs: 25_000 }) })

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

export const useClub = () => {
  const session = useSession()
  return useQuery({ queryKey: ['club', session?.user.id ?? 'anon'], queryFn: () => api<ClubResponse>('/api/v1/club', { timeoutMs: 25_000 }) })
}

export const useDrop = () => {
  const session = useSession()
  return useQuery({ queryKey: ['drop', session?.user.id ?? 'anon'], queryFn: () => api<DropResponse>('/api/drop', { timeoutMs: 25_000 }) })
}

export const useMe = () => {
  const session = useSession()
  return useQuery({ queryKey: ['me', session?.user.id], queryFn: () => api<MeResponse>('/api/v1/me'), enabled: !!session })
}

export const useAdn = () => {
  const session = useSession()
  return useQuery({ queryKey: ['adn', session?.user.id], queryFn: () => api<AdnResponse>('/api/profile/adn'), enabled: !!session })
}

export const useTasteQuiz = () => {
  const session = useSession()
  return useQuery({ queryKey: ['taste-quiz', session?.user.id], queryFn: () => api<TasteQuizState>('/api/taste-quiz'), enabled: !!session })
}

export const useSwipeDeck = () => {
  const session = useSession()
  return useQuery({ queryKey: ['swipe-deck', session?.user.id ?? 'anon'], queryFn: () => api<SwipeDeck>('/api/swipe'), staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false })
}

export const useReviews = (eventId: string | undefined) =>
  useQuery({ queryKey: ['reviews', eventId], queryFn: () => api<ReviewsResponse>(`/api/reviews?eventId=${eventId}`), enabled: !!eventId })

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

/** « Je veux sortir… » : pastilles (GET, en cache CDN) ou phrase libre (POST). */
export async function discover(input: { params?: URLSearchParams; text?: string; coords?: { lat: number; lng: number } | null }): Promise<Recommendation> {
  if (input.text) {
    track('ai_search', { length: input.text.length })
    return api<Recommendation>('/api/discover', { method: 'POST', body: { q: input.text, limit: 4, ...(input.coords ?? {}) } })
  }
  return api<Recommendation>(`/api/discover?${input.params?.toString() ?? ''}`)
}

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
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev)
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

export function useSendReview(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { rating: number; comment?: string | null }) => api('/api/reviews', { method: 'POST', body: { eventId, ...body } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['reviews', eventId] }),
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
