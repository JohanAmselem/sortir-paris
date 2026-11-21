/**
 * Toutes les dates d'une œuvre (pièce, spectacle, tournée) ou toutes les
 * séances d'un film, groupées par jour (heure de Paris).
 */
import { useMemo } from 'react'
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Share2 } from 'lucide-react-native'
import { formatLongDay, formatTime, parisISODate, type WorkDateV1 } from '@/shared'
import { useWork } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { openBooking, shareLink } from '@/lib/actions'
import { EventImage } from '@/components/EventImage'
import { ErrorState, Loading, T } from '@/components/ui'
import { colors, fonts, GUTTER, radius } from '@/theme'

export function WorkScreen({ slug, kind }: { slug: string; kind: 'work' | 'film' }) {
  const insets = useSafeAreaInsets()
  const q = useWork(slug, kind)
  const sections = useMemo(() => {
    const byDay = new Map<string, WorkDateV1[]>()
    for (const d of q.data?.dates ?? []) {
      const key = parisISODate(new Date(d.startDate))
      byDay.set(key, [...(byDay.get(key) ?? []), d])
    }
    return [...byDay.entries()].map(([key, data]) => ({ key, title: formatLongDay(new Date(data[0].startDate)), data }))
  }, [q.data])

  if (!q.data) return q.isLoading ? <Loading /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
  const w = q.data

  return (
    <>
      <Stack.Screen
        options={{
          title: w.title,
          headerRight: () => (
            <Pressable onPress={() => shareLink(w.title, w.webUrl)} accessibilityLabel="Partager" hitSlop={10}>
              <Share2 size={20} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        stickySectionHeadersEnabled
        style={{ backgroundColor: colors.paper }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 8 }}>
            <View style={styles.cover}>
              <EventImage uri={w.imageUrl} categorySlug={w.category?.slug} style={StyleSheet.absoluteFill} />
            </View>
            {w.category ? <T v="kicker" style={{ marginTop: 16 }}>{w.category.name}</T> : null}
            <T v="h1" accessibilityRole="header" style={{ marginTop: 4 }}>
              {w.title}
            </T>
            <T v="caption" style={{ marginTop: 6 }}>
              {w.dates.length} {kind === 'film' ? 'séance' : 'date'}
              {w.dates.length > 1 ? 's' : ''} à venir
            </T>
            {w.description ? (
              <T v="body" style={{ marginTop: 12 }} numberOfLines={6}>
                {w.description}
              </T>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.day}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/evenements/[slug]', params: { slug: item.slug } })}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.time}>{item.timeKnown ? formatTime(new Date(item.startDate)) : '—'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.venue} numberOfLines={1}>
                {item.venue?.name ?? 'Lieu à préciser'}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[item.venue?.arrondissement ?? item.venue?.city, item.price.tone !== 'unknown' ? item.price.label : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {item.bookingUrl ? (
              <Pressable onPress={() => openBooking(item.bookingUrl!, 'oeuvre')} accessibilityLabel="Réserver" style={styles.book} hitSlop={6}>
                <Text style={styles.bookText}>Réserver</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
    </>
  )
}

const styles = StyleSheet.create({
  cover: { height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.night },
  dayHeader: { backgroundColor: colors.paperDeep, paddingHorizontal: GUTTER, paddingVertical: 8 },
  day: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  time: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, width: 52 },
  venue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  book: { paddingHorizontal: 12, height: 32, borderRadius: radius.full, backgroundColor: colors.accentSoft, justifyContent: 'center' },
  bookText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentHover },
})
