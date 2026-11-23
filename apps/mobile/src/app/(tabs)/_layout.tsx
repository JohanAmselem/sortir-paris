import { NativeTabs } from 'expo-router/native-tabs'
import { colors, fonts } from '@/theme'

/**
 * Les 4 onglets de la 2.0 (décision du 23/11/2026) :
 * Sortir · Agenda · Carte · Mes sorties. Le compte est derrière l'avatar.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.text}
      iconColor={colors.muted}
      labelStyle={{ fontFamily: fonts.semibold }}
      backgroundColor={colors.bg}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Sortir</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'moon.stars', selected: 'moon.stars.fill' }} md="nightlife" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="agenda">
        <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="carte">
        <NativeTabs.Trigger.Label>Carte</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="mes-sorties">
        <NativeTabs.Trigger.Label>Mes sorties</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bookmark', selected: 'bookmark.fill' }} md="bookmark" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
