/**
 * Couleur de la barre d'état (heure, batterie) écran par écran : claire sur les
 * écrans sombres (accueil, Match, quiz, fiche avec photo), sombre partout ailleurs.
 */
import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'

export function useStatusBar(style: 'light' | 'dark') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style, true)
      return () => setStatusBarStyle('dark', true)
    }, [style])
  )
}
