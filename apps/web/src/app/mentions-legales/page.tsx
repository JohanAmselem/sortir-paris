import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Mentions légales du site Paname Club (www.panameclub.fr), édité par JUNO.',
  alternates: { canonical: '/mentions-legales' },
}

const LAST_UPDATE = '13 octobre 2026'

export default function MentionsLegalesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-12">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Informations légales</p>
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Mentions légales</h1>
      <p className="mt-2 text-[14px] text-text-muted">Dernière mise à jour : {LAST_UPDATE}</p>

      <div className="mt-8 space-y-8 text-[16px] leading-relaxed text-ink-soft">
        <section aria-labelledby="editeur">
          <h2 id="editeur" className="font-display text-[1.8rem] text-ink">
            Éditeur du site
          </h2>
          <p className="mt-3">
            Le site Paname Club (
            <a href="https://www.panameclub.fr" className="font-semibold text-accent underline underline-offset-2">
              www.panameclub.fr
            </a>
            ) est édité par :
          </p>
          <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface text-[15px]">
            {[
              ['Société', 'JUNO, SARL (société à responsabilité limitée)'],
              ['Capital social', '10 000 €'],
              ['Siège social', '21 rue du Buisson Saint-Louis, 75010 Paris, France'],
              ['RCS', 'Paris 990 995 136'],
              ['SIRET', '990 995 136 00019'],
              ['TVA intracommunautaire', 'FR22990995136'],
              ['Directeur de la publication', 'Johan Amselem Elbaz, gérant'],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
                <dt className="shrink-0 font-semibold text-ink sm:w-56">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
              <dt className="shrink-0 font-semibold text-ink sm:w-56">Contact</dt>
              <dd>
                <a href="mailto:contact@panameclub.fr" className="font-semibold text-accent underline underline-offset-2">
                  contact@panameclub.fr
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="hebergement">
          <h2 id="hebergement" className="font-display text-[1.8rem] text-ink">
            Hébergement
          </h2>
          <p className="mt-3">
            Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis (
            <a href="https://vercel.com" className="text-accent underline underline-offset-2" rel="noopener noreferrer">
              vercel.com
            </a>
            ).
          </p>
          <p className="mt-2">
            La base de données et l’authentification sont fournies par Supabase, hébergées dans l’Union européenne (Paris). Le
            détail des prestataires figure dans la{' '}
            <Link href="/confidentialite" className="font-semibold text-accent underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="contenus">
          <h2 id="contenus" className="font-display text-[1.8rem] text-ink">
            Contenus et informations publiées
          </h2>
          <p className="mt-3">
            Paname Club rassemble des informations sur des événements à Paris et en petite couronne à partir d’agendas publics, de
            billetteries et des sites des lieux. Ces informations (dates, horaires, prix, disponibilité) sont données à titre
            indicatif et peuvent changer : vérifie-les toujours auprès de l’organisateur ou de la billetterie avant de te déplacer.
            Les réservations se font sur les sites des billetteries et des organisateurs, pas sur Paname Club.
          </p>
          <p className="mt-2">
            Les noms, marques, visuels et descriptions des événements restent la propriété de leurs auteurs et ayants droit. Pour
            signaler une erreur ou demander le retrait d’un contenu, écris à{' '}
            <a href="mailto:contact@panameclub.fr" className="font-semibold text-accent underline underline-offset-2">
              contact@panameclub.fr
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="propriete">
          <h2 id="propriete" className="font-display text-[1.8rem] text-ink">
            Propriété intellectuelle
          </h2>
          <p className="mt-3">
            La marque Paname Club, son logo, la structure du site et ses textes éditoriaux sont la propriété de JUNO. Toute
            reproduction sans autorisation préalable est interdite.
          </p>
        </section>

        <section aria-labelledby="donnees">
          <h2 id="donnees" className="font-display text-[1.8rem] text-ink">
            Données personnelles
          </h2>
          <p className="mt-3">
            Le traitement de tes données (compte, alertes, notifications) est décrit dans la{' '}
            <Link href="/confidentialite" className="font-semibold text-accent underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  )
}
