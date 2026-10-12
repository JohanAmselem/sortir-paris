'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { ArtistAlertSearch } from '@/components/follow/artist-alert-search'
import { PreferencesForm, type Preferences } from './preferences-form'

export function OnboardingFlow({ initial, next, spotifyImport }: { initial: Preferences; next: string; spotifyImport: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'preferences' | 'artists'>('preferences')
  const go = () => {
    router.replace(next)
    router.refresh()
  }
  const skip = async () => {
    // Skipping still marks onboarding as done, so we don't ask again.
    await fetch('/api/auth/onboarded', { method: 'POST' }).catch(() => {})
    go()
  }

  if (step === 'preferences') {
    return <PreferencesForm initial={initial} mode="onboarding" onDone={() => setStep('artists')} onSkip={skip} />
  }

  // Optional last step: « Tes artistes » (alertes concerts).
  return (
    <section aria-labelledby="onboarding-artists-title">
      <div className="flex items-center justify-between text-[13px] text-text-muted">
        <span>Dernière étape, facultative</span>
        <button type="button" onClick={go} className="inline-flex h-11 items-center px-2 hover:text-ink">
          Passer
        </button>
      </div>
      <h2 id="onboarding-artists-title" className="font-display mt-4 text-[2.2rem] text-ink">
        Tes artistes
      </h2>
      <p className="mt-1 text-[15px] text-text-secondary">
        Suis-les : on te prévient dès qu’ils annoncent une date à Paris, quand la billetterie ouvre et la veille du concert.
      </p>
      <ArtistAlertSearch source="onboarding" className="mt-6" />
      {spotifyImport && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
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
      <button
        type="button"
        onClick={go}
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper transition-colors hover:bg-ink-soft"
      >
        Terminer
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  )
}
