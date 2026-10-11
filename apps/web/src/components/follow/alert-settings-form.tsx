'use client'

import { useEffect, useState } from 'react'
import { BellRing, Loader2 } from 'lucide-react'
import type { AlertSettingsValue } from '@/lib/alerts'
import { cn } from '@/lib/utils'

type Key = keyof AlertSettingsValue

const toLogin = () => {
  window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type DeviceState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

/** Alert channels (e-mail, push) and moments (new date, ticket opening, reminder). */
export function AlertSettingsForm({
  initial,
  vapidPublicKey,
  emailAvailable,
}: {
  initial: AlertSettingsValue
  vapidPublicKey: string | null
  emailAvailable: boolean
}) {
  const [settings, setSettings] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceState>('checking')
  const [deviceBusy, setDeviceBusy] = useState(false)

  useEffect(() => {
    if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setDevice('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setDevice('denied')
      return
    }
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => setDevice(sub ? 'on' : 'off'))
      .catch(() => setDevice('off'))
  }, [vapidPublicKey])

  const save = async (patch: Partial<AlertSettingsValue>) => {
    const before = settings
    setSettings({ ...settings, ...patch })
    setError(null)
    try {
      const res = await fetch('/api/alerts/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.status === 401) return toLogin()
      const data = (await res.json().catch(() => ({}))) as { settings?: AlertSettingsValue; error?: string }
      if (!res.ok || !data.settings) throw new Error(data.error ?? String(res.status))
      setSettings(data.settings)
    } catch {
      setSettings(before)
      setError('Réglage non enregistré, réessaie.')
    }
  }

  const enableDevice = async () => {
    if (!vapidPublicKey) return
    setDeviceBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setDevice(permission === 'denied' ? 'denied' : 'off')
        return
      }
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (res.status === 401) return toLogin()
      if (!res.ok) throw new Error(String(res.status))
      setDevice('on')
      setSettings((s) => ({ ...s, pushEnabled: true }))
    } catch {
      setError('Impossible d’activer les notifications sur cet appareil, réessaie.')
    } finally {
      setDeviceBusy(false)
    }
  }

  const disableDevice = async () => {
    setDeviceBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setDevice('off')
    } catch {
      setError('Impossible de couper les notifications sur cet appareil, réessaie.')
    } finally {
      setDeviceBusy(false)
    }
  }

  const toggle = (key: Key, label: string, desc: string, disabled = false) => (
    <li className="flex min-h-[60px] items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className="block text-[13px] text-text-secondary">{desc}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={settings[key]}
        aria-label={label}
        disabled={disabled}
        onClick={() => save({ [key]: !settings[key] })}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          settings[key] ? 'bg-accent' : 'bg-border-strong'
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-paper shadow transition-transform', settings[key] ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </li>
  )

  return (
    <div>
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Comment</h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {toggle(
          'emailEnabled',
          'Par e-mail',
          emailAvailable ? 'Un seul e-mail qui regroupe tout, jamais deux fois la même alerte.' : 'Les e-mails d’alerte arrivent très bientôt.'
        )}
        {toggle('pushEnabled', 'Notifications', 'Sur les appareils où tu les as activées.', !vapidPublicKey)}
      </ul>

      <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3">
        {device === 'checking' ? (
          <div className="h-10" aria-hidden />
        ) : device === 'unsupported' ? (
          <p className="text-[13px] text-text-secondary">
            {vapidPublicKey
              ? 'Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d’abord Paname Club à l’écran d’accueil (Partager → Sur l’écran d’accueil), puis ouvre-le depuis là.'
              : 'Les notifications arrivent très bientôt.'}
          </p>
        ) : device === 'denied' ? (
          <p className="text-[13px] text-text-secondary">
            Les notifications sont bloquées pour ce site dans ton navigateur. Autorise-les dans ses réglages, puis recharge la page.
          </p>
        ) : device === 'on' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-accent">
              <BellRing className="h-4 w-4" aria-hidden />
              Notifications activées sur cet appareil
            </p>
            <button
              type="button"
              onClick={disableDevice}
              disabled={deviceBusy}
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover hover:text-ink"
            >
              {deviceBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Couper sur cet appareil
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={enableDevice}
            disabled={deviceBusy}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
          >
            {deviceBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
            Activer les notifications sur cet appareil
          </button>
        )}
      </div>

      <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Quand</h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {toggle('notifyNewDate', 'Nouvelle date', 'Un artiste que tu suis annonce un concert à Paris.')}
        {toggle('notifyOnSale', 'Ouverture de la billetterie', 'Le jour où les places sont mises en vente.')}
        {toggle('notifyReminder', 'Rappel la veille', 'La veille d’une sortie où tu as dit « J’y vais ».')}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-error">
          {error}
        </p>
      )}
    </div>
  )
}
