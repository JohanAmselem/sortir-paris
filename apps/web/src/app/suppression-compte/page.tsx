import type { Metadata } from 'next'
import Link from 'next/link'
import { getSessionUser } from '@/lib/member/api'
import { DeleteAccountForm } from './delete-account-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Supprimer mon compte',
  description: 'Supprimer ton compte Paname Club et toutes tes données, depuis le site ou l’appli.',
  alternates: { canonical: '/suppression-compte' },
}

/**
 * Page publique exigée par Google Play (et utile à tous) : comment supprimer
 * son compte, depuis l'appli, depuis le site, ou par e-mail.
 */
export default async function SuppressionComptePage({ searchParams }: { searchParams: Promise<{ fait?: string }> }) {
  const { fait } = await searchParams
  const user = fait ? null : await getSessionUser()

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      <h1 className="t-display text-ink">Supprimer mon compte</h1>

      {fait ? (
        <p role="status" className="t-body mt-4 text-ink">
          C’est fait : ton compte et tes données ont été supprimés. Merci d’être passé par Paname Club.
        </p>
      ) : (
        <>
          <p className="t-body mt-3 text-text-secondary">
            La suppression est définitive. Elle efface ton compte de connexion et toutes les données liées : sorties gardées,
            « J’y vais », artistes et lieux suivis, alertes, swipes, Drop, quiz, profil culturel, avis, appareils inscrits aux
            notifications et inscription à la lettre.
          </p>

          <section aria-labelledby="where-title" className="mt-8">
            <h2 id="where-title" className="t-title1 text-ink">
              Trois façons de le faire
            </h2>
            <ul className="t-body mt-3 space-y-3 text-text-secondary">
              <li>
                <strong className="font-semibold text-ink">Dans l’appli :</strong> Profil → Mon compte → Supprimer mon compte.
              </li>
              <li>
                <strong className="font-semibold text-ink">Sur ce site :</strong> connecte-toi, puis utilise le bouton ci-dessous.
              </li>
              <li>
                <strong className="font-semibold text-ink">Par e-mail :</strong> écris à{' '}
                <a href="mailto:contact@panameclub.fr?subject=Suppression%20de%20mon%20compte" className="font-semibold text-accent underline underline-offset-2">
                  contact@panameclub.fr
                </a>{' '}
                depuis l’adresse de ton compte. Nous supprimons le compte sous 30 jours et te le confirmons.
              </li>
            </ul>
          </section>

          <div className="mt-8">
            {user ? (
              <DeleteAccountForm email={user.email ?? null} />
            ) : (
              <Link
                href="/login?next=/suppression-compte"
                className="t-small inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-paper"
              >
                Me connecter pour supprimer mon compte
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
