import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }))
vi.mock('@sortir/db', () => ({ db: {}, alertSettings: {}, pushSubscriptions: {} }))
vi.mock('@/app/club/_lib/drop', () => ({ getMemberDrop: vi.fn() }))

import { bearerToken } from './supabase/bearer'
import { expoTicketResult, isExpoPushToken, pushTargetUsable } from './push-server'
import { dropPushPayload } from './drop-push'

const headers = (value?: string) => ({ get: (k: string) => (k === 'authorization' ? (value ?? null) : null) })
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl-_x'

describe('bearerToken (connexion de l’appli)', () => {
  it('lit un jeton Bearer', () => {
    expect(bearerToken(headers(`Bearer ${JWT}`))).toBe(JWT)
    expect(bearerToken(headers(`  Bearer   ${JWT}  `))).toBe(JWT)
  })
  it('ignore l’absence d’en-tête et les formats douteux', () => {
    expect(bearerToken(headers())).toBeNull()
    expect(bearerToken(headers(`Basic ${JWT}`))).toBeNull()
    expect(bearerToken(headers('Bearer court'))).toBeNull()
    expect(bearerToken(headers(`Bearer ${JWT} autre`))).toBeNull()
    expect(bearerToken(headers(`Bearer ${JWT}<script>`))).toBeNull()
  })
})

describe('notifications de l’appli (Expo)', () => {
  it('reconnaît les jetons Expo', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[AbC-123_xyzAbC-123]')).toBe(true)
    expect(isExpoPushToken('https://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[abc]; drop table')).toBe(false)
  })
  it('traduit les tickets Expo', () => {
    expect(expoTicketResult({ status: 'ok' })).toBe('ok')
    expect(expoTicketResult({ status: 'error', details: { error: 'DeviceNotRegistered' } })).toBe('gone')
    expect(expoTicketResult({ status: 'error', details: { error: 'MessageRateExceeded' } })).toBe('error')
    expect(expoTicketResult(undefined)).toBe('error')
  })
  it('les jetons de l’appli ne dépendent pas des clés VAPID, mais seulement de la production', () => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.EXPO_PUSH_ENABLED
    process.env.VERCEL_ENV = 'preview'
    expect(pushTargetUsable({ kind: 'expo' })).toBe(false)
    process.env.VERCEL_ENV = 'production'
    expect(pushTargetUsable({ kind: 'expo' })).toBe(true)
    expect(pushTargetUsable({ kind: 'web' })).toBe(false)
    process.env.EXPO_PUSH_DISABLED = '1'
    expect(pushTargetUsable({ kind: 'expo' })).toBe(false)
    delete process.env.EXPO_PUSH_DISABLED
    delete process.env.VERCEL_ENV
    process.env.EXPO_PUSH_ENABLED = '1'
    expect(pushTargetUsable({ kind: 'expo' })).toBe(true)
    delete process.env.EXPO_PUSH_ENABLED
  })
})

describe('notification du Drop du lundi', () => {
  it('cite les deux premières idées et compte les autres', () => {
    const p = dropPushPayload(['Chico Chico', 'Les Fourberies de Scapin', 'Cézanne et nous', 'Samuel Bambi', 'Oneus'])
    expect(p.title).toBe('Ton Drop de la semaine est là')
    expect(p.body).toBe('Chico Chico · Les Fourberies de Scapin et 3 autres')
    expect(p.url).toBe('/drop')
  })
  it('accorde au singulier et tient sans idée', () => {
    expect(dropPushPayload(['A', 'B', 'C']).body).toBe('A · B et 1 autre')
    expect(dropPushPayload([]).body).toBe('Cinq idées de sorties choisies pour toi cette semaine.')
  })
})
