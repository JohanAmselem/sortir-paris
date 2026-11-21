/**
 * Cache des données (TanStack Query), gardé sur le téléphone : l'accueil, les
 * fiches ouvertes et « Mes sorties » restent consultables sans réseau.
 */
import type { ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { ApiError } from './api'

const DAY = 24 * 3600_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 7 * DAY,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'online' },
  },
})

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'paname-cache-v1', throttleTime: 2000 })

/** Seules ces familles de requêtes sont gardées hors-ligne. */
const PERSISTED = new Set(['home', 'meta', 'event', 'venue', 'me', 'club', 'drop'])

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        buster: 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
        },
      }}>
      {children}
    </PersistQueryClientProvider>
  )
}
