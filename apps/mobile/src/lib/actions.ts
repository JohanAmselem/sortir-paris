/**
 * Gestes natifs d'une fiche : billetterie (navigateur intégré), calendrier
 * (formulaire du système, sans autorisation large), itinéraire, partage.
 */
import { Linking, Platform, Share } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as CalendarLegacy from 'expo-calendar/legacy'
import { colors } from '@/theme'
import { track } from './analytics'

export async function openBooking(url: string, source?: string) {
  let domain: string | null = null
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {}
  track('outbound_click', { domain, source: source ?? null })
  await WebBrowser.openBrowserAsync(url, {
    controlsColor: colors.accent,
    toolbarColor: colors.paper,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    dismissButtonStyle: 'close',
  }).catch(() => Linking.openURL(url))
}

export async function openWeb(url: string) {
  await WebBrowser.openBrowserAsync(url, { controlsColor: colors.accent, dismissButtonStyle: 'close' }).catch(() => Linking.openURL(url))
}

export async function addToCalendar(input: { title: string; start: Date; end: Date | null; location?: string | null; url?: string; notes?: string | null }) {
  track('calendar_add')
  const end = input.end && input.end > input.start ? input.end : new Date(input.start.getTime() + 2 * 3600_000)
  try {
    await CalendarLegacy.createEventInCalendarAsync({
      title: input.title,
      startDate: input.start,
      endDate: end,
      location: input.location ?? undefined,
      url: input.url,
      notes: [input.notes, input.url].filter(Boolean).join('\n\n') || undefined,
      timeZone: 'Europe/Paris',
    })
    return true
  } catch {
    return false
  }
}

export function openDirections(input: { lat: number | null; lng: number | null; name: string; address?: string | null }) {
  track('directions')
  const label = encodeURIComponent(input.name)
  const query = input.lat != null && input.lng != null ? `${input.lat},${input.lng}` : encodeURIComponent([input.name, input.address, 'Paris'].filter(Boolean).join(', '))
  const url = Platform.select({
    ios: `https://maps.apple.com/?daddr=${query}&q=${label}`,
    default: input.lat != null ? `geo:0,0?q=${query}(${label})` : `https://www.google.com/maps/search/?api=1&query=${query}`,
  })
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`))
}

export async function shareLink(title: string, url: string) {
  track('share')
  await Share.share(Platform.OS === 'ios' ? { message: title, url } : { message: `${title}\n${url}` }).catch(() => {})
}
