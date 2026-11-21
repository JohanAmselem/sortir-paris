import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { Button, Chip, T } from '@/components/ui'
import { colors, fonts, GUTTER } from '@/theme'

export interface SheetOption {
  value: string
  label: string
}

/**
 * Feuille de choix multiple (catégories, arrondissements, ambiances).
 * Les choix s'appliquent tout de suite ; « Voir les résultats » referme.
 */
export function FilterSheet({
  visible,
  title,
  options,
  selected,
  onToggle,
  onClear,
  onClose,
  resultLabel,
}: {
  visible: boolean
  title: string
  options: SheetOption[]
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  onClose: () => void
  resultLabel?: string
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <T v="h2" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={12} onPress={onClose} style={styles.close}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} active={selected.includes(o.value)} onPress={() => onToggle(o.value)} />
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onClear} disabled={!selected.length} hitSlop={8}>
            <Text style={[styles.clear, !selected.length && { opacity: 0.4 }]}>Tout effacer</Text>
          </Pressable>
          <Button label={resultLabel ?? 'Voir les résultats'} onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: 20, paddingBottom: 12 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: GUTTER, paddingBottom: 24 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: GUTTER, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  clear: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
})
