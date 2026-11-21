import { memo, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { colors, fonts } from '@/theme'

/**
 * Les marqueurs personnalisés ne sont redessinés que pendant leur première
 * seconde (tracksViewChanges), sinon la carte rame avec quelques centaines de points.
 */
function useTracks(dep: unknown) {
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    setTracks(true)
    const t = setTimeout(() => setTracks(false), 600)
    return () => clearTimeout(t)
  }, [dep])
  return tracks
}

export const ClusterMarker = memo(function ClusterMarker({
  lat,
  lng,
  count,
  onPress,
}: {
  lat: number
  lng: number
  count: number
  onPress: () => void
}) {
  const tracks = useTracks(count)
  const size = count >= 100 ? 52 : count >= 25 ? 44 : 38
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      onPress={onPress}
      tracksViewChanges={tracks}
      accessibilityLabel={`${count} lieux, toucher pour zoomer`}>
      <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.clusterText}>{count >= 1000 ? `${Math.round(count / 100) / 10} k` : count}</Text>
      </View>
    </Marker>
  )
})

export const VenueMarker = memo(function VenueMarker({
  lat,
  lng,
  name,
  count,
  selected,
  free,
  onPress,
}: {
  lat: number
  lng: number
  name: string
  count: number
  selected: boolean
  free: boolean
  onPress: () => void
}) {
  const tracks = useTracks(`${count}-${selected}`)
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      onPress={onPress}
      tracksViewChanges={tracks}
      zIndex={selected ? 10 : 1}
      accessibilityLabel={`${name}, ${count} sortie${count > 1 ? 's' : ''}`}>
      <View style={[styles.pin, selected && styles.pinSelected, free && !selected && styles.pinFree]}>
        <Text style={[styles.pinText, selected && { color: colors.white }]}>{count}</Text>
      </View>
    </Marker>
  )
})

const styles = StyleSheet.create({
  cluster: {
    backgroundColor: 'rgba(116,54,227,0.92)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  pin: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinFree: { borderColor: colors.free },
  pinSelected: { backgroundColor: colors.accent, borderColor: colors.white },
  pinText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
})
