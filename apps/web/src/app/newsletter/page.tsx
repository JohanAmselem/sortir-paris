import type { Metadata } from 'next'
import { EventRail, SectionHeader } from '@/components/events/blocks'
import { bucketNow, diversify, safeQueryEvents } from '@/lib/events/query'
import { NewsletterForm } from './newsletter-form'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'La lettre hebdo : les meilleures sorties à Paris',
  description:
    'Chaque semaine, une sélection courte des meilleures sorties à Paris : concerts, expos, spectacles et bons plans gratuits. Sans spam.',
  alternates: { canonical: '/newsletter' },
}

const CONFIRMATION: Record<string, { tone: 'ok' | 'ko'; text: string }> = {
  ok: { tone: 'ok', text: 'C’est confirmé, bienvenue ! Première lettre très bientôt.' },
  invalide: { tone: 'ko', text: 'Ce lien de confirmation n’est plus valide. Réinscris-toi ci-dessous si besoin.' },
  erreur: { tone: 'ko', text: 'La confirmation n’a pas abouti. Réessaie dans un instant.' },
}

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string | string[] }>
}) {
  const sp = await searchParams
  const key = Array.isArray(sp.confirmation) ? sp.confirmation[0] : sp.confirmation
  const confirmation = key ? CONFIRMATION[key] : undefined
  const now = bucketNow()
  const preview = await safeQueryEvents({ when: 'week', withImage: true, oneOffOnly: true, limit: 24 })

  return (
    <div className="px-4 pb-16 pt-10 sm:pt-14">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">La lettre</p>
        <h1 className="font-display mt-2 text-[3.2rem] text-ink sm:text-[4.4rem]">Le meilleur de Paris, une fois par semaine.</h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-text-secondary">
          Une sélection courte : les sorties à ne pas rater, les bons plans gratuits et les expos qui ferment bientôt. Pas de
          spam.
        </p>
        {confirmation && (
          <p
            role="status"
            className={
              confirmation.tone === 'ok'
                ? 'mx-auto mt-6 max-w-lg rounded-xl bg-accent-soft p-4 text-[15px] font-semibold text-accent'
                : 'mx-auto mt-6 max-w-lg rounded-xl bg-neon-soft p-4 text-[15px] font-semibold text-ink'
            }
          >
            {confirmation.text}
          </p>
        )}
        <NewsletterForm className="mx-auto mt-8 max-w-lg text-left" />
        <p className="mt-3 text-[13px] text-text-muted">Ton adresse ne sert qu’à t’envoyer la lettre.</p>
      </section>

      {!preview.error && preview.events.length > 0 && (
        <section aria-labelledby="preview-title" className="pt-16">
          <SectionHeader id="preview-title" kicker="Pour te donner une idée" title="Cette semaine, on aurait parlé de…" />
          <EventRail events={diversify(preview.events, 8)} now={now} className="mt-5" />
        </section>
      )}
    </div>
  )
}
