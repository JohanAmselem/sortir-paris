import type { Metadata } from 'next'
import { DataUnavailable } from '@/components/events/blocks'
import { ArtistsManager, type FollowedArtist } from '@/components/follow/artists-manager'
import { AlertSettingsForm } from '@/components/follow/alert-settings-form'
import { requireUser } from '@/app/club/_lib/api'
import { listFollows } from '@/app/club/_lib/follows'
import { getAlertSettings, getArtistDates } from '@/app/club/_lib/artists'
import { DEFAULT_ALERT_SETTINGS } from '@/lib/alerts'
import { artistKey } from '@/lib/artists'
import { spotifyConfigured } from '@/lib/spotify'
import { BackLink } from '../_components/back-link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mes artistes',
  robots: { index: false, follow: false },
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function spotifyMessage(sp: Record<string, string | string[] | undefined>): { tone: 'ok' | 'ko'; text: string } | null {
  const v = first(sp.spotify)
  if (!v) return null
  if (v === 'erreur') return { tone: 'ko', text: 'L’import Spotify n’a pas abouti. Réessaie dans un instant.' }
  if (v === 'annule') return { tone: 'ko', text: 'Import Spotify annulé.' }
  if (v === 'indisponible') return { tone: 'ko', text: 'L’import Spotify n’est pas disponible pour l’instant.' }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  const already = Number(first(sp.deja) ?? 0) || 0
  const skipped = Number(first(sp.ignores) ?? 0) || 0
  const parts = [`${n} artiste${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`]
  if (already) parts.push(`${already} déjà suivi${already > 1 ? 's' : ''}`)
  if (skipped) parts.push(`${skipped} au-delà de la limite de 100 suivis`)
  return { tone: 'ok', text: parts.join(' · ') + '.' }
}

export default async function MesArtistesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/compte/artistes')
  const sp = await searchParams
  const spotify = spotifyMessage(sp)

  let artists: FollowedArtist[] = []
  let settings = DEFAULT_ALERT_SETTINGS
  let failed = false
  try {
    const [follows, s] = await Promise.all([listFollows(user.id), getAlertSettings(user.id)])
    settings = s
    const artistFollows = follows.filter((f) => f.kind === 'artist' && f.term)
    const dates = await getArtistDates(artistFollows.map((f) => artistKey(f.term!)))
    artists = artistFollows.map((f) => ({
      id: f.id,
      term: f.term!,
      label: f.label,
      dates: dates.get(artistKey(f.term!)) ?? [],
    }))
  } catch (err) {
    console.error('[compte/artistes]', err)
    failed = true
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <BackLink />
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Mes artistes</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Suis tes artistes : on te prévient quand ils annoncent une date à Paris et quand la billetterie ouvre.
      </p>

      {spotify && (
        <p
          role="status"
          className={
            spotify.tone === 'ok'
              ? 'mt-6 rounded-xl bg-accent-soft p-4 text-[15px] font-semibold text-accent'
              : 'mt-6 rounded-xl bg-neon-soft p-4 text-[15px] font-semibold text-ink'
          }
        >
          {spotify.text}
        </p>
      )}

      {failed ? (
        <DataUnavailable className="mt-8" />
      ) : (
        <>
          {spotifyConfigured() && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
              <p className="min-w-0 flex-1 text-[14px] text-text-secondary">
                <span className="block text-[15px] font-semibold text-ink">Importer depuis Spotify</span>
                Tes artistes les plus écoutés et ceux que tu suis. On ne garde aucun accès à ton compte.
              </p>
              {/* Plain link: a full navigation to Spotify (not a client-side route). */}
              <a
                href="/api/spotify/login"
                className="inline-flex h-11 shrink-0 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-paper transition-opacity hover:opacity-90"
              >
                Importer mes artistes
              </a>
            </div>
          )}

          <section aria-label="Artistes suivis" className="mt-8">
            <ArtistsManager initial={artists} />
          </section>

          <section aria-labelledby="alertes-title" id="alertes" className="mt-12 scroll-mt-20">
            <h2 id="alertes-title" className="font-display text-[2rem] text-ink">
              Tes alertes
            </h2>
            <div className="mt-4">
              <AlertSettingsForm
                initial={settings}
                vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null}
                emailAvailable={Boolean(process.env.RESEND_API_KEY)}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
