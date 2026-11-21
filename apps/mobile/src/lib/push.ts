/**
 * Notifications : alertes artistes (nouvelle date, billetterie, veille d'un
 * « J'y vais ») et Drop du lundi. La permission n'est demandée qu'après un
 * geste du membre (suivre un artiste, activer les alertes), jamais au lancement.
 */
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { api } from './api'
import { appRouteForWebPath } from './links'
import { markPushAsked } from './local-store'
import { track } from './analytics'

const TOKEN_KEY = 'paname-push-token'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('alertes', {
    name: 'Alertes concerts',
    description: 'Nouvelles dates, ouverture de billetterie, rappel la veille',
    importance: Notifications.AndroidImportance.HIGH,
  })
  await Notifications.setNotificationChannelAsync('drop', {
    name: 'Drop du lundi',
    description: 'Tes 5 idées de la semaine',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId
}

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable'

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice) return 'unavailable'
  const { status } = await Notifications.getPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
}

/**
 * Demande l'accord (si besoin), récupère le jeton et l'inscrit côté serveur.
 * Renvoie l'état final. Nécessite d'être connecté (le jeton est lié au membre).
 */
export async function enablePush(): Promise<PushStatus> {
  markPushAsked()
  if (!Device.isDevice) return 'unavailable'
  await setupAndroidChannels()
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') {
    track('push_denied')
    return 'denied'
  }
  const id = projectId()
  if (!id) return 'unavailable'
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id })
  // `enable: true` : seul ce geste du membre active le push côté serveur.
  await api('/api/v1/push', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', enable: true } })
  await AsyncStorage.setItem(TOKEN_KEY, token)
  track('push_enabled')
  return 'granted'
}

/** Réinscrit le jeton à chaque lancement connecté (il peut changer), sans rien demander. */
export async function refreshPushToken(): Promise<void> {
  if ((await pushStatus()) !== 'granted') return
  const id = projectId()
  if (!id) return
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id })
  await api('/api/v1/push', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } })
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

const PENDING_KEY = 'paname-push-unregister'

/**
 * À la déconnexion : le serveur oublie cet appareil. Hors ligne, le jeton est
 * gardé et l'oubli rejoué au prochain lancement (flushPendingUnregister) :
 * un téléphone ne garde jamais les alertes d'un membre déconnecté.
 */
export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY)
  if (!token) return
  await AsyncStorage.removeItem(TOKEN_KEY)
  try {
    await api('/api/v1/push', { method: 'DELETE', body: { token } })
  } catch {
    await AsyncStorage.setItem(PENDING_KEY, token)
  }
}

export async function flushPendingUnregister(): Promise<void> {
  const token = await AsyncStorage.getItem(PENDING_KEY)
  if (!token) return
  try {
    await api('/api/v1/push', { method: 'DELETE', body: { token } })
    await AsyncStorage.removeItem(PENDING_KEY)
  } catch {}
}

/** Ouvre l'écran d'une notification touchée (url = chemin du site). */
export function openNotification(response: Notifications.NotificationResponse | null | undefined) {
  const data = response?.notification.request.content.data as { url?: string; kind?: string } | undefined
  if (!data?.url) return
  const route = appRouteForWebPath(data.url)
  track('push_open', { kind: data.kind ?? null })
  if (route) router.push(route)
}
