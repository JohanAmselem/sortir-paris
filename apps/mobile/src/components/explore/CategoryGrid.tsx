import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Clapperboard,
  Disc3,
  Drama,
  Dumbbell,
  Footprints,
  Hammer,
  Landmark,
  Laugh,
  Mic,
  Music,
  Palette,
  PartyPopper,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native'
import { CATEGORIES } from '@/shared'
import { colors, fonts, radius } from '@/theme'

const ICONS: Record<string, LucideIcon> = {
  concerts: Music,
  expos: Palette,
  theatre: Drama,
  spectacles: Laugh,
  danse: Footprints,
  cinema: Clapperboard,
  festivals: PartyPopper,
  conferences: Mic,
  ateliers: Hammer,
  visites: Landmark,
  soirees: Disc3,
  sport: Dumbbell,
}

/** Grille des catégories (2 colonnes), icônes sobres plutôt qu'émojis. */
export function CategoryGrid({ onPick }: { onPick: (slug: string, label: string) => void }) {
  return (
    <View style={styles.grid}>
      {CATEGORIES.map((c) => {
        const Icon = ICONS[c.slug] ?? Sparkles
        return (
          <Pressable
            key={c.slug}
            accessibilityRole="button"
            accessibilityLabel={c.plural}
            onPress={() => onPick(c.slug, c.plural)}
            style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.75 : 1 }]}>
            <Icon size={20} color={colors.accent} />
            <Text style={styles.label} numberOfLines={2}>
              {c.plural}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.5%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
})
