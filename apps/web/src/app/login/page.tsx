import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/app/club/_lib/api'
import { safeNext } from '@/app/club/_lib/safe-next'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Se connecter',
  description: 'Connecte-toi à Paname Club pour garder tes sorties, ton profil culturel et recevoir ton Drop du lundi.',
  robots: { index: false, follow: true },
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const sp = await searchParams
  const next = safeNext(first(sp.next))
  if (await getSessionUser()) redirect(next)

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:items-center md:pt-16">
      <section>
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Rejoins le Club</p>
        <h1 className="font-display mt-2 text-[3.2rem] text-ink sm:text-[4.2rem]">Garde tes sorties, reçois les tiennes.</h1>
        <ul className="mt-6 space-y-3 text-[15px] text-text-secondary">
          <li>
            <strong className="font-semibold text-ink">Tes sorties au même endroit.</strong> Garde ce qui te tente, retrouve-le
            sur tous tes appareils.
          </li>
          <li>
            <strong className="font-semibold text-ink">Le Drop du lundi.</strong> 5 idées par semaine, choisies selon tes goûts.
          </li>
          <li>
            <strong className="font-semibold text-ink">Rien de perdu.</strong> Tes swipes et ton quiz faits sans compte sont
            repris automatiquement.
          </li>
        </ul>
      </section>
      <section aria-label="Connexion" className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <LoginForm next={next} authError={Boolean(first(sp.error))} />
      </section>
    </div>
  )
}
