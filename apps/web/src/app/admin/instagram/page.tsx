import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/app/club/_lib/api'
import { isAdminEmail, maskToken } from '@/lib/instagram/admin'
import { listPosts, loadCredentials, loadExclusions, type PostRow } from '@/lib/instagram/data'
import { slidePath } from '@/lib/instagram/media-url'
import { themeLabel } from '@/lib/instagram/themes'
import { parisISODate } from '@/lib/paris-time'
import {
  addExclusionAction,
  blockPost,
  disconnectAction,
  prepareNow,
  publishNow,
  removeExclusionAction,
  saveCredentialsAction,
  unblockPost,
} from './actions'

export const dynamic = 'force-dynamic'
// « Publier maintenant » waits for Instagram (up to a few minutes for stories).
export const maxDuration = 300

export const metadata: Metadata = {
  title: 'Instagram (admin)',
  robots: { index: false, follow: false },
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fullDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Programmée', cls: 'bg-accent-soft text-accent' },
  blocked: { label: 'Bloquée', cls: 'bg-neon-soft text-neon' },
  publishing: { label: 'En cours', cls: 'bg-paper-deep text-ink' },
  published: { label: 'Publiée', cls: 'bg-paper-deep text-free' },
  failed: { label: 'Échec', cls: 'bg-neon-soft text-error' },
  skipped: { label: 'Annulée', cls: 'bg-paper-deep text-text-muted' },
}

const btn = 'inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-semibold transition-colors'
const btnPrimary = `${btn} bg-ink text-paper hover:bg-primary-hover`
const btnGhost = `${btn} border border-border-strong text-ink hover:bg-surface-hover`
const input = 'min-h-[44px] w-full rounded-xl border border-border-strong bg-surface px-3 text-[15px] text-ink'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InstagramAdminPage({ searchParams }: Props) {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/admin/instagram')}`)
  if (!user.email_confirmed_at || !isAdminEmail(user.email)) notFound()

  const sp = await searchParams
  const msg = typeof sp.msg === 'string' ? sp.msg : null
  const err = typeof sp.err === 'string' ? sp.err : null
  const today = parisISODate(new Date())

  let loadError = false
  const [creds, upcoming, recent, exclusions] = await Promise.all([
    loadCredentials(),
    listPosts({ fromDate: today, statuses: ['draft', 'blocked', 'failed', 'publishing'], limit: 40, order: 'asc' }),
    listPosts({ statuses: ['published', 'failed', 'skipped'], limit: 30, order: 'desc' }),
    loadExclusions(),
  ]).catch((e) => {
    console.error('[admin/instagram] load failed', e)
    loadError = true
    return [null, [], [], []] as const
  })

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-8">
      <h1 className="font-display text-[2.6rem] text-ink">Instagram</h1>
      <p className="mt-1 text-[14px] text-text-secondary">
        Publication automatique : carrousel « Demain à Paris » et stories par thème chaque jour à 18h, « Ta semaine » le lundi à 8h, « Ton week-end » le jeudi à 12h. Les brouillons sont préparés la veille vers 15h.
      </p>

      {msg && <p className="mt-6 rounded-xl bg-accent-soft px-4 py-3 text-[14px] text-ink" role="status">{msg}</p>}
      {err && <p className="mt-6 rounded-xl bg-neon-soft px-4 py-3 text-[14px] text-error" role="alert">{err}</p>}
      {loadError && <p className="mt-6 rounded-xl bg-neon-soft px-4 py-3 text-[14px] text-error">Base de données indisponible, réessaie dans un instant.</p>}

      <Connection creds={creds} />

      <section aria-labelledby="upcoming" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upcoming" className="font-display text-[2rem] text-ink">À venir</h2>
          <form action={prepareNow}>
            <button className={btnGhost}>Préparer maintenant</button>
          </form>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-[14px] text-text-secondary">Aucun brouillon. Ils sont préparés chaque jour vers 15h pour le lendemain.</p>
        ) : (
          <ul className="mt-4 space-y-6">
            {upcoming.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent" className="mt-12">
        <h2 id="recent" className="font-display text-[2rem] text-ink">Récentes</h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          Pour retirer une publication (demande d’un lieu, d’un photographe) : ajoute une exclusion ci-dessous, puis supprime la publication dans l’app Instagram. L’API Instagram (connexion Instagram) ne permet pas de supprimer une publication.
        </p>
        {recent.length === 0 ? (
          <p className="mt-4 text-[14px] text-text-secondary">Rien de publié pour l’instant.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14px]">
                <StatusPill status={p.status} />
                <span className="font-semibold text-ink">{themeLabel(p.kind, p.theme)}</span>
                <span className="text-text-secondary">{dateTime.format(p.publishedAt ?? p.scheduledAt)}</span>
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    Voir sur Instagram
                  </a>
                )}
                {p.error && <span className="w-full text-[13px] text-error">{p.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exclusions" className="mt-12">
        <h2 id="exclusions" className="font-display text-[2rem] text-ink">Exclusions</h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          Un lieu (id ou slug), une source (ex. openagenda) ou un événement (id ou slug) exclu n’apparaît plus dans aucune sélection, et il est retiré d’un brouillon au moment de publier.
        </p>
        <form action={addExclusionAction} className="mt-4 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[140px_1fr_1fr_auto]">
          <label className="sr-only" htmlFor="ex-kind">Type</label>
          <select id="ex-kind" name="kind" className={input} defaultValue="venue">
            <option value="venue">Lieu</option>
            <option value="source">Source</option>
            <option value="event">Événement</option>
          </select>
          <label className="sr-only" htmlFor="ex-value">Valeur</label>
          <input id="ex-value" name="value" required maxLength={200} placeholder="slug, id ou nom de source" className={input} />
          <label className="sr-only" htmlFor="ex-reason">Raison</label>
          <input id="ex-reason" name="reason" maxLength={300} placeholder="Raison (facultatif)" className={input} />
          <button className={btnPrimary}>Exclure</button>
        </form>
        {exclusions.length > 0 && (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {exclusions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px]">
                <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[12px] font-semibold text-ink">{x.kind === 'venue' ? 'Lieu' : x.kind === 'source' ? 'Source' : 'Événement'}</span>
                <code className="break-all text-ink">{x.value}</code>
                {x.reason && <span className="text-text-secondary">{x.reason}</span>}
                <form action={removeExclusionAction} className="ml-auto">
                  <input type="hidden" name="id" value={x.id} />
                  <button className="text-[13px] text-error underline">Retirer</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: 'bg-paper-deep text-ink' }
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${s.cls}`}>{s.label}</span>
}

function Connection({ creds }: { creds: Awaited<ReturnType<typeof loadCredentials>> }) {
  return (
    <section aria-labelledby="connection" className="mt-10 rounded-2xl border border-border bg-surface p-5">
      <h2 id="connection" className="text-[18px] font-semibold text-ink">Compte Instagram</h2>
      {creds ? (
        <div className="mt-2 space-y-1 text-[14px] text-text-secondary">
          <p>
            Connecté : <span className="font-semibold text-ink">{creds.username ? `@${creds.username}` : creds.igUserId}</span> (id {creds.igUserId}) · jeton {maskToken(creds.accessToken)}
          </p>
          <p>
            Expiration du jeton :{' '}
            {creds.expiresAt ? fullDate.format(creds.expiresAt) : 'inconnue jusqu’au premier renouvellement automatique (jeton de 60 jours)'}
            {' '}· mis à jour le {fullDate.format(creds.updatedAt)}
          </p>
          <form action={disconnectAction} className="pt-2">
            <button className="text-[13px] text-error underline">Déconnecter</button>
          </form>
        </div>
      ) : (
        <p className="mt-2 text-[14px] text-error">Instagram non connecté : aucune publication ne part.</p>
      )}
      <details className="mt-4" open={!creds}>
        <summary className="cursor-pointer text-[14px] font-semibold text-accent">{creds ? 'Remplacer le jeton' : 'Connecter Instagram'}</summary>
        <form action={saveCredentialsAction} className="mt-3 grid gap-3">
          <label className="text-[13px] text-text-secondary" htmlFor="ig-user">
            Identifiant du compte Instagram (user_id, facultatif : lu depuis le jeton)
          </label>
          <input id="ig-user" name="ig_user_id" inputMode="numeric" autoComplete="off" className={input} />
          <label className="text-[13px] text-text-secondary" htmlFor="ig-token">
            Jeton d’accès longue durée (jamais réaffiché)
          </label>
          <input id="ig-token" name="token" type="password" required autoComplete="off" className={input} />
          <div>
            <button className={btnPrimary}>Enregistrer</button>
          </div>
          <p className="text-[12px] text-text-muted">Marche à suivre : apps/web/docs/INSTAGRAM.md.</p>
        </form>
      </details>
    </section>
  )
}

function PostCard({ post }: { post: PostRow }) {
  const events = post.items.filter((i) => i.type === 'event')
  const canBlock = post.status === 'draft' || post.status === 'failed'
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={post.status} />
        <span className="text-[16px] font-semibold text-ink">{themeLabel(post.kind, post.theme)}</span>
        <span className="text-[14px] text-text-secondary">{dateTime.format(post.scheduledAt)}</span>
        <span className="text-[13px] text-text-muted">
          {events.length} sorties · {events.filter((e) => e.image_ok).length} photos
          {post.attempts > 0 && ` · ${post.attempts} essai(s)`}
        </span>
      </div>
      {post.error && <p className="mt-2 text-[13px] text-error">{post.error}</p>}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {post.items.map((it, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={slidePath(post.id, i, it)}
            alt={it.title}
            loading="lazy"
            width={post.kind === 'story' ? 108 : 144}
            height={post.kind === 'story' ? 192 : 180}
            className="shrink-0 rounded-lg border border-border bg-paper-deep"
          />
        ))}
      </div>

      {post.caption ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[14px] font-semibold text-accent">Légende ({post.caption.length} caractères)</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-paper-deep p-3 font-sans text-[13px] text-ink">{post.caption}</pre>
        </details>
      ) : (
        <p className="mt-2 text-[13px] text-text-muted">Stories : pas de légende (non prise en charge par Instagram).</p>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[14px] font-semibold text-accent">Sorties et exclusions</summary>
        <ul className="mt-2 space-y-2 text-[13px]">
          {events.map((e) => (
            <li key={e.event_id} className="flex flex-wrap items-center gap-2">
              <a href={`/evenements/${e.slug}`} className="font-semibold text-ink underline" target="_blank" rel="noopener noreferrer">
                {e.title}
              </a>
              <span className="text-text-secondary">{e.subtitle} · {e.when}</span>
              {e.event_id && <ExcludeButton kind="event" value={e.event_id} label="Exclure la sortie" />}
              {e.venue_slug && <ExcludeButton kind="venue" value={e.venue_slug} label="Exclure le lieu" />}
              {e.source && <ExcludeButton kind="source" value={e.source} label={`Exclure ${e.source}`} />}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        {canBlock && (
          <form action={blockPost}>
            <input type="hidden" name="id" value={post.id} />
            <button className={btnGhost}>Bloquer</button>
          </form>
        )}
        {post.status === 'blocked' && (
          <form action={unblockPost}>
            <input type="hidden" name="id" value={post.id} />
            <button className={btnGhost}>Débloquer</button>
          </form>
        )}
        {post.status !== 'publishing' && (
          <form action={publishNow}>
            <input type="hidden" name="id" value={post.id} />
            <button className={btnPrimary}>Publier maintenant</button>
          </form>
        )}
      </div>
    </li>
  )
}

function ExcludeButton({ kind, value, label }: { kind: string; value: string; label: string }) {
  return (
    <form action={addExclusionAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="reason" value="Depuis l’aperçu Instagram" />
      <button className="rounded-full border border-border-strong px-2 py-0.5 text-[12px] text-text-secondary hover:bg-surface-hover">{label}</button>
    </form>
  )
}
