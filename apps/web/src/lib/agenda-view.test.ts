import { describe, expect, it } from 'vitest'
import {
  agendaHref,
  agendaState,
  countLabel,
  dayLabel,
  dayLinks,
  displayedText,
  formatHour,
  groupByDay,
  groupBySlot,
  monthLinks,
  monthOf,
  monthTitle,
  premier,
  understoodChips,
  withParam,
} from './agenda-view'
import { mergeOutings, outingGroups, pastGroups } from './outings'
import type { AgendaUnderstood } from './api-v2/contract'
import type { CardEvent } from './events/types'

// Lundi 23 novembre 2026, 15 h à Paris (14 h UTC).
const NOW = new Date('2026-11-23T14:00:00Z')

const understood = (u: Partial<AgendaUnderstood> = {}): AgendaUnderstood => ({
  when: null,
  whenLabel: null,
  text: null,
  categories: [],
  free: false,
  ...u,
})

function ev(id: string, startDate: string, extra: Partial<CardEvent> = {}): CardEvent {
  return {
    id,
    slug: id,
    title: `Sortie ${id}`,
    shortDesc: null,
    imageUrl: null,
    startDate,
    endDate: null,
    timeKnown: true,
    priceMin: 0,
    priceMax: 0,
    priceStatus: 'unknown',
    isFree: false,
    saveCount: 0,
    qualityScore: 0,
    category: null,
    venue: null,
    ...extra,
  }
}

describe('agendaState', () => {
  it('remplace la date et le texte tapés par ce qui a été compris', () => {
    const s = agendaState(
      { q: 'Angèle en mars', arr: '11e', cursor: 'x', page: '3' },
      understood({ when: '2027-03', whenLabel: 'mars 2027', text: 'Angèle' })
    )
    expect(s.get('when')).toBe('2027-03')
    expect(s.get('q')).toBe('Angèle')
    expect(s.get('arr')).toBe('11e')
    expect(s.has('cursor')).toBe(false)
    expect(s.has('page')).toBe(false)
  })
  it('garde les catégories et la gratuité comprises, sans prix maximum en double', () => {
    const s = agendaState({ max: '20' }, understood({ categories: ['concerts', 'theatre'], free: true }))
    expect(s.get('cat')).toBe('concerts,theatre')
    expect(s.get('free')).toBe('1')
    expect(s.has('max')).toBe(false)
  })
})

describe('agendaHref', () => {
  it('donne la page mois indexable quand il n’y a qu’un mois', () => {
    expect(agendaHref(new URLSearchParams({ when: '2027-03' }))).toBe('/agenda/2027-03')
    expect(agendaHref(new URLSearchParams({ when: '2027-03', cat: 'concerts' }))).toBe('/agenda/2027-03/concerts')
  })
  it('reste sur /agenda avec des paramètres sinon', () => {
    expect(agendaHref(new URLSearchParams({ when: '2027-03', cat: 'concerts,theatre' }))).toBe('/agenda?when=2027-03&cat=concerts%2Ctheatre')
    expect(agendaHref(new URLSearchParams({ when: '2027-03', free: '1' }))).toBe('/agenda?when=2027-03&free=1')
    expect(agendaHref(new URLSearchParams({ when: '2027-03-04' }))).toBe('/agenda?when=2027-03-04')
    expect(agendaHref(new URLSearchParams({ when: '2027-03', cat: 'inconnue' }))).toBe('/agenda?when=2027-03&cat=inconnue')
    expect(agendaHref(new URLSearchParams())).toBe('/agenda')
  })
  it('withParam ne modifie pas l’original', () => {
    const a = new URLSearchParams({ when: '2027-03' })
    const b = withParam(a, 'when', null)
    expect(a.get('when')).toBe('2027-03')
    expect(b.has('when')).toBe(false)
  })
})

describe('bandes des mois et des jours', () => {
  const months = [
    { key: '2026-11', label: 'Nov.', n: 4667 },
    { key: '2026-12', label: 'Déc.', n: 0 },
    { key: '2027-03', label: 'Mars 27', n: 902 },
  ]
  it('les liens des mois gardent les autres filtres et cachent les mois vides', () => {
    const state = new URLSearchParams({ when: '2027-03-04', cat: 'concerts', free: '1' })
    const links = monthLinks(months, state)
    expect(links.map((l) => l.key)).toEqual(['2026-11', '2027-03'])
    expect(links[1].active).toBe(true)
    expect(links[0].href).toBe('/agenda?when=2026-11&cat=concerts&free=1')
  })
  it('le mois actif reste affiché même vide', () => {
    expect(monthLinks(months, new URLSearchParams({ when: '2026-12' })).map((l) => l.key)).toContain('2026-12')
  })
  it('les jours d’un mois futur partent du 1er, avec leur compteur', () => {
    const days = dayLinks('2027-03', [{ key: '2027-03-04', n: 10 }], new URLSearchParams({ when: '2027-03-04', cat: 'concerts' }), NOW)
    expect(days).toHaveLength(31)
    expect(days[0]).toMatchObject({ key: '2027-03-01', weekday: 'lun.', day: 1, n: 0 })
    expect(days[3]).toMatchObject({ key: '2027-03-04', weekday: 'jeu.', n: 10, active: true })
    expect(days[3].href).toBe('/agenda?when=2027-03-04&cat=concerts')
  })
  it('le mois en cours commence aujourd’hui', () => {
    const days = dayLinks('2026-11', [], new URLSearchParams({ when: '2026-11' }), NOW)
    expect(days[0].key).toBe('2026-11-23')
    expect(days.at(-1)!.key).toBe('2026-11-30')
  })
  it('monthOf lit le mois d’un jour', () => {
    expect(monthOf('2027-03-04')).toBe('2027-03')
    expect(monthOf('2027-03')).toBe('2027-03')
    expect(monthOf('tonight')).toBeNull()
  })
})

describe('puces « On a compris »', () => {
  it('chaque puce retire un seul élément', () => {
    const u = understood({ when: '2027-03', whenLabel: 'mars 2027', categories: ['concerts'], text: 'jazz' })
    const state = agendaState({}, u)
    const chips = understoodChips(u, state)
    expect(chips.map((c) => c.label)).toEqual(['mars 2027', 'concerts', '« jazz »'])
    expect(chips[0].href).toBe('/agenda?cat=concerts&q=jazz')
    expect(chips[1].href).toBe('/agenda?when=2027-03&q=jazz')
    expect(chips[2].href).toBe('/agenda/2027-03/concerts')
  })
  it('montre aussi le prix et la zone', () => {
    const state = new URLSearchParams({ max: '20', zone: 'banlieue' })
    expect(understoodChips(understood(), state).map((c) => c.label)).toEqual(['moins de 20 €', 'banlieue'])
  })
})

describe('mots et heures', () => {
  it('compte avec le bon mot', () => {
    expect(countLabel(10, ['concerts'])).toBe('10 concerts')
    expect(countLabel(1, ['concerts'])).toBe('1 concert')
    expect(countLabel(1)).toBe('1 sortie')
    expect(countLabel(2, ['concerts', 'theatre'])).toBe('2 sorties')
    expect(countLabel(1234)).toMatch(/^1\s234 sorties$/)
  })
  it('écrit l’heure à la française', () => {
    expect(formatHour(new Date('2027-03-04T19:00:00Z'))).toBe('20\u00a0h')
    expect(formatHour(new Date('2027-03-04T19:30:00Z'))).toBe('20\u00a0h\u00a030')
  })
  it('écrit les jours avec l’année quand elle diffère', () => {
    expect(dayLabel('2027-03-04', NOW)).toBe('Jeudi 4 mars 2027')
    expect(dayLabel('2026-11-23', NOW)).toBe('Aujourd’hui, lundi 23 novembre')
    expect(dayLabel('2026-11-24', NOW)).toBe('Demain, mardi 24 novembre')
    expect(dayLabel('2026-12-05', NOW)).toBe('Samedi 5 décembre')
  })
  it('écrit les mois en toutes lettres', () => {
    expect(monthTitle('2027-03', NOW)).toBe('Mars 2027')
    expect(monthTitle('2026-12', NOW)).toBe('Décembre')
  })
})

describe('groupByDay', () => {
  it('groupe par jour de Paris, une sortie à 1 h compte pour la veille', () => {
    const groups = groupByDay(
      [ev('a', '2027-03-04T19:00:00Z'), ev('b', '2027-03-05T00:30:00Z'), ev('c', '2027-03-07T19:00:00Z')],
      NOW
    )
    expect(groups.map((g) => [g.key, g.events.map((e) => e.id)])).toEqual([
      ['2027-03-04', ['a', 'b']],
      ['2027-03-07', ['c']],
    ])
    expect(groups[0].label).toBe('Jeudi 4 mars 2027')
  })
  it('garde le regroupement quand la suite est chargée (même jour sur deux pages)', () => {
    const page1 = [ev('a', '2027-03-04T18:00:00Z'), ev('b', '2027-03-04T19:00:00Z')]
    const page2 = [ev('c', '2027-03-04T20:00:00Z'), ev('d', '2027-03-05T19:00:00Z')]
    const groups = groupByDay([...page1, ...page2], NOW)
    expect(groups).toHaveLength(2)
    expect(groups[0].events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
  it('met à part ce qui a commencé avant la période', () => {
    const expo = ev('x', '2027-01-10T09:00:00Z', { endDate: '2027-06-01T17:00:00Z' })
    const groups = groupByDay([ev('a', '2027-03-04T19:00:00Z'), expo], NOW, new Date('2027-03-01T03:00:00Z'))
    expect(groups.map((g) => g.key)).toEqual(['2027-03-04', 'en-cours'])
    expect(groups[1].label).toBe('En cours')
  })
})

describe('groupBySlot', () => {
  it('range les sorties de ce soir par créneau, dans un ordre fixe', () => {
    const groups = groupBySlot(
      [ev('late', '2026-11-23T22:00:00Z'), ev('early', '2026-11-23T17:30:00Z'), ev('mid', '2026-11-23T19:30:00Z'), ev('tbd', '2026-11-23T20:00:00Z', { timeKnown: false })],
      NOW
    )
    expect(groups.map((g) => g.label)).toEqual(['17 h – 20 h', '20 h – 22 h', 'Tard dans la nuit', 'Horaire à confirmer'])
  })
})

describe('Mes sorties', () => {
  it('fusionne gardées et « J’y vais » sans doublon', () => {
    const a = ev('a', '2026-11-23T20:00:00Z')
    const b = ev('b', '2027-03-04T19:00:00Z')
    const merged = mergeOutings([b, a], [a])
    expect(merged.map((o) => [o.event.id, o.saved, o.going])).toEqual([
      ['a', true, true],
      ['b', true, false],
    ])
  })
  it('range les billets : aujourd’hui, ce week-end, puis par mois', () => {
    const items = mergeOutings(
      [
        ev('today', '2026-11-23T20:00:00Z'),
        ev('sat', '2026-11-28T19:00:00Z'),
        ev('mars', '2027-03-04T19:00:00Z'),
        ev('expo', '2026-10-01T08:00:00Z', { endDate: '2027-02-14T17:00:00Z' }),
      ],
      []
    )
    const groups = outingGroups(items, NOW)
    expect(groups.map((g) => g.label)).toEqual(['Aujourd’hui', 'Ce week-end', 'À l’affiche', 'Mars 2027'])
  })
  it('range les sorties passées par mois, la plus récente d’abord', () => {
    const items = mergeOutings([ev('oct', '2026-10-03T19:00:00Z'), ev('nov', '2026-11-02T19:00:00Z')], [])
    expect(pastGroups(items, NOW).map((g) => g.label)).toEqual(['Novembre', 'Octobre'])
  })
})

describe('displayedText', () => {
  it('reprend les mots tapés, accents compris', () => {
    expect(displayedText('Angèle en mars', 'angele')).toBe('Angèle')
    expect(displayedText('jazz manouche samedi', 'jazz manouche')).toBe('jazz manouche')
    expect(displayedText(null, 'jazz')).toBe('jazz')
    expect(displayedText('x', null)).toBeNull()
  })
})

describe('premier', () => {
  it('écrit « 1er » devant le mois', () => {
    expect(premier('Lundi 1 mars 2027')).toBe('Lundi 1er mars 2027')
    expect(premier('lundi 11 mars')).toBe('lundi 11 mars')
    expect(premier('1 déc.')).toBe('1er déc.')
  })
  it('s’applique aux en-têtes de jour', () => {
    expect(dayLabel('2027-03-01', NOW)).toBe('Lundi 1er mars 2027')
  })
})
