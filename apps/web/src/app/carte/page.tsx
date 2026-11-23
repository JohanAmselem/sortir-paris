import { MapWrapper } from '@/components/map/map-wrapper'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { resolveWindow } from '@/lib/paris-time'

export const metadata = {
  title: 'Carte des sorties à Paris : qu’y a-t-il autour de moi ?',
  description: 'La carte des sorties à Paris : concerts, expos, théâtre. Choisis ce soir, un jour ou un mois, et regarde ce qui se passe autour de toi.',
  alternates: { canonical: '/carte' },
}

type Props = { searchParams: Promise<Record<string, string | undefined>> }

const WHEN = new Set(['tonight', 'tomorrow', 'weekend', 'week', 'month'])

/** Une fenêtre, un mois (AAAA-MM) ou un jour (AAAA-MM-JJ) encore à venir. */
function validWhen(v: string | undefined): string {
  if (!v) return 'week'
  if (WHEN.has(v)) return v
  return /^\d{4}-\d{2}(-\d{2})?$/.test(v) && resolveWindow(v) ? v : 'week'
}

export default async function CartePage({ searchParams }: Props) {
  const sp = await searchParams
  const lat = Number(sp.lat)
  const lng = Number(sp.lng)
  const zoom = Number(sp.zoom)
  const initialView =
    Number.isFinite(lat) && Number.isFinite(lng) && lat > 48.1 && lat < 49.3 && lng > 1.4 && lng < 3.6
      ? { lat, lng, zoom: Number.isFinite(zoom) && zoom >= 9 && zoom <= 18 ? zoom : 15 }
      : null

  return (
    <div className="relative">
      <h1 className="sr-only">Carte des sorties à Paris</h1>
      <div className="h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-4rem)]">
        <MapWrapper
          initialView={initialView}
          initialState={{
            when: validWhen(sp.when),
            cat: sp.cat && CATEGORY_BY_SLUG[sp.cat] ? sp.cat : null,
            free: sp.free === '1',
            noCinema: sp.xcat === 'cinema',
          }}
        />
      </div>
    </div>
  )
}
