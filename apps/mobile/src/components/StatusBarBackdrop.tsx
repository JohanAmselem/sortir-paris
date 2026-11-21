import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Fond fixe derrière l'heure et la batterie : le contenu qui défile ne passe
 * jamais sous la barre d'état (à placer en dernier enfant de l'écran).
 */
export function StatusBarBackdrop({ color }: { color: string }) {
  const insets = useSafeAreaInsets()
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: color }} />
}
