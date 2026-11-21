import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import Constants from 'expo-constants'
import Supercluster, { type ClusterProperties, type PointFeature } from 'supercluster'
import { LocateFixed } from 'lucide-react-native'
import { router } from 'expo-router'
import { buildEventParams } from '@/shared'
import { Button, Chip, T } from '@/components/ui'
import { ClusterMarker, VenueMarker } from '@/components/map/MapMarkers'
import { VenuePanel, type SelectedVenue } from '@/components/map/VenuePanel'
import { useMapData } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { track } from '@/lib/analytics'
import { locate, locateMessage } from '@/lib/location'
import type { MapFeature } from '@/lib/types'
import { colors, fonts, GUTTER, radius } from '@/theme'

type When = 'now' | 'tonight' | 'tomorrow' | 'weekend'
type VenueProps = MapFeature['properties']

const WHEN: Array<{ key: When; label: string }> = [
  { key: 'now', label: 'Maintenant' },
  { key: 'tonight', label: 'Ce soir' },
  { key: 'tomorrow', label: 'Demain' },
  { key: 'weekend', label: 'Ce week-end' },
]

const PARIS: Region = { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.12, longitudeDelta: 0.12 }

/** Android n'affiche une carte qu'avec une clé Google Maps (app.config.ts : GOOGLE_MAPS_ANDROID_KEY). */
const ANDROID_KEY = Boolean((Constants.expoConfig?.android?.config as { googleMaps?: { apiKey?: string } } | undefined)?.googleMaps?.apiKey)
const PROVIDER = Platform.OS === 'android' && ANDROID_KEY ? PROVIDER_GOOGLE : PROVIDER_DEFAULT

function zoomOf(r: Region): number {
  return Math.max(0, Math.min(20, Math.round(Math.log2(360 / Math.max(r.longitudeDelta, 1e-6)))))
}

function bboxOf(r: Region): [number, number, number, number] {
  return [r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2]
}

function MapScreen() {
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView>(null)
  const [when, setWhen] = useState<When>('tonight')
  const [free, setFree] = useState(false)
  const [region, setRegion] = useState<Region>(PARIS)
  const [selected, setSelected] = useState<SelectedVenue | null>(null)
  const [userShown, setUserShown] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  const params = useMemo(() => buildEventParams({ when, free }).toString(), [when, free])
  const map = useMapData(params)

  useEffect(() => {
    track('map_open')
  }, [])

  const index = useMemo(() => {
    const sc = new Supercluster<VenueProps>({ radius: 64, maxZoom: 16, minPoints: 2 })
    sc.load((map.data?.features ?? []) as PointFeature<VenueProps>[])
    return sc
  }, [map.data])

  const clusters = useMemo(() => index.getClusters(bboxOf(region), zoomOf(region)), [index, region])

  const zoomInto = useCallback(
    (clusterId: number, lat: number, lng: number) => {
      const z = Math.min(index.getClusterExpansionZoom(clusterId), 18)
      const delta = 360 / Math.pow(2, z)
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }, 350)
    },
    [index]
  )

  const locate = async () => {
    setLocating(true)
    try {
      const perm = await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') {
        setLocationDenied(true)
        return
      }
      setLocationDenied(false)
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setUserShown(true)
      track('map_locate')
      mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 500)
    } catch {
      setLocationDenied(true)
    } finally {
      setLocating(false)
    }
  }

  const markers = clusters.map((f) => {
    const [lng, lat] = f.geometry.coordinates
    const p = f.properties as Partial<ClusterProperties> & Partial<VenueProps>
    if (p.cluster && p.cluster_id != null) {
      const id = p.cluster_id
      return <ClusterMarker key={`c-${id}`} lat={lat} lng={lng} count={p.point_count ?? 0} onPress={() => zoomInto(id, lat, lng)} />
    }
    const v = f.properties as VenueProps
    return (
      <VenueMarker
        key={`v-${v.slug}`}
        lat={lat}
        lng={lng}
        name={v.name}
        count={v.n}
        free={v.free > 0 && v.free === v.n}
        selected={selected?.slug === v.slug}
        onPress={() => {
          track('map_select')
          setSelected({ slug: v.slug, name: v.name, arr: v.arr, n: v.n })
        }}
      />
    )
  })

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER}
        initialRegion={PARIS}
        onRegionChangeComplete={setRegion}
        showsUserLocation={userShown}
        showsPointsOfInterests={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(e) => {
          // Toucher le fond de carte ferme le panneau (pas un marqueur).
          if (e.nativeEvent.action !== 'marker-press') setSelected(null)
        }}
        accessibilityLabel="Carte des sorties à Paris">
        {markers}
      </MapView>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {WHEN.map((w) => (
            <Chip
              key={w.key}
              label={w.label}
              active={when === w.key}
              onPress={() => {
                setWhen(w.key)
                setSelected(null)
                track('filter', { type: 'map_when' })
              }}
            />
          ))}
          <Chip
            label="Gratuit"
            active={free}
            onPress={() => {
              setFree((f) => !f)
              setSelected(null)
              track('filter', { type: 'map_free' })
            }}
          />
        </ScrollView>

        {map.isFetching && !map.data ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.statusText}>Chargement de la carte…</Text>
          </View>
        ) : null}
        {map.isError ? (
          <Pressable accessibilityRole="button" onPress={() => map.refetch()} style={[styles.status, styles.statusError]}>
            <Text style={[styles.statusText, { color: colors.error }]}>{errorMessage(map.error)} Toucher pour réessayer.</Text>
          </Pressable>
        ) : null}
        {map.isSuccess && !map.data.features.length ? (
          <View style={styles.status}>
            <Text style={styles.statusText}>Aucune sortie repérée pour ce créneau. Essaie un autre moment.</Text>
          </View>
        ) : null}
        {Platform.OS === 'android' && !ANDROID_KEY ? (
          <View style={[styles.status, styles.statusError]}>
            <Text style={[styles.statusText, { color: colors.error }]}>La carte n’est pas encore disponible dans cette version Android.</Text>
          </View>
        ) : null}
        {locationDenied ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.status}>
            <Text style={styles.statusText}>
              Pour voir ce qui est autour de toi, autorise la position dans les Réglages. <Text style={styles.statusLink}>Ouvrir les Réglages</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Autour de moi"
        accessibilityHint="Centre la carte sur ta position"
        onPress={locate}
        disabled={locating}
        style={({ pressed }) => [styles.locate, { bottom: (selected ? 440 : 24) + insets.bottom, opacity: pressed ? 0.8 : 1 }]}>
        {locating ? <ActivityIndicator color={colors.ink} /> : <LocateFixed size={20} color={colors.ink} />}
        <Text style={styles.locateText}>Autour de moi</Text>
      </Pressable>

      {selected ? <VenuePanel venue={selected} params={params} bottomInset={insets.bottom} onClose={() => setSelected(null)} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paperDeep },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  chips: { paddingHorizontal: GUTTER, gap: 8, paddingBottom: 8 },
  status: {
    marginHorizontal: GUTTER,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(254,253,252,0.96)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusError: { backgroundColor: colors.neonSoft, borderColor: colors.neonSoft },
  statusText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.ink },
  statusLink: { fontFamily: fonts.semibold, color: colors.accent, textDecorationLine: 'underline' },
  locate: {
    position: 'absolute',
    right: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  locateText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
})

/**
 * Android sans clé Google Maps : react-native-maps ne peut pas créer la carte
 * (plantage natif). On ne la monte jamais ; on propose la liste « près de moi ».
 */
function MapUnavailable() {
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const nearMe = async () => {
    setBusy(true)
    setMessage(null)
    const r = await locate()
    setBusy(false)
    if (!r.ok) return setMessage(locateMessage(r.reason))
    const params = `when=next3h&lat=${r.coords.lat.toFixed(4)}&lng=${r.coords.lng.toFixed(4)}&sort=distance`
    router.push({ pathname: '/liste', params: { params, title: 'Autour de moi', kicker: 'Dans les 3 heures' } })
  }
  return (
    <View style={[styles.screen, { backgroundColor: colors.paper, paddingTop: insets.top + 24, paddingHorizontal: GUTTER }]}>
      <T v="kicker">Carte</T>
      <T v="h1" style={{ marginTop: 4 }}>
        Autour de toi
      </T>
      <T v="small" style={{ marginTop: 8 }}>
        La carte arrive bientôt sur Android. En attendant, voici ce qui commence près de toi, du plus proche au plus loin.
      </T>
      {message ? <T v="small" style={{ color: colors.error, marginTop: 12 }}>{message}</T> : null}
      <Button label="Ce qui commence près de moi" loading={busy} onPress={nearMe} style={{ marginTop: 20 }} />
      <Button
        label="Toutes les sorties de ce soir"
        kind="secondary"
        style={{ marginTop: 10 }}
        onPress={() => router.push({ pathname: '/liste', params: { params: 'when=tonight', title: 'Ce soir', kicker: 'Tout Paris' } })}
      />
    </View>
  )
}

export default function CarteScreen() {
  return Platform.OS === 'android' && !ANDROID_KEY ? <MapUnavailable /> : <MapScreen />
}
