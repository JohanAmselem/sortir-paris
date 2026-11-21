import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { Stack, usePathname } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { useFonts, Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo'
import { QueryProvider } from '@/lib/query'
import { AuthProvider, useSession } from '@/lib/auth'
import { loadLocalState } from '@/lib/local-store'
import { flushPendingUnregister, openNotification, refreshPushToken, setupAndroidChannels } from '@/lib/push'
import { trackScreen } from '@/lib/analytics'
import { colors, fonts } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Données rafraîchies au retour au premier plan, pas en arrière-plan.
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'))
onlineManager.setOnline(true)

/** Notifications touchées (même appli fermée) et jeton tenu à jour. */
function PushBridge() {
  const session = useSession()
  const last = Notifications.useLastNotificationResponse()
  useEffect(() => {
    setupAndroidChannels().catch(() => {})
    flushPendingUnregister().catch(() => {})
  }, [])
  useEffect(() => {
    if (last) openNotification(last)
  }, [last])
  useEffect(() => {
    if (session) refreshPushToken().catch(() => {})
  }, [session])
  return null
}

function ScreenTracker() {
  const path = usePathname()
  useEffect(() => {
    // Seulement le type d'écran, jamais le slug (pas d'historique de navigation détaillé).
    trackScreen(path.split('/').slice(0, 2).join('/') || '/')
  }, [path])
  return null
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold })
  const [localReady, setLocalReady] = useState(false)

  useEffect(() => {
    loadLocalState().finally(() => setLocalReady(true))
  }, [])
  const ready = (fontsLoaded || !!fontError) && localReady
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])
  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <PushBridge />
            <ScreenTracker />
            <Stack
              screenOptions={{
                headerTintColor: colors.ink,
                headerTitleStyle: { fontFamily: fonts.semibold },
                headerBackButtonDisplayMode: 'minimal',
                headerShadowVisible: false,
                headerStyle: { backgroundColor: colors.paper },
                contentStyle: { backgroundColor: colors.paper },
              }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Accueil' }} />
              <Stack.Screen name="evenements/[slug]" options={{ title: '', headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } }} />
              <Stack.Screen name="lieux/[slug]" options={{ title: '' }} />
              <Stack.Screen name="oeuvres/[slug]" options={{ title: '' }} />
              <Stack.Screen name="films/[slug]" options={{ title: '' }} />
              <Stack.Screen name="liste" options={{ title: '' }} />
              <Stack.Screen name="drop" options={{ title: 'Le Drop' }} />
              <Stack.Screen name="adn" options={{ title: 'Mon ADN culturel' }} />
              <Stack.Screen name="compte/artistes" options={{ title: 'Mes artistes et lieux' }} />
              <Stack.Screen name="reglages" options={{ title: 'Réglages' }} />
              <Stack.Screen name="connexion" options={{ presentation: 'modal', title: 'Rejoindre le Club' }} />
              <Stack.Screen name="quiz" options={{ presentation: 'fullScreenModal', headerShown: false }} />
              <Stack.Screen name="match" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            </Stack>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
