import { describe, expect, it } from 'vitest'
import {
  ACTIVATED_COOKIE,
  PENDING_FOLLOW_COOKIE,
  encodeCookieJson,
  loginUrlForPending,
  parseActivated,
  pendingFollowCookie,
  readCookie,
  withActivatedParam,
  withoutActivatedParam,
} from './pending-follow'
import { parsePendingFollow } from './pending-follow-schema'

const VENUE = '3f0c1a52-9b7e-4d0f-8a61-2b9c4e5d6f70'

describe('pending follow cookie', () => {
  it('round-trips an artist through the document.cookie string', () => {
    const cookie = pendingFollowCookie({ kind: 'artist', term: 'the cure', label: '  The   Cure ' }, true)
    expect(cookie).toContain(`${PENDING_FOLLOW_COOKIE}=`)
    expect(cookie).toContain('Max-Age=3600')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Secure')
    const value = readCookie(cookie.split(';')[0], PENDING_FOLLOW_COOKIE)
    expect(parsePendingFollow(value)).toEqual({ kind: 'artist', term: 'the cure', label: 'The Cure' })
  })

  it('is not Secure on http (local development)', () => {
    expect(pendingFollowCookie({ kind: 'venue', venueId: VENUE, label: 'La Cigale' }, false)).not.toContain('Secure')
  })

  it('round-trips a venue', () => {
    const raw = encodeCookieJson({ kind: 'venue', venueId: VENUE, label: 'La Cigale' })
    expect(parsePendingFollow(raw)).toEqual({ kind: 'venue', venueId: VENUE, label: 'La Cigale' })
  })

  it('normalizes the artist term like the API and keeps 2-letter artist keys', () => {
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'Måneskin', label: 'Måneskin' }))).toMatchObject({ term: 'maneskin' })
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'mo', label: 'MØ' }))).toMatchObject({ term: 'mo', label: 'MØ' })
  })

  it('rejects anything malformed', () => {
    expect(parsePendingFollow(null)).toBeNull()
    expect(parsePendingFollow('')).toBeNull()
    expect(parsePendingFollow('%E0%A4%A')).toBeNull() // bad URI encoding
    expect(parsePendingFollow('not-json')).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'venue', venueId: 'nope', label: 'x' }))).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'x', label: 'X' }))).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'the cure', label: '   ' }))).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'the cure', label: 'x'.repeat(161) }))).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'user', term: 'the cure', label: 'The Cure' }))).toBeNull()
    expect(parsePendingFollow(encodeCookieJson({ kind: 'artist', term: 'a'.repeat(5000), label: 'A' }))).toBeNull()
  })
})

describe('activated cookie', () => {
  it('parses success and failure', () => {
    expect(parseActivated(encodeCookieJson({ ok: true, label: 'The Cure' }))).toEqual({ ok: true, label: 'The Cure' })
    expect(parseActivated(encodeCookieJson({ ok: false, label: 'The Cure', error: 'Limite atteinte.' }))).toEqual({
      ok: false,
      label: 'The Cure',
      error: 'Limite atteinte.',
    })
  })

  it('rejects malformed values', () => {
    expect(parseActivated(undefined)).toBeNull()
    expect(parseActivated(encodeCookieJson({ ok: true }))).toBeNull()
    expect(parseActivated(encodeCookieJson({ ok: false, label: 'X' }))).toBeNull()
    expect(parseActivated(encodeCookieJson({ ok: 'yes', label: 'X' }))).toBeNull()
    expect(parseActivated('{oops')).toBeNull()
  })

  it('reads one cookie among others', () => {
    const header = `a=1; ${ACTIVATED_COOKIE}=${encodeCookieJson({ ok: true, label: 'Damso' })}; b=2`
    expect(parseActivated(readCookie(header, ACTIVATED_COOKIE))).toEqual({ ok: true, label: 'Damso' })
    expect(readCookie(header, 'missing')).toBeNull()
  })
})

describe('return path', () => {
  it('adds ?activated=1 and keeps the query', () => {
    expect(withActivatedParam('/alertes-concerts')).toBe('/alertes-concerts?activated=1')
    expect(withActivatedParam('/evenements?when=week')).toBe('/evenements?when=week&activated=1')
    expect(withActivatedParam('/alertes-concerts?activated=1')).toBe('/alertes-concerts?activated=1')
  })

  it('never leaves the site', () => {
    expect(withActivatedParam('//evil.com')).toBe('/alertes-concerts?activated=1')
    expect(withActivatedParam('https://evil.com/x')).toBe('/alertes-concerts?activated=1')
  })

  it('removes the flag', () => {
    expect(withoutActivatedParam('/lieux/la-cigale?activated=1')).toBe('/lieux/la-cigale')
    expect(withoutActivatedParam('/evenements?when=week&activated=1')).toBe('/evenements?when=week')
  })

  it('builds the login URL', () => {
    expect(loginUrlForPending('/alertes-concerts')).toBe('/login?next=' + encodeURIComponent('/alertes-concerts?activated=1'))
  })
})
