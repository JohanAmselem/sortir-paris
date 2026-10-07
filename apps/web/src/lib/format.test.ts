import { describe, expect, it } from 'vitest'
import { formatDistance, formatPrice, formatPriceShort, safeUrl, sourceLabel } from './format'
import { safeJsonLd } from './json-ld'
import { normalizeArrondissement } from './events/taxonomy'

describe('formatPrice', () => {
  it('distinguishes free, paid and unknown', () => {
    expect(formatPrice({ priceMin: 0, priceMax: 0, priceStatus: 'free' }).label).toBe('Gratuit')
    expect(formatPrice({ priceMin: 0, priceMax: 0, priceStatus: 'unknown' }).label).toBe('Prix non communiqué')
    expect(formatPrice({ priceMin: 1200, priceMax: 1200, priceStatus: 'paid' }).label).toBe('12 €')
    expect(formatPrice({ priceMin: 1200, priceMax: 2500, priceStatus: 'paid' }).label).toBe('12 – 25 €')
    expect(formatPrice({ priceMin: 1000, priceMax: 9000, priceStatus: 'paid' }).label).toBe('Dès 10 €')
    expect(formatPrice({ priceMin: 1999, priceMax: 1999, priceStatus: 'paid' }).label).toBe('19,99 €')
  })
  it('never prints an inverted range', () => {
    expect(formatPrice({ priceMin: 3000, priceMax: 1200, priceStatus: 'paid' }).label).toBe('12 – 30 €')
  })
  it('falls back on legacy columns', () => {
    expect(formatPrice({ priceMin: 0, priceMax: 0, isFree: true }).label).toBe('Gratuit')
    expect(formatPrice({ priceMin: 0, priceMax: 0, isFree: false }).tone).toBe('unknown')
  })
  it('short label', () => {
    expect(formatPriceShort({ priceMin: 1200, priceMax: 2500, priceStatus: 'paid' })).toBe('Dès 12 €')
    expect(formatPriceShort({ priceMin: 0, priceMax: 0, priceStatus: 'unknown' })).toBe('')
  })
})

describe('misc', () => {
  it('formatDistance', () => {
    expect(formatDistance(0.32)).toBe('300 m')
    expect(formatDistance(2.46)).toBe('2,5 km')
    expect(formatDistance(null)).toBeNull()
  })
  it('safeUrl blocks javascript: urls', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeUrl('https://www.lebonbon.frsysteme')).toBe('https://www.lebonbon.frsysteme/')
  })
  it('sourceLabel', () => {
    expect(sourceLabel('paris_opendata')).toBe('Que faire à Paris (Ville de Paris)')
    expect(sourceLabel('some_new_source')).toBe('Some New Source')
  })
  it('normalizeArrondissement', () => {
    expect(normalizeArrondissement('75011')).toBe('11e')
    expect(normalizeArrondissement('1')).toBe('1er')
    expect(normalizeArrondissement('11ème')).toBe('11e')
    expect(normalizeArrondissement('75116')).toBe('16e')
    expect(normalizeArrondissement('21')).toBeNull()
    expect(normalizeArrondissement('2e')).toBe('2e')
  })
})

describe('safeJsonLd', () => {
  it('cannot close the script tag', () => {
    const out = safeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>')
  })
})
