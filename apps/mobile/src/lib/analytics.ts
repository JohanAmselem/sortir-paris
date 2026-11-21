/**
 * Mesure d'usage minimale (Q9 du plan) : PostHog, hébergé dans l'UE, sans
 * identifiant publicitaire ni suivi entre applis (pas de demande ATT).
 * Sans clé EXPO_PUBLIC_POSTHOG_KEY, rien n'est envoyé.
 * Événements : ceux du plan de tracking de l'audit (recherche, ouverture de
 * fiche, clic vers la billetterie, garder, alerte…), sans donnée personnelle.
 */
import { POSTHOG_KEY } from './config'

type Props = Record<string, string | number | boolean | null | undefined>

interface Client {
  capture: (event: string, props?: Props) => void
  screen: (name: string, props?: Props) => void
  reset: () => void
}

let client: Client | null = null
let starting: Promise<void> | null = null

function start(): Promise<void> {
  if (!POSTHOG_KEY) return Promise.resolve()
  starting ??= import('posthog-react-native')
    .then(({ default: PostHog }) => {
      client = new PostHog(POSTHOG_KEY, {
        host: 'https://eu.i.posthog.com',
        captureAppLifecycleEvents: true,
        personProfiles: 'never',
        disableGeoip: true,
      }) as unknown as Client
    })
    .catch(() => {})
  return starting
}

export function track(event: string, props?: Props) {
  if (!POSTHOG_KEY) return
  start().then(() => client?.capture(event, props))
}

export function trackScreen(name: string, props?: Props) {
  if (!POSTHOG_KEY) return
  start().then(() => client?.screen(name, props))
}
