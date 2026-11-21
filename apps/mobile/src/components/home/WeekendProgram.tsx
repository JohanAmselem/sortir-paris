import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { HomeResponse } from '@/shared'
import { Chip, T } from '@/components/ui'
import { EventCard } from '@/components/EventCard'
import { GUTTER } from '@/theme'

/** « Ce week-end » jour par jour (vendredi soir → dimanche), comme sur le site. */
export function WeekendProgram({ days }: { days: HomeResponse['weekend'] }) {
  const firstWithEvents = Math.max(0, days.findIndex((d) => d.events.length > 0))
  const [index, setIndex] = useState(firstWithEvents)
  const day = days[index]
  if (!day) return null
  return (
    <View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {days.map((d, i) => (
          <Chip key={d.key} label={`${d.label} · ${d.events.length}`} active={i === index} onPress={() => setIndex(i)} />
        ))}
      </View>
      <View style={{ paddingHorizontal: GUTTER }}>
        {day.events.length ? (
          day.events.map((e) => <EventCard key={e.id} event={e} variant="row" origin="weekend" />)
        ) : (
          <T v="small" style={{ paddingVertical: 12 }}>
            Rien de repéré ce jour-là pour l’instant.
          </T>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, marginBottom: 6 },
})
