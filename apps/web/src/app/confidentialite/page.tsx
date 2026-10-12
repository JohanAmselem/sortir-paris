import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Quelles données Paname Club collecte, pourquoi, combien de temps elles sont gardées, avec qui elles sont partagées et comment exercer tes droits.',
  alternates: { canonical: '/confidentialite' },
}

const LAST_UPDATE = '13 octobre 2026'

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="font-semibold text-accent underline underline-offset-2" rel="noopener noreferrer">
    {children}
  </a>
)

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-display text-[1.8rem] text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

const DATA = [
  { what: 'Compte', detail: 'Ton adresse e-mail, et ton nom et ta photo de profil si tu te connectes avec Google.' },
  {
    what: 'Préférences et suivis',
    detail: 'Les catégories, ambiances et quartiers que tu choisis, les artistes et les lieux que tu suis, tes réglages d’alertes.',
  },
  { what: 'Activité sur le site', detail: 'Tes sorties gardées, tes « J’y vais », tes avis, tes réponses aux jeux du Club (swipes, quiz).' },
  {
    what: 'Notifications sur l’appareil',
    detail: 'Si tu les actives : l’abonnement technique fourni par ton navigateur (adresse d’envoi et clés de chiffrement), sans autre information sur l’appareil.',
  },
  { what: 'Newsletter', detail: 'Ton adresse e-mail, si tu t’inscris à la lettre hebdo.' },
  {
    what: 'Position',
    detail: 'Utilisée uniquement dans ton navigateur pour « Autour de moi » et la carte, si tu l’autorises. Elle n’est jamais enregistrée par Paname Club.',
  },
  { what: 'Journaux techniques', detail: 'Adresse IP, pages demandées, erreurs : nécessaires au fonctionnement et à la sécurité du site.' },
  {
    what: 'Mesure d’audience',
    detail: 'Le cas échéant, une mesure d’audience sans cookie (Plausible, Vercel Web Analytics) : des statistiques agrégées, sans profil individuel.',
  },
]

const PROCESSORS: Array<{ name: string; role: string; where?: string }> = [
  { name: 'Supabase', role: 'Base de données et authentification', where: 'Union européenne (Paris, AWS eu-west-3)' },
  { name: 'Vercel', role: 'Hébergement du site (Vercel Inc., États-Unis)' },
  { name: 'Resend', role: 'Envoi des e-mails (alertes, newsletter)' },
  { name: 'Mapbox', role: 'Affichage des cartes (ton navigateur charge les cartes depuis Mapbox)' },
  {
    name: 'Anthropic',
    role: 'Compréhension des recherches écrites en langage naturel : seul le texte de la recherche est transmis, sans identifiant',
  },
  { name: 'Google', role: 'Connexion avec Google, uniquement si tu la choisis' },
  {
    name: 'Spotify',
    role: 'Import de tes artistes, uniquement si tu le choisis : on lit les noms d’artistes, aucun jeton d’accès n’est conservé',
  },
]

export default function ConfidentialitePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-12">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">Données personnelles</p>
      <h1 className="font-display mt-2 text-[3rem] text-ink sm:text-[3.6rem]">Politique de confidentialité</h1>
      <p className="mt-2 text-[14px] text-text-muted">Dernière mise à jour : {LAST_UPDATE}</p>

      <div className="mt-8 space-y-10 text-[16px] leading-relaxed text-ink-soft">
        <p className="rounded-xl border border-border bg-surface p-4 text-[15px]">
          En bref : on collecte le minimum pour faire marcher ton compte et tes alertes, on ne revend jamais tes données, et tu
          peux te désinscrire des alertes en un clic depuis chaque e-mail.
        </p>

        <Section id="responsable" title="Responsable du traitement">
          <p>
            JUNO, SARL au capital de 10 000 €, 21 rue du Buisson Saint-Louis, 75010 Paris, RCS Paris 990 995 136, éditrice de
            Paname Club. Contact : <A href="mailto:contact@panameclub.fr">contact@panameclub.fr</A>. Voir aussi les{' '}
            <Link href="/mentions-legales" className="font-semibold text-accent underline underline-offset-2">
              mentions légales
            </Link>
            .
          </p>
        </Section>

        <Section id="donnees" title="Les données que nous traitons">
          <p>Tu peux consulter les sorties sans compte. Les données ci-dessous ne concernent que ce que tu choisis d’utiliser.</p>
          <dl className="divide-y divide-border rounded-xl border border-border bg-surface text-[15px]">
            {DATA.map((d) => (
              <div key={d.what} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
                <dt className="shrink-0 font-semibold text-ink sm:w-52">{d.what}</dt>
                <dd>{d.detail}</dd>
              </div>
            ))}
          </dl>
          <p>
            Sans compte, tes swipes et ton quiz sont gardés dans ton navigateur (stockage local) et repris dans ton compte si tu
            en crées un.
          </p>
        </Section>

        <Section id="finalites" title="Pourquoi, et sur quelle base">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-semibold text-ink">Faire fonctionner ton compte et tes alertes</strong> (connexion, sorties
              gardées, artistes et lieux suivis, e-mails d’alerte, sélection personnalisée) : exécution du service que tu
              demandes.
            </li>
            <li>
              <strong className="font-semibold text-ink">Notifications sur l’appareil</strong> : ton consentement, donné en les
              activant ; tu peux le retirer à tout moment dans « Mes artistes » ou dans les réglages de ton navigateur.
            </li>
            <li>
              <strong className="font-semibold text-ink">Newsletter</strong> : ton consentement (inscription confirmée par
              e-mail), retirable à tout moment.
            </li>
            <li>
              <strong className="font-semibold text-ink">Sécurité et bon fonctionnement</strong> (journaux techniques,
              prévention des abus, mesure d’audience sans cookie) : notre intérêt légitime.
            </li>
          </ul>
          <p>Nous ne faisons pas de publicité ciblée et nous ne revendons, ne louons ni ne cédons tes données à personne.</p>
        </Section>

        <Section id="conservation" title="Combien de temps">
          <ul className="list-disc space-y-2 pl-5">
            <li>Compte et données associées : tant que ton compte existe, jusqu’à sa suppression.</li>
            <li>Abonnements aux notifications : supprimés dès que tu les désactives ou que ton navigateur les invalide.</li>
            <li>Newsletter : jusqu’à ta désinscription.</li>
            <li>Journaux techniques : 12 mois au maximum.</li>
          </ul>
        </Section>

        <Section id="prestataires" title="Nos prestataires">
          <p>Ils traitent les données uniquement pour notre compte et selon nos instructions.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-[15px]">
            {PROCESSORS.map((p) => (
              <li key={p.name} className="px-4 py-3">
                <span className="font-semibold text-ink">{p.name}</span> — {p.role}.{' '}
                {p.where && <span className="text-text-secondary">Localisation : {p.where}.</span>}
              </li>
            ))}
          </ul>
          <p>
            Certains prestataires sont situés hors de l’Union européenne, notamment aux États-Unis. Ces transferts sont encadrés
            par les clauses contractuelles types de la Commission européenne ou par le Data Privacy Framework UE–États-Unis
            lorsque le prestataire y adhère.
          </p>
        </Section>

        <Section id="cookies" title="Cookies et stockage local">
          <p>
            Paname Club n’utilise pas de cookie publicitaire ni de traceur tiers. Nous utilisons seulement des cookies
            nécessaires : ceux de ta session de connexion, et deux cookies temporaires qui retiennent l’alerte que tu as
            demandée le temps que tu te connectes (1 heure au plus), puis affichent sa confirmation (15 minutes au plus). Ils ne demandent pas de consentement.
          </p>
        </Section>

        <Section id="alertes" title="Alertes : se désinscrire">
          <p>
            Chaque e-mail d’alerte contient un lien de désinscription en un clic, sans connexion. Tu peux aussi choisir tes
            canaux et tes moments d’alerte, ou ne plus suivre un artiste, dans{' '}
            <Link href="/compte/artistes" className="font-semibold text-accent underline underline-offset-2">
              Mes artistes
            </Link>
            .
          </p>
        </Section>

        <Section id="droits" title="Tes droits">
          <p>
            Tu disposes d’un droit d’accès, de rectification, d’effacement, d’opposition, de limitation et de portabilité de tes
            données. Pour les exercer, écris à <A href="mailto:contact@panameclub.fr">contact@panameclub.fr</A> depuis l’adresse
            de ton compte ; nous répondons dans un délai d’un mois.
          </p>
          <p>
            Suppression du compte : sur simple demande à <A href="mailto:contact@panameclub.fr">contact@panameclub.fr</A>. Ton
            compte et les données associées (suivis, sorties gardées, avis, réglages, abonnements aux notifications) sont alors
            supprimés.
          </p>
          <p>
            Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL (
            <A href="https://www.cnil.fr">cnil.fr</A>).
          </p>
        </Section>
      </div>
    </article>
  )
}
