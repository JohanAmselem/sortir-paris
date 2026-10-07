import type { Metadata } from 'next'
import { requireUser } from '@/app/club/_lib/api'
import { safeNext } from '@/app/club/_lib/safe-next'
import { LocalSync } from '@/app/club/_components/local-sync'
import { OnboardingFlow } from './onboarding-flow'
import { loadPreferences } from './load-preferences'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bienvenue au Club',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next
  const next = safeNext(rawNext)
  const user = await requireUser(`/onboarding${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`)
  const initial = await loadPreferences(user.id)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:pt-12">
      <LocalSync />
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Bienvenue au Club</p>
      <h1 className="font-display mt-2 text-[2.8rem] text-ink sm:text-[3.4rem]">Trois questions, et on te connaît mieux.</h1>
      <p className="mt-2 text-[15px] text-text-secondary">Tu pourras tout changer plus tard dans ton compte.</p>
      <div className="mt-8">
        <OnboardingFlow initial={initial} next={next} />
      </div>
    </div>
  )
}
