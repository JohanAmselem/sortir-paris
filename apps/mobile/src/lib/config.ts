/** Réglages lus à la compilation (EXPO_PUBLIC_*), avec les valeurs de production par défaut. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://www.panameclub.fr').replace(/\/$/, '')
export const SITE_URL = 'https://www.panameclub.fr'
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || ''
export const CONTACT_EMAIL = 'contact@panameclub.fr'
