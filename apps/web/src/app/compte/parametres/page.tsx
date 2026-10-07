import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/app/club/_lib/api'
import { loadPreferences } from '@/app/onboarding/load-preferences'
import { PreferencesForm } from '@/app/onboarding/preferences-form'
import { BackLink } from '../_components/back-link'
import { LogoutButton } from '../_components/logout-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Préférences',
  robots: { index: false, follow: false },
}

export default async function ParametresPage() {
  const user = await requireUser('/compte/parametres')
  const initial = await loadPreferences(user.id)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <BackLink />
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Préférences</h1>
      <p className="mt-1 text-[15px] text-text-secondary">Elles orientent ton Drop du lundi et la sélection « Pour toi ».</p>

      <div className="mt-8">
        <PreferencesForm initial={initial} mode="settings" />
      </div>

      <section aria-labelledby="account-title" className="mt-14 border-t border-border pt-8">
        <h2 id="account-title" className="font-display text-[2rem] text-ink">
          Compte
        </h2>
        <p className="mt-2 text-[15px] text-text-secondary">
          Connecté avec {user.email}. La lettre hebdo se gère sur la{' '}
          <Link href="/newsletter" className="font-semibold text-accent underline underline-offset-2">
            page newsletter
          </Link>
          . Pour supprimer ton compte et tes données, écris-nous à{' '}
          <a href="mailto:contact@panameclub.fr" className="font-semibold text-accent underline underline-offset-2">
            contact@panameclub.fr
          </a>
          .
        </p>
        <div className="mt-5">
          <LogoutButton />
        </div>
      </section>
    </div>
  )
}
