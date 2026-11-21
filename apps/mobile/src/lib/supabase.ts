/**
 * Client Supabase de l'appli : uniquement pour la connexion. Les données
 * passent toutes par l'API du site, avec le jeton d'accès en Bearer.
 *
 * La session est gardée dans le trousseau (expo-secure-store), découpée en
 * morceaux : une session Supabase dépasse la taille conseillée d'une entrée.
 */
import 'react-native-url-polyfill/auto'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

const CHUNK = 1800
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_')

const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key)
    const count = await SecureStore.getItemAsync(`${k}__n`)
    if (!count) return SecureStore.getItemAsync(k)
    const parts: string[] = []
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}__${i}`)
      if (part == null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key)
    await chunkedSecureStore.removeItem(key)
    const n = Math.ceil(value.length / CHUNK)
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK))
    await SecureStore.setItemAsync(`${k}__n`, String(n))
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key)
    const count = await SecureStore.getItemAsync(`${k}__n`)
    if (count) for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}__${i}`)
    await SecureStore.deleteItemAsync(`${k}__n`)
    await SecureStore.deleteItemAsync(k)
  },
}

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient(SUPABASE_URL || 'https://invalid.supabase.co', SUPABASE_ANON_KEY || 'missing', {
  auth: {
    storage: chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

// Rafraîchir le jeton seulement quand l'appli est au premier plan.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
