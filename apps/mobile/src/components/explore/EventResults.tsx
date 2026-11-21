import { useCallback, useMemo, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import type { CardEvent } from '@/shared'
import { EventCard } from '@/components/EventCard'
import { EmptyState, ErrorState, Loading, T } from '@/components/ui'
import { useEventList } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { colors, GUTTER } from '@/theme'

const keyExtractor = (e: CardEvent) => e.id

/**
 * Liste infinie de sorties pour des paramètres au format du site.
 * Utilisée par Explorer (résultats) et par l'écran Liste (collections, « Tout voir »).
 */
export function EventResults({
  params,
  origin,
  header,
  empty,
  showCount = true,
  contentTopInset = 0,
}: {
  params: string
  origin: string
  header?: ReactElement | null
  empty?: { title: string; text?: string; action?: ReactElement }
  showCount?: boolean
  contentTopInset?: number
}) {
  const q = useEventList(params)
  const events = useMemo(() => {
    const seen = new Set<string>()
    const out: CardEvent[] = []
    for (const p of q.data?.pages ?? []) {
      for (const e of p.events) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        out.push(e)
      }
    }
    return out
  }, [q.data])
  const total = q.data?.pages[0]?.total ?? 0

  const renderItem = useCallback(({ item }: { item: CardEvent }) => <EventCard event={item} variant="row" origin={origin} />, [origin])
  const onEnd = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage()
  }, [q])

  const listHeader = (
    <View>
      {header}
      {showCount && q.isSuccess && events.length > 0 ? (
        <T v="caption" style={styles.count} accessibilityLiveRegion="polite">
          {total > 1 ? `${total.toLocaleString('fr-FR')} sorties` : '1 sortie'}
        </T>
      ) : null}
    </View>
  )

  let emptyNode: ReactElement | null = null
  if (q.isPending) emptyNode = <Loading />
  else if (q.isError) emptyNode = <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
  else
    emptyNode = (
      <EmptyState
        title={empty?.title ?? 'Rien pour ces critères'}
        text={empty?.text ?? 'Essaie une autre date, ou retire un filtre.'}
        action={empty?.action}
      />
    )

  return (
    <FlatList
      data={events}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyNode}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} /> : <View style={{ height: 32 }} />}
      ItemSeparatorComponent={Separator}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.accent} />}
      contentContainerStyle={[styles.content, { paddingTop: contentTopInset }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={8}
      windowSize={9}
      removeClippedSubviews
    />
  )
}

function Separator() {
  return <View style={styles.sep} />
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, flexGrow: 1 },
  count: { marginBottom: 4, marginTop: 4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
})
