import Link from 'next/link'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { agendaHref, withParam } from '@/lib/agenda-view'
import { ARRONDISSEMENTS, CATEGORIES, CATEGORY_BY_SLUG, INTENTS } from '@/lib/events/taxonomy'
import { cn } from '@/lib/utils'

/**
 * Les 3 filtres visibles (Catégorie, Prix, Quartier) et « Filtres » pour le
 * reste. Des liens, sans JavaScript : chaque choix garde les autres filtres.
 * Un seul menu ouvert à la fois (attribut `name` des <details>).
 */
export function AgendaFilters({ state }: { state: URLSearchParams }) {
  const cats = (state.get('cat') ?? '').split(',').filter(Boolean)
  const free = state.get('free') === '1'
  const max = state.get('max')
  const zone = state.get('zone')
  const arr = state.get('arr')
  const moods = (state.get('mood') ?? '').split(',').filter(Boolean)
  const noCinema = state.get('xcat') === 'cinema'

  const href = (changes: Record<string, string | null>) => {
    let p = state
    for (const [k, v] of Object.entries(changes)) p = withParam(p, k, v)
    return agendaHref(p)
  }

  const catLabel = cats.length === 1 ? (CATEGORY_BY_SLUG[cats[0]]?.plural ?? 'Catégorie') : cats.length > 1 ? `${cats.length} catégories` : 'Catégorie'
  const priceLabel = free ? 'Gratuit' : max ? `Moins de ${max} €` : 'Prix'
  const placeLabel = arr ? arr.split(',').join(', ') : zone === 'paris' ? 'Paris' : zone === 'banlieue' ? 'Banlieue' : 'Quartier'
  const more = moods.length + Number(noCinema)

  return (
    <div className="relative flex flex-wrap gap-2">
      <Menu label={catLabel} active={cats.length > 0} title="Catégorie">
        <Options
          items={[
            { label: 'Toutes les catégories', href: href({ cat: null }), on: cats.length === 0 },
            ...CATEGORIES.map((c) => ({ label: c.plural, href: href({ cat: c.slug }), on: cats.length === 1 && cats[0] === c.slug })),
          ]}
        />
      </Menu>
      <Menu label={priceLabel} active={free || Boolean(max)} title="Prix">
        <Options
          items={[
            { label: 'Tous les prix', href: href({ free: null, max: null }), on: !free && !max },
            { label: 'Gratuit', href: href({ free: '1', max: null }), on: free },
            { label: 'Moins de 20 €', href: href({ free: null, max: '20' }), on: max === '20' },
            { label: 'Moins de 50 €', href: href({ free: null, max: '50' }), on: max === '50' },
          ]}
        />
      </Menu>
      <Menu label={placeLabel} active={Boolean(arr || zone)} title="Quartier">
        <Options
          items={[
            { label: 'Partout', href: href({ zone: null, arr: null }), on: !arr && !zone },
            { label: 'Paris', href: href({ zone: 'paris', arr: null }), on: zone === 'paris' && !arr },
            { label: 'Proche banlieue', href: href({ zone: 'banlieue', arr: null }), on: zone === 'banlieue' },
          ]}
        />
        <p className="t-micro mt-4 text-text-muted">Arrondissement</p>
        <ul className="mt-2 grid grid-cols-5 gap-1.5">
          {ARRONDISSEMENTS.map((a) => (
            <li key={a}>
              <Link
                href={href({ arr: a, zone: null })}
                aria-current={arr === a ? 'true' : undefined}
                className={cn(
                  't-small flex h-11 items-center justify-center rounded-lg border font-semibold',
                  arr === a ? 'border-ink bg-ink text-paper' : 'border-border-strong text-ink hover:border-ink'
                )}
              >
                {a}
              </Link>
            </li>
          ))}
        </ul>
      </Menu>
      <Menu label={more ? `Filtres (${more})` : 'Filtres'} active={more > 0} title="Plus de filtres" icon>
        <p className="t-micro text-text-muted">Ambiance</p>
        <Options
          items={INTENTS.map((i) => {
            const on = moods.includes(i.slug)
            const next = on ? moods.filter((m) => m !== i.slug) : [...moods, i.slug]
            return { label: i.label, href: href({ mood: next.length ? next.join(',') : null }), on }
          })}
        />
        <p className="t-micro mt-4 text-text-muted">Cinéma</p>
        <Options items={[{ label: 'Sans les séances de cinéma', href: href({ xcat: noCinema ? null : 'cinema' }), on: noCinema }]} />
      </Menu>
    </div>
  )
}

function Menu({ label, active, title, icon = false, children }: { label: string; active: boolean; title: string; icon?: boolean; children: React.ReactNode }) {
  return (
    <details name="agenda-filtre" className="group">
      <summary
        className={cn(
          't-small inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-full border px-4 font-semibold transition-colors [&::-webkit-details-marker]:hidden',
          active ? 'border-ink bg-ink text-paper' : 'border-border-strong text-ink hover:border-ink'
        )}
      >
        {icon && <SlidersHorizontal className="h-4 w-4" aria-hidden />}
        {label !== title && <span className="sr-only">{title} : </span>}
        {label}
        {!icon && <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />}
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border-strong bg-surface p-4 shadow-xl sm:right-auto sm:w-[380px]">
        {children}
      </div>
    </details>
  )
}

function Options({ items }: { items: Array<{ label: string; href: string; on: boolean }> }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {items.map((it) => (
        <li key={it.label}>
          <Link
            href={it.href}
            aria-current={it.on ? 'true' : undefined}
            className={cn(
              't-small inline-flex h-11 items-center rounded-full border px-4 font-semibold transition-colors',
              it.on ? 'border-ink bg-ink text-paper' : 'border-border-strong text-ink hover:border-ink'
            )}
          >
            {it.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
