/**
 * Connexion : Apple (iPhone), Google (si configuré), e-mail avec code à 6 chiffres.
 * À la connexion, ce qui a été fait sans compte sur le téléphone (sorties gardées,
 * swipes, quiz) est repris dans le compte, comme sur le site.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import { api } from './api'
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './config'
import { queryClient } from './query'
import { clearLocalQuiz, clearLocalSaves, clearLocalSwipes, getLocalState } from './local-store'
import { unregisterPush } from './push'
import { track } from './analytics'

interface AuthValue {
  session: Session | null
  ready: boolean
  appleAvailable: boolean
  googleAvailable: boolean
  signInWithApple: () => Promise<boolean>
  signInWithGoogle: () => Promise<boolean>
  sendEmailCode: (email: string) => Promise<void>
  verifyEmailCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth hors de AuthProvider')
  return v
}

export function useSession(): Session | null {
  return useAuth().session
}

/** Reprend dans le compte ce qui a été fait sans compte. Jamais bloquant. */
async function syncLocalToAccount() {
  const local = getLocalState()
  const saveIds = Object.keys(local.saves)
  const done: string[] = []
  for (const eventId of saveIds) {
    try {
      await api('/api/saves', { method: 'POST', body: { eventId, saved: true } })
      done.push(eventId)
    } catch {
      // Sortie terminée ou supprimée : on la laisse sur le téléphone.
    }
  }
  if (done.length) clearLocalSaves(done)
  if (local.swipes.length) {
    try {
      await api('/api/swipe', { method: 'POST', body: { swipes: local.swipes.slice(-60).map((s) => ({ eventId: s.eventId, direction: s.direction })) } })
      clearLocalSwipes()
    } catch {}
  }
  if (local.quiz?.completedAt) {
    try {
      await api('/api/taste-quiz', { method: 'POST', body: { answers: local.quiz.answers } })
      clearLocalQuiz()
    } catch {}
  }
}

let googleConfigured = false
async function googleSignIn() {
  // Chargé à la demande : le module natif n'existe que dans les builds qui l'incluent.
  const mod = await import('@react-native-google-signin/google-signin')
  if (!googleConfigured) {
    mod.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID || undefined })
    googleConfigured = true
  }
  if (Platform.OS === 'android') await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const res = await mod.GoogleSignin.signIn()
  if (!mod.isSuccessResponse(res)) return null
  return res.data.idToken
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [appleAvailable, setAppleAvailable] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN') {
        syncLocalToAccount().finally(() => queryClient.invalidateQueries())
      }
      if (event === 'SIGNED_OUT') queryClient.removeQueries({ queryKey: ['me'] })
    })
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then((ok) => mounted && setAppleAvailable(ok))
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithApple = useCallback(async () => {
    const raw = Crypto.randomUUID()
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      })
      if (!cred.identityToken) throw new Error('Apple n’a pas renvoyé d’identité.')
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: raw })
      if (error) throw error
      // Apple ne donne le nom qu'à la première connexion : on le garde dans le profil.
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ')
      if (name) await supabase.auth.updateUser({ data: { full_name: name } }).catch(() => {})
      track('login', { method: 'apple' })
      return true
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false
      throw new Error('La connexion avec Apple n’a pas abouti. Réessaie, ou utilise ton e-mail.')
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    try {
      const idToken = await googleSignIn()
      if (!idToken) return false
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
      if (error) throw error
      track('login', { method: 'google' })
      return true
    } catch {
      throw new Error('La connexion avec Google n’a pas abouti. Réessaie, ou utilise ton e-mail.')
    }
  }, [])

  const sendEmailCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    if (error) {
      if (error.status === 429) throw new Error('Trop de demandes de code. Attends une minute avant de réessayer.')
      throw new Error('Impossible d’envoyer le code pour le moment. Réessaie dans un instant.')
    }
  }, [])

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    if (error) throw new Error('Code incorrect ou expiré. Vérifie le dernier e-mail reçu.')
    track('login', { method: 'email' })
  }, [])

  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => {})
    await supabase.auth.signOut()
    queryClient.clear()
  }, [])

  const deleteAccount = useCallback(async () => {
    await unregisterPush().catch(() => {})
    await api('/api/v1/me', { method: 'DELETE', body: { confirm: 'SUPPRIMER' } })
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    queryClient.clear()
    track('account_deleted')
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      appleAvailable: supabaseConfigured && appleAvailable,
      googleAvailable: supabaseConfigured && Boolean(GOOGLE_WEB_CLIENT_ID) && (Platform.OS === 'android' || Boolean(GOOGLE_IOS_CLIENT_ID)),
      signInWithApple,
      signInWithGoogle,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      deleteAccount,
    }),
    [session, ready, appleAvailable, signInWithApple, signInWithGoogle, sendEmailCode, verifyEmailCode, signOut, deleteAccount]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
