/**
 * Caption hook: 1–2 sentences written by Claude Haiku from the event list only,
 * then checked (validateHook). Anything unverifiable → template hook.
 */
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { HOOK_MAX, templateHook, validateHook } from './caption'

const MODEL = process.env.ANTHROPIC_HOOK_MODEL || process.env.ANTHROPIC_INTENT_MODEL || 'claude-haiku-4-5'

const SYSTEM = `Tu écris l'accroche d'une publication Instagram de Paname Club, un guide des sorties à Paris.
On te donne la liste des sorties de la publication. Tu écris UNIQUEMENT l'accroche : 1 ou 2 phrases courtes, ${HOOK_MAX - 40} caractères maximum, en français, en tutoyant.
Règles strictes :
- N'utilise que les informations de la liste. N'invente rien : aucun nom, aucun chiffre, aucune date, aucun superlatif factuel (« complet », « dernière date », « première fois »).
- Tu peux citer au plus un titre ou un lieu, recopié exactement.
- Pas de hashtag, pas de lien, pas de @, au plus un emoji.
- Réponds par l'accroche seule, sans guillemets.`

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic({ timeout: 10_000, maxRetries: 1 })
  return client
}

export interface HookResult {
  hook: string
  source: 'ai' | 'template'
  rejected?: string
}

export async function writeHook(theme: string, seed: string, input: string, opts: { useAi: boolean }): Promise<HookResult> {
  const fallback = { hook: templateHook(theme, seed), source: 'template' as const }
  const anthropic = opts.useAi ? getClient() : null
  if (!anthropic) return fallback
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Sorties :\n${input}` }],
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
    const check = validateHook(text, input)
    if (check.ok) return { hook: check.hook, source: 'ai' }
    console.warn('[instagram] hook rejected:', check.reason)
    return { ...fallback, rejected: check.reason }
  } catch (err) {
    console.warn('[instagram] hook failed', err instanceof Error ? err.message : err)
    return fallback
  }
}
