/**
 * Suggestions de la recherche du site (pur) : artistes d'abord, puis lieux,
 * catégories et sorties. Les artistes mènent à l'Agenda, qui comprend les dates.
 */
export interface SearchSuggestions {
  venues: Array<{ name: string; slug: string; area: string | null }>
  categories: Array<{ label: string; href: string }>
  events: Array<{ title: string; href: string; venue: string | null }>
}

export type SearchKind = 'artist' | 'venue' | 'category' | 'event'
export type SearchItem = { key: string; href: string; label: string; detail: string | null; kind: SearchKind }

export function suggestionItems(artists: Array<{ key: string; name: string; dates: number }>, s: SearchSuggestions): SearchItem[] {
  return [
    ...artists.slice(0, 3).map((a) => ({
      key: `a-${a.key}`,
      href: `/agenda?q=${encodeURIComponent(a.name)}`,
      label: a.name,
      detail: `${a.dates} date${a.dates > 1 ? 's' : ''}`,
      kind: 'artist' as const,
    })),
    ...s.venues.slice(0, 3).map((v) => ({ key: `v-${v.slug}`, href: `/lieux/${v.slug}`, label: v.name, detail: v.area, kind: 'venue' as const })),
    ...s.categories.slice(0, 2).map((c) => ({ key: `c-${c.href}`, href: c.href, label: c.label, detail: 'Catégorie', kind: 'category' as const })),
    ...s.events.slice(0, 4).map((e) => ({ key: `e-${e.href}`, href: e.href, label: e.title, detail: e.venue, kind: 'event' as const })),
  ]
}
