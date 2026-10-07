'use client'

import { useRouter } from 'next/navigation'
import { PreferencesForm, type Preferences } from './preferences-form'

export function OnboardingFlow({ initial, next }: { initial: Preferences; next: string }) {
  const router = useRouter()
  const go = () => {
    router.replace(next)
    router.refresh()
  }
  const skip = async () => {
    // Skipping still marks onboarding as done, so we don't ask again.
    await fetch('/api/auth/onboarded', { method: 'POST' }).catch(() => {})
    go()
  }
  return <PreferencesForm initial={initial} mode="onboarding" onDone={go} onSkip={skip} />
}
