import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIntro } from '@/components/events/listing'
import { NearbyNow } from '@/components/nearby/nearby-now'

// The shell is static: results are fetched by the browser once a position is known.
export const metadata: Metadata = {
  title: 'Autour de moi, maintenant : les sorties qui commencent bientôt',
  description:
    'Concerts, spectacles, soirées qui commencent dans les 3 prochaines heures près de toi à Paris, triés par distance. Ta position n’est jamais enregistrée.',
  alternates: { canonical: '/autour-de-moi' },
}

export default function AutourDeMoiPage() {
  return (
    <div className="px-4 pb-16">
      <PageIntro kicker="Maintenant" title="Autour de moi">
        <p>Ce qui commence dans les 3 prochaines heures, au plus près de toi.</p>
      </PageIntro>
      <NearbyNow />
      <p className="mt-10 text-[14px] text-text-secondary">
        Envie de voir plus loin ?{' '}
        <Link href="/carte" className="font-semibold text-accent underline underline-offset-2">
          Ouvre la carte
        </Link>{' '}
        ou regarde{' '}
        <Link href="/ce-soir" className="font-semibold text-accent underline underline-offset-2">
          tout ce soir
        </Link>
        .
      </p>
    </div>
  )
}
