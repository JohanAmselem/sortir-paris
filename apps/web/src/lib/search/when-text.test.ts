import { describe, expect, it } from 'vitest'
import { whenFromText } from './when-text'

// Lundi 23 novembre 2026, 21 h à Paris.
const NOW = new Date('2026-11-23T20:00:00Z')
const w = (q: string) => whenFromText(q, NOW)

describe('whenFromText', () => {
  it('laisse une recherche sans date intacte', () => {
    expect(w('Angèle')).toEqual({ when: null, label: null, rest: 'Angèle' })
    expect(w('')).toEqual({ when: null, label: null, rest: null })
  })

  it('comprend les expressions courantes', () => {
    expect(w('jazz ce soir')).toMatchObject({ when: 'tonight', rest: 'jazz' })
    expect(w('théâtre demain')).toMatchObject({ when: 'tomorrow', rest: 'theatre' })
    expect(w('après-demain')).toMatchObject({ when: '2026-11-25', rest: null })
    expect(w('expo ce week-end')).toMatchObject({ when: 'weekend', rest: 'expo' })
    expect(w('concerts cette semaine')).toMatchObject({ when: 'week', rest: 'concerts' })
    expect(w('le mois prochain')).toMatchObject({ when: '2026-12', rest: null })
  })

  it('un jour de la semaine devient ce jour-là, pas le week-end', () => {
    expect(w('jazz samedi')).toMatchObject({ when: '2026-11-28', rest: 'jazz' })
    expect(w('lundi')).toMatchObject({ when: '2026-11-23' })
    expect(w('dimanche prochain')).toMatchObject({ when: '2026-11-29' })
  })

  it('lit un jour précis, l’année suivante une fois passé', () => {
    expect(w('concert 14 février')).toMatchObject({ when: '2027-02-14', rest: 'concert' })
    expect(w('le 1er décembre')).toMatchObject({ when: '2026-12-01', rest: null })
    expect(w('14/02')).toMatchObject({ when: '2027-02-14' })
    expect(w('5/12/2027')).toMatchObject({ when: '2027-12-05' })
    expect(w('20 novembre')).toMatchObject({ when: '2027-11-20' })
    expect(w('30 février')).toMatchObject({ when: null })
  })

  it('lit un mois, sans confondre « Bruno Mars »', () => {
    expect(w('Angèle en mars')).toMatchObject({ when: '2027-03', label: 'mars 2027', rest: 'angele' })
    expect(w('concert mars 2027')).toMatchObject({ when: '2027-03', rest: 'concert' })
    expect(w('concerts mars')).toMatchObject({ when: '2027-03', rest: 'concerts' })
    expect(w('décembre')).toMatchObject({ when: '2026-12', label: 'décembre' })
    expect(w('Bruno Mars')).toEqual({ when: null, label: null, rest: 'Bruno Mars' })
    expect(w('novembre')).toMatchObject({ when: '2026-11' })
  })

  it('lit une année entière', () => {
    expect(w('concerts 2027')).toMatchObject({ when: '2027-01-01..2027-12-31', rest: 'concerts' })
    expect(w('en 2026')).toMatchObject({ when: '2026-11-23..2026-12-31' })
  })

  it('Noël et le nouvel an', () => {
    expect(w('concert à noël')).toMatchObject({ when: '2026-12-24..2026-12-25', rest: 'concert' })
    expect(w('soirée nouvel an')).toMatchObject({ when: '2026-12-31', rest: 'soiree' })
  })
})
