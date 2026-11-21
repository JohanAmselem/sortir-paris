/**
 * Position, demandée seulement au geste du membre (« près de moi »). Elle sert
 * à la recherche du moment et n'est jamais enregistrée.
 */
import * as Location from 'expo-location'
import { Linking } from 'react-native'

export type Coords = { lat: number; lng: number }

/** Paris et petite couronne : au-delà, la recherche « près de moi » n'a pas de sens. */
export function inParisArea(c: Coords): boolean {
  return c.lat > 48.5 && c.lat < 49.2 && c.lng > 1.9 && c.lng < 2.9
}

export type LocateResult = { ok: true; coords: Coords } | { ok: false; reason: 'denied' | 'unavailable' | 'outside' }

export async function locate(): Promise<LocateResult> {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (perm.status !== 'granted') return { ok: false, reason: 'denied' }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 500 })
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    if (!inParisArea(coords)) return { ok: false, reason: 'outside' }
    return { ok: true, coords }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export function locateMessage(reason: 'denied' | 'unavailable' | 'outside'): string {
  if (reason === 'denied') return 'Position refusée : autorise-la dans les Réglages du téléphone pour voir ce qui se passe près de toi.'
  if (reason === 'outside') return 'Tu sembles loin de Paris : « près de moi » marche à Paris et en petite couronne.'
  return 'Impossible de trouver ta position pour le moment.'
}

export const openSettings = () => Linking.openSettings()
