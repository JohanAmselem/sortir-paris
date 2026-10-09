import { describe, expect, it } from 'vitest'
import {
  formatFullWhen,
  formatTime,
  formatWhen,
  getDateWindow,
  getWindow,
  overlapsWindow,
  parisDate,
  parisNightDay,
  parisWeekStart,
  resolveWindow,
  urgencyBadge,
} from './paris-time'

// Wednesday 7 Oct 2026, 15:00 Paris (CEST, UTC+2) = 13:00Z
const WED_AFTERNOON = new Date('2026-10-07T13:00:00Z')

describe('parisDate', () => {
  it('converts Paris wall-clock to UTC in summer and winter', () => {
    expect(parisDate(2026, 10, 7, 20).toISOString()).toBe('2026-10-07T18:00:00.000Z')
    expect(parisDate(2026, 12, 7, 20).toISOString()).toBe('2026-12-07T19:00:00.000Z')
  })
  it('normalises day overflow', () => {
    expect(parisDate(2026, 10, 32, 12).toISOString()).toBe('2026-11-01T11:00:00.000Z')
  })
})

describe('parisNightDay', () => {
  it('keeps 01:30 on the previous evening', () => {
    // Saturday 10 Oct 01:30 Paris → still Friday night
    const d = parisNightDay(new Date('2026-10-09T23:30:00Z'))
    expect(d).toMatchObject({ day: 9, weekday: 5 })
  })
})

describe('getWindow', () => {
  it('tonight = 17:00 → 04:00 Paris when asked in the afternoon', () => {
    const w = getWindow('tonight', WED_AFTERNOON)
    expect(w.start.toISOString()).toBe('2026-10-07T15:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-10-08T02:00:00.000Z')
  })

  it('tonight at 01:00 is still the current night, not the whole next day', () => {
    const at1am = new Date('2026-10-07T23:00:00Z') // Thu 8 Oct 01:00 Paris
    const w = getWindow('tonight', at1am)
    expect(w.start.toISOString()).toBe(at1am.toISOString())
    expect(w.end.toISOString()).toBe('2026-10-08T02:00:00.000Z') // 04:00 Paris
  })

  it('weekend on a Wednesday = Friday 18:00 → Monday 04:00', () => {
    const w = getWindow('weekend', WED_AFTERNOON)
    expect(w.start.toISOString()).toBe('2026-10-09T16:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-10-12T02:00:00.000Z')
  })

  it('weekend on a Sunday is the current weekend, not the next one', () => {
    const sunday = new Date('2026-10-11T10:00:00Z')
    const w = getWindow('weekend', sunday)
    expect(w.start.toISOString()).toBe(sunday.toISOString())
    expect(w.end.toISOString()).toBe('2026-10-12T02:00:00.000Z')
  })

  it('weekend at Saturday 01:30 still covers the Friday night', () => {
    const satNight = new Date('2026-10-09T23:30:00Z')
    const w = getWindow('weekend', satNight)
    expect(w.start.toISOString()).toBe(satNight.toISOString())
    expect(w.end.toISOString()).toBe('2026-10-12T02:00:00.000Z')
  })

  it('handles the DST change (Sunday 25 Oct 2026)', () => {
    const fri = new Date('2026-10-23T10:00:00Z')
    const w = getWindow('weekend', fri)
    expect(w.start.toISOString()).toBe('2026-10-23T16:00:00.000Z') // 18:00 CEST
    expect(w.end.toISOString()).toBe('2026-10-26T03:00:00.000Z') // 04:00 CET
  })

  it('tomorrow starts at 06:00 Paris the next day', () => {
    const w = getWindow('tomorrow', WED_AFTERNOON)
    expect(w.start.toISOString()).toBe('2026-10-08T04:00:00.000Z')
  })
})

describe('resolveWindow', () => {
  it('accepts legacy and french values', () => {
    expect(resolveWindow('today', WED_AFTERNOON)?.key).toBe('today')
    expect(resolveWindow('ce-soir', WED_AFTERNOON)?.key).toBe('tonight')
    expect(resolveWindow('week-end', WED_AFTERNOON)?.key).toBe('weekend')
    expect(resolveWindow('2026-10-20', WED_AFTERNOON)?.key).toBe('date')
    expect(resolveWindow('nimporte', WED_AFTERNOON)).toBeNull()
  })
  it('rejects past dates and invalid dates', () => {
    expect(getDateWindow('2026-10-01', WED_AFTERNOON)).toBeNull()
    expect(getDateWindow('2026-13-01', WED_AFTERNOON)).toBeNull()
  })
})

describe('overlapsWindow', () => {
  const tonight = getWindow('tonight', WED_AFTERNOON)
  it('includes a concert at 20:30', () => {
    expect(overlapsWindow({ startDate: parisDate(2026, 10, 7, 20, 30) }, tonight, WED_AFTERNOON)).toBe(true)
  })
  it('excludes a 13:00 workshop from tonight', () => {
    expect(overlapsWindow({ startDate: parisDate(2026, 10, 7, 13) }, tonight, WED_AFTERNOON)).toBe(false)
  })
  it('weekend does not include friday daytime one-offs', () => {
    const w = getWindow('weekend', WED_AFTERNOON)
    const fridayNoon = { startDate: parisDate(2026, 10, 9, 12, 30), endDate: parisDate(2026, 10, 9, 19) }
    expect(overlapsWindow(fridayNoon, w, WED_AFTERNOON)).toBe(false)
    expect(overlapsWindow({ startDate: parisDate(2026, 10, 9, 20) }, w, WED_AFTERNOON)).toBe(true)
  })

  it('tonight includes a concert that started 20 minutes ago', () => {
    const at2130 = parisDate(2026, 10, 7, 21, 30)
    const w = getWindow('tonight', at2130)
    expect(overlapsWindow({ startDate: parisDate(2026, 10, 7, 21, 10) }, w, at2130)).toBe(true)
  })

  it('excludes a running exhibition from tonight but keeps it for the weekend', () => {
    const expo = { startDate: parisDate(2026, 9, 1, 10), endDate: parisDate(2026, 12, 1, 18) }
    expect(overlapsWindow(expo, tonight, WED_AFTERNOON)).toBe(false)
    expect(overlapsWindow(expo, getWindow('weekend', WED_AFTERNOON), WED_AFTERNOON)).toBe(true)
  })
})

describe('formatting', () => {
  it('formats times the french way in Paris time', () => {
    expect(formatTime(new Date('2026-10-07T18:30:00Z'))).toBe('20h30')
    expect(formatTime(new Date('2026-12-07T19:00:00Z'))).toBe('20h')
  })

  it('formatWhen gives a decision-friendly label', () => {
    expect(formatWhen({ startDate: parisDate(2026, 10, 7, 20, 30) }, WED_AFTERNOON)).toBe('Ce soir · 20h30')
    expect(formatWhen({ startDate: parisDate(2026, 10, 8, 19) }, WED_AFTERNOON)).toBe('Demain · 19h')
    expect(formatWhen({ startDate: parisDate(2026, 10, 10, 21) }, WED_AFTERNOON)).toBe('Samedi · 21h')
    expect(formatWhen({ startDate: parisDate(2026, 10, 8, 12), timeKnown: false }, WED_AFTERNOON)).toBe('Demain')
    expect(
      formatWhen({ startDate: parisDate(2026, 9, 1, 10), endDate: parisDate(2026, 11, 12, 18) }, WED_AFTERNOON)
    ).toBe("En cours · jusqu'au 12 nov.")
    expect(
      formatWhen({ startDate: parisDate(2026, 9, 1, 10), endDate: parisDate(2026, 10, 9, 18) }, WED_AFTERNOON)
    ).toMatch(/^Plus que 2 jours/)
  })

  it('urgencyBadge', () => {
    expect(urgencyBadge({ startDate: new Date(WED_AFTERNOON.getTime() + 45 * 60_000) }, WED_AFTERNOON)).toBe('Dans 45 min')
    expect(urgencyBadge({ startDate: parisDate(2026, 10, 9, 20) }, WED_AFTERNOON)).toBeNull()
  })

  it('formatFullWhen says when the time is unknown', () => {
    const r = formatFullWhen({ startDate: parisDate(2026, 10, 9, 12), timeKnown: false }, WED_AFTERNOON)
    expect(r.primary).toBe('Vendredi 9 octobre')
    expect(r.secondary).toBe('Horaire non communiqué')
  })

  it('parisWeekStart returns the Monday', () => {
    expect(parisWeekStart(WED_AFTERNOON)).toBe('2026-10-05')
    expect(parisWeekStart(new Date('2026-10-11T21:30:00Z'))).toBe('2026-10-05') // Sun 23:30
  })
})

describe('next3h window', () => {
  it('runs from now to now + 3 h, without long runs', () => {
    const w = getWindow('next3h', WED_AFTERNOON)
    expect(w.start.toISOString()).toBe('2026-10-07T13:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-10-07T16:00:00.000Z')
    expect(w.includeOngoing).toBe(false)
  })
  it('is reachable from the URL value and its alias', () => {
    expect(resolveWindow('next3h', WED_AFTERNOON)?.key).toBe('next3h')
    expect(resolveWindow('3h', WED_AFTERNOON)?.key).toBe('next3h')
  })
  it('keeps a concert started 30 min ago, not an exhibition nor a later event', () => {
    const w = getWindow('next3h', WED_AFTERNOON)
    const concert = { startDate: '2026-10-07T12:30:00Z', endDate: null }
    const expo = { startDate: '2026-09-01T08:00:00Z', endDate: '2026-12-01T18:00:00Z' }
    const later = { startDate: '2026-10-07T17:00:00Z', endDate: null }
    expect(overlapsWindow(concert, w, WED_AFTERNOON)).toBe(true)
    expect(overlapsWindow(expo, w, WED_AFTERNOON)).toBe(false)
    expect(overlapsWindow(later, w, WED_AFTERNOON)).toBe(false)
  })
})
