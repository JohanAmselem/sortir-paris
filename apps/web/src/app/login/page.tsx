import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/member/api'
import { safeNext } from '@/lib/member/safe-next'
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
        <p className="t-micro text-accent">Ton compte Paname Club</p>
        <h1 className="t-display mt-2 text-ink">Garde tes sorties, reçois les tiennes.</h1>
        <ul className="t-body mt-6 space-y-3 text-text-secondary">
          <li>
            <strong className="font-semibold text-ink">Tes sorties au même endroit.</strong> Garde ce qui te tente, retrouve-le
            sur tous tes appareils.
          </li>
          <li>
            <strong className="font-semibold text-ink">Le Drop du lundi.</strong> 5 idées par semaine en notification, choisies selon tes goûts.
          </li>
          <li>
            <strong className="font-semibold text-ink">Tes artistes.</strong> Une alerte dès qu’ils annoncent une date à Paris, et
            la veille du concert.
          </li>
        </ul>
      </section>
      <section aria-label="Connexion" className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <LoginForm next={next} authError={Boolean(first(sp.error))} />
      </section>
    </div>
  )
}
