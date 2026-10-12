'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/app/club/_lib/api'
import { isAdminEmail } from '@/lib/instagram/admin'
import { addExclusion, deleteCredentials, removeExclusion, saveCredentials, setStatus } from '@/lib/instagram/data'
import { InstagramGraph } from '@/lib/instagram/graph'
import { prepare, publishDue } from '@/lib/instagram/pipeline'
import type { ExclusionKind } from '@/lib/instagram/types'

const PAGE = '/admin/instagram'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every action checks the admin again (server actions are public endpoints). */
async function requireAdmin() {
  const user = await getSessionUser()
  if (!user || !user.email_confirmed_at || !isAdminEmail(user.email)) notFound()
  return user
}

function done(msg: string, tone: 'ok' | 'error' = 'ok'): never {
  revalidatePath(PAGE)
  redirect(`${PAGE}?${tone === 'ok' ? 'msg' : 'err'}=${encodeURIComponent(msg)}`)
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function postId(f: FormData): string {
  const id = str(f, 'id')
  if (!UUID.test(id)) done('Publication introuvable.', 'error')
  return id
}

export async function blockPost(f: FormData) {
  await requireAdmin()
  const ok = await setStatus(postId(f), ['draft', 'failed'], 'blocked')
  done(ok ? 'Publication bloquée : elle ne partira pas.' : 'Rien à bloquer (déjà publiée ou en cours).', ok ? 'ok' : 'error')
}

export async function unblockPost(f: FormData) {
  await requireAdmin()
  const ok = await setStatus(postId(f), ['blocked'], 'draft', { attempts: 0, error: null })
  done(ok ? 'Publication débloquée : elle partira à l’heure prévue.' : 'Cette publication n’était pas bloquée.', ok ? 'ok' : 'error')
}

export async function publishNow(f: FormData) {
  await requireAdmin()
  const id = postId(f)
  const now = new Date()
  const ready = await setStatus(id, ['draft', 'failed', 'blocked'], 'draft', { scheduledAt: now, attempts: 0, error: null })
  if (!ready) done('Cette publication ne peut pas être publiée (déjà publiée ou en cours).', 'error')
  const run = await publishDue(now, { onlyId: id })
  if (!run.ok) done(run.error, 'error')
  const r = run.posts[0]
  revalidateTag('instagram')
  if (r?.result === 'published') done('Publié sur Instagram.')
  done(r?.error ? `Échec : ${r.error}` : `Non publiée (${r?.result ?? 'rien à publier'}).`, 'error')
}

export async function prepareNow() {
  await requireAdmin()
  const r = await prepare(new Date())
  const written = r.posts.filter((p) => p.result === 'written').length
  const skipped = r.posts.filter((p) => p.result === 'skipped').length
  done(`Préparation terminée : ${written} brouillon(s) à jour, ${skipped} sans assez de sorties.`)
}

const EXCLUSION_KINDS: ExclusionKind[] = ['venue', 'source', 'event']

export async function addExclusionAction(f: FormData) {
  await requireAdmin()
  const kind = str(f, 'kind') as ExclusionKind
  const value = str(f, 'value')
  if (!EXCLUSION_KINDS.includes(kind) || !value || value.length > 200) done('Exclusion invalide.', 'error')
  await addExclusion(kind, value, str(f, 'reason') || null)
  done('Exclusion ajoutée : appliquée aux prochaines sélections et avant chaque publication.')
}

export async function removeExclusionAction(f: FormData) {
  await requireAdmin()
  const id = str(f, 'id')
  if (!UUID.test(id)) done('Exclusion introuvable.', 'error')
  await removeExclusion(id)
  done('Exclusion retirée.')
}

export async function saveCredentialsAction(f: FormData) {
  await requireAdmin()
  const token = str(f, 'token')
  let igUserId = str(f, 'ig_user_id')
  if (token.length < 20 || /\s/.test(token)) done('Jeton invalide : colle le jeton longue durée complet.', 'error')
  if (igUserId && !/^\d{5,30}$/.test(igUserId)) done('L’identifiant Instagram ne contient que des chiffres.', 'error')
  let me: { user_id?: string; username?: string }
  try {
    me = await new InstagramGraph({ token }).me()
  } catch (err) {
    done(`Instagram refuse ce jeton : ${err instanceof Error ? err.message : 'erreur inconnue'}`, 'error')
  }
  const username = me.username ?? null
  const apiId = me.user_id ? String(me.user_id) : null
  if (!igUserId && apiId) igUserId = apiId
  if (apiId && igUserId !== apiId) done(`Ce jeton correspond au compte ${apiId}, pas à ${igUserId}.`, 'error')
  if (!igUserId) done('Identifiant Instagram manquant.', 'error')
  // Expiry unknown for a pasted token: set at the first automatic renewal (60 days).
  await saveCredentials({ igUserId, username, accessToken: token, expiresAt: null })
  done(`Instagram connecté${username ? ` (@${username})` : ''}.`)
}

export async function disconnectAction() {
  await requireAdmin()
  await deleteCredentials()
  done('Instagram déconnecté : plus aucune publication ne partira.')
}
