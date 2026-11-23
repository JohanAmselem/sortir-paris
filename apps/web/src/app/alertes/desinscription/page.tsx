import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { unsubscribeByToken } from '@/lib/alerts-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Se désinscrire des alertes',
  robots: { index: false, follow: false },
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

async function unsubscribe(formData: FormData) {
  'use server'
  const token = String(formData.get('token') ?? '').slice(0, 200)
  let state = 'invalide'
  try {
    state = (await unsubscribeByToken(token)) ? 'ok' : 'invalide'
  } catch (err) {
    console.error('[alertes/desinscription] failed', err)
    state = 'erreur'
  }
  redirect(`/alertes/desinscription?etat=${state}${state === 'erreur' ? `&token=${encodeURIComponent(token)}` : ''}`)
}

/**
 * Link at the bottom of every alert e-mail. Opening it does nothing by itself
 * (mail scanners open links): one button confirms, then alert e-mails stop.
 */
export default async function DesinscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const token = first(sp.token).slice(0, 200)
  const state = first(sp.etat)

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:pt-14">
      <p className="t-micro font-semibold text-accent">Alertes artistes</p>
      <h1 className="t-display mt-2 text-ink">
        {state === 'ok' ? 'C’est noté.' : 'Ne plus recevoir les alertes par e-mail ?'}
      </h1>

      {state === 'ok' ? (
        <p role="status" className="t-body mt-4 leading-relaxed text-text-secondary">
          Tu ne recevras plus d’alertes par e-mail. Tu suis toujours tes artistes : tu peux réactiver les e-mails ou choisir les
          notifications sur ton téléphone depuis{' '}
          <Link href="/compte/artistes" className="font-semibold text-accent underline underline-offset-2">
            Mes artistes
          </Link>
          .
        </p>
      ) : state === 'invalide' || (!state && !token) ? (
        <p role="alert" className="t-body mt-4 rounded-xl bg-neon-soft p-4 text-ink">
          Ce lien n’est pas valide. Connecte-toi et règle tes alertes depuis{' '}
          <Link href="/compte/artistes" className="font-semibold text-accent underline underline-offset-2">
            Mes artistes
          </Link>
          .
        </p>
      ) : (
        <>
          {state === 'erreur' && (
            <p role="alert" className="t-body mt-4 rounded-xl bg-neon-soft p-4 text-ink">
              La désinscription n’a pas abouti. Réessaie dans un instant.
            </p>
          )}
          <p className="t-body mt-4 leading-relaxed text-text-secondary">
            Tu ne recevras plus d’e-mails pour les nouvelles dates, les ouvertures de billetterie et les rappels de tes sorties. Tes
            artistes suivis restent dans ton compte.
          </p>
          <form action={unsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="t-body inline-flex h-12 items-center rounded-full bg-accent px-6 font-semibold text-paper transition-colors hover:bg-accent-hover"
            >
              Me désinscrire des e-mails
            </button>
          </form>
        </>
      )}
    </div>
  )
}
