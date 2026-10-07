/**
 * "Je veux sortir…" — turn a free-text request into visible, editable filters.
 *
 * 1. Deterministic rules (free, instant) — enough for most queries.
 * 2. Claude Haiku 4.5 with structured output for richer sentences, cached per
 *    normalised query for 24 h, 4 s timeout, no retries. The LLM only proposes
 *    filters; everything is re-validated against our taxonomy.
 */
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { CATEGORY_BY_SLUG, INTENT_BY_SLUG, normalizeArrondissement } from '@/lib/events/taxonomy'
import { foldText } from '@/lib/events/fold'
import { parisISODate } from '@/lib/paris-time'
import { EMPTY_INTENT, isWellUnderstood, parseIntentRules, summarize, type OutingIntent } from './intent-rules'

export type { OutingIntent } from './intent-rules'

export const MAX_QUERY_LENGTH = 200
const MODEL = process.env.ANTHROPIC_INTENT_MODEL || 'claude-haiku-4-5'

const IntentSchema = z.object({
  when: z.enum(['now', 'tonight', 'today', 'tomorrow', 'weekend', 'week', 'month']).nullable(),
  date: z.string().nullable().describe('YYYY-MM-DD si une date précise est demandée, sinon null'),
  categories: z.array(z.enum(Object.keys(CATEGORY_BY_SLUG) as [string, ...string[]])),
  arrondissements: z.array(z.string()).describe('Arrondissements de Paris au format "1er", "2e" … "20e"'),
  maxPrice: z.number().nullable().describe('Budget max par personne en euros, ou null'),
  free: z.boolean(),
  intents: z.array(z.enum(Object.keys(INTENT_BY_SLUG) as [string, ...string[]])),
  keywords: z.array(z.string()).describe('2 à 4 mots-clés précis (genre, artiste, thème), en minuscules'),
  nearMe: z.boolean(),
  people: z.number().nullable(),
  summary: z.string().describe('Reformulation courte, tutoiement, 12 mots max, sans emoji'),
})

const SYSTEM_PROMPT = `Tu es le moteur d'intention de Paname Club, un guide des sorties culturelles à Paris.
On te donne la demande d'une personne qui cherche quoi faire. Tu la traduis en filtres structurés.

Règles :
- when : "now" (maintenant / dans l'heure), "tonight" (ce soir), "today" (aujourd'hui, en journée), "tomorrow", "weekend" (vendredi soir → dimanche), "week" (7 prochains jours), "month". null si rien n'est dit.
- date : seulement si un jour précis est nommé ("le 14", "samedi 18 octobre"). Utilise la date du jour fournie pour résoudre.
- categories : uniquement parmi concerts, expos, theatre, spectacles (humour, cirque, cabaret), danse, cinema, festivals, conferences, ateliers, visites. "musique ou spectacle" → ["concerts","spectacles"]. Vide si la personne est ouverte à tout.
- intents (ambiance / avec qui) : en-amoureux, entre-amis, en-famille, insolite, plein-air, festif, culture-pointue, chill.
- maxPrice : budget par personne en euros. "moins de 30 € pour deux" → 15. "pas cher" → 15. free=true seulement si gratuit est explicitement demandé.
- arrondissements : "dans le 11e" → ["11e"]. Si un quartier est nommé, donne ses arrondissements (Marais → ["3e","4e"], Montmartre → ["18e"], Belleville → ["19e","20e"], Saint-Germain → ["6e"], Bastille → ["11e","12e"], Pigalle → ["9e","18e"], Canal Saint-Martin → ["10e"], Butte-aux-Cailles → ["13e"], Oberkampf → ["11e"]).
- nearMe : true si "près de moi", "autour de moi", "pas loin".
- keywords : mots précis utiles à la recherche (jazz, impressionnisme, stand-up, nom d'artiste). Pas de mots génériques (sortie, soirée, truc, sympa).
- Ne devine pas ce qui n'est pas dit.`

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic({ timeout: 4000, maxRetries: 0 })
  return client
}

function sanitize(raw: z.infer<typeof IntentSchema>, fallback: OutingIntent): OutingIntent {
  const arrondissements = raw.arrondissements
    .map((a) => normalizeArrondissement(a.replace(/[^0-9a-z]/gi, '')))
    .filter((a): a is string => Boolean(a))
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null
  const intent: OutingIntent = {
    when: raw.when ?? fallback.when,
    date,
    categories: raw.categories.filter((c) => c in CATEGORY_BY_SLUG).slice(0, 3),
    arrondissements: [...new Set([...arrondissements, ...fallback.arrondissements])].slice(0, 4),
    maxPrice: raw.maxPrice != null && raw.maxPrice > 0 && raw.maxPrice < 500 ? Math.round(raw.maxPrice) : fallback.maxPrice,
    free: raw.free || fallback.free,
    intents: raw.intents.filter((i) => i in INTENT_BY_SLUG).slice(0, 2),
    keywords: raw.keywords
      .map((k) => foldText(k).replace(/[^a-z0-9\s-]/g, '').trim())
      .filter((k) => k.length >= 3)
      .slice(0, 4),
    nearMe: raw.nearMe || fallback.nearMe,
    people: raw.people && raw.people > 0 && raw.people < 50 ? Math.round(raw.people) : fallback.people,
    summary: raw.summary.replace(/[—–]/g, ',').slice(0, 120),
  }
  if (!intent.summary) intent.summary = summarize(intent)
  return intent
}

async function callModel(query: string, today: string): Promise<z.infer<typeof IntentSchema> | null> {
  const anthropic = getClient()
  if (!anthropic) return null
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Date du jour (Paris) : ${today}\nDemande : ${query}` }],
    output_config: { format: zodOutputFormat(IntentSchema) },
  })
  if (response.stop_reason !== 'end_turn' && response.stop_reason !== 'stop_sequence') return null
  return response.parsed_output ?? null
}

const cachedModel = unstable_cache(
  async (normalized: string, today: string) => {
    try {
      return await callModel(normalized, today)
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.warn('[ai-intent] rate limited')
      else if (err instanceof Anthropic.APIError) console.warn(`[ai-intent] API error ${err.status}`)
      else console.warn('[ai-intent] failed', err instanceof Error ? err.message : err)
      return null
    }
  },
  ['ai-intent-v1'],
  { revalidate: 86400, tags: ['ai-intent'] }
)

export interface ParsedIntent {
  intent: OutingIntent
  source: 'rules' | 'ai' | 'empty'
}

export async function parseOutingRequest(input: string): Promise<ParsedIntent> {
  const query = input.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH)
  if (query.length < 2) return { intent: { ...EMPTY_INTENT }, source: 'empty' }

  const rules = parseIntentRules(query)
  if (isWellUnderstood(query, rules)) return { intent: rules, source: 'rules' }

  const today = parisISODate(new Date())
  const ai = await cachedModel(foldText(query), today)
  if (!ai) return { intent: rules, source: 'rules' }
  return { intent: sanitize(ai, rules), source: 'ai' }
}
