/**
 * Appli « Nuit » : la barre d'état (heure, batterie) est toujours claire.
 * Gardé pour les écrans qui l'appellent encore.
 */
import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'

export function useStatusBar(_style: 'light' | 'dark' = 'light') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light', true)
    }, [])
  )
}
