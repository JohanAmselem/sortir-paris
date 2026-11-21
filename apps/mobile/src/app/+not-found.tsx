import { View } from 'react-native'
import { router, Stack } from 'expo-router'
import { Button, T } from '@/components/ui'
import { colors } from '@/theme'

export default function NotFound() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ title: 'Introuvable' }} />
      <T v="h2" style={{ textAlign: 'center' }}>Cette page n’existe pas dans l’appli.</T>
      <Button label="Revenir à ce soir" onPress={() => router.replace('/')} style={{ marginTop: 20 }} />
    </View>
  )
}
