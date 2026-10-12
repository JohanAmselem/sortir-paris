import { describe, expect, it } from 'vitest'
import { addDays, eventWindow, parseISODate, planForDate, windowDateLabel } from './schedule'

const paris = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)

describe('planForDate', () => {
  it('plans the daily carousel and the 6 story themes at 18:00 Paris', () => {
    const plan = planForDate('2026-10-14') // Wednesday
    expect(plan.filter((p) => p.kind === 'carousel').map((p) => p.theme)).toEqual(['demain'])
    expect(plan.filter((p) => p.kind === 'story')).toHaveLength(6)
    // 18:00 Paris = 16:00 UTC in summer time (October 14).
    expect(plan[0].scheduledAt.toISOString()).toBe('2026-10-14T16:00:00.000Z')
  })

  it('adds « Ta semaine » on Monday at 08:00 and « Ton week-end » on Thursday at 12:00', () => {
    const monday = planForDate('2026-10-12')
    expect(monday[0]).toMatchObject({ kind: 'carousel', theme: 'semaine' })
    expect(monday[0].scheduledAt.toISOString()).toBe('2026-10-12T06:00:00.000Z')
    const thursday = planForDate('2026-10-15')
    expect(thursday[0]).toMatchObject({ kind: 'carousel', theme: 'weekend' })
    expect(thursday[0].scheduledAt.toISOString()).toBe('2026-10-15T10:00:00.000Z')
  })

  it('follows the winter time change', () => {
    // November: Paris is UTC+1.
    expect(planForDate('2026-11-04')[0].scheduledAt.toISOString()).toBe('2026-11-04T17:00:00.000Z')
  })

  it('rejects invalid dates', () => {
    expect(planForDate('2026-02-31')).toEqual([])
    expect(parseISODate('nope')).toBeNull()
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('event windows', () => {
  it('« Demain » covers the day after publication, 06:00 to 04:00', () => {
    const at = planForDate('2026-10-14').find((p) => p.theme === 'demain')!.scheduledAt
    const w = eventWindow('demain', at)
    expect(paris(w.start)).toBe('jeu. 15 oct., 06:00')
    expect(paris(w.end)).toBe('ven. 16 oct., 04:00')
    expect(windowDateLabel('demain', w)).toBe('jeudi 15 octobre')
  })

  it('« Ta semaine » runs Monday to Sunday', () => {
    const at = planForDate('2026-10-12')[0].scheduledAt
    const w = eventWindow('semaine', at)
    expect(paris(w.end)).toBe('lun. 19 oct., 04:00')
    expect(windowDateLabel('semaine', w)).toBe('du 12 au 18 octobre')
  })

  it('« Ton week-end » runs Friday 18:00 to Sunday night', () => {
    const at = planForDate('2026-10-15')[0].scheduledAt
    const w = eventWindow('weekend', at)
    expect(paris(w.start)).toBe('ven. 16 oct., 18:00')
    expect(paris(w.end)).toBe('lun. 19 oct., 04:00')
    expect(windowDateLabel('weekend', w)).toBe('du 16 au 18 octobre')
  })

  it('spells a window across two months', () => {
    const at = planForDate('2026-10-29')[0].scheduledAt // Thursday
    expect(windowDateLabel('weekend', eventWindow('weekend', at))).toBe('du 30 octobre au 1er novembre')
  })
})
