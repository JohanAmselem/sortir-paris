'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { ARRONDISSEMENTS, CATEGORIES, INTENTS } from '@/lib/events/taxonomy'
import { cn } from '@/lib/utils'

export interface Preferences {
  categories: string[]
  ambiances: string[]
  zones: string[]
  prefFree: boolean
}

interface Props {
  initial: Preferences
  /** "onboarding": 3 skippable steps. "settings": everything on one page. */
  mode: 'onboarding' | 'settings'
  /** Called after a successful save (onboarding: redirect). */
  onDone?: () => void
  onSkip?: () => void
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors',
        selected ? 'border-accent bg-accent text-paper' : 'border-border-strong bg-surface text-ink hover:border-ink'
      )}
    >
      {selected && <Check className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  )
}

function CategoryStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="font-display text-[2rem] text-ink">Ce qui te fait sortir</legend>
      <p className="mt-1 text-[15px] text-text-secondary">Choisis autant que tu veux.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Chip key={c.slug} selected={value.includes(c.slug)} onClick={() => onChange(toggle(value, c.slug))}>
            {c.plural}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function AmbianceStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="font-display text-[2rem] text-ink">Tes ambiances</legend>
      <p className="mt-1 text-[15px] text-text-secondary">Avec qui, et dans quel état d’esprit ?</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {INTENTS.map((i) => (
          <Chip key={i.slug} selected={value.includes(i.slug)} onClick={() => onChange(toggle(value, i.slug))}>
            {i.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function ZoneStep({
  zones,
  prefFree,
  onZones,
  onFree,
}: {
  zones: string[]
  prefFree: boolean
  onZones: (v: string[]) => void
  onFree: (v: boolean) => void
}) {
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="font-display text-[2rem] text-ink">Tes quartiers</legend>
        <p className="mt-1 text-[15px] text-text-secondary">Là où tu sors le plus souvent. Facultatif.</p>
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {ARRONDISSEMENTS.map((a) => {
            const selected = zones.includes(a)
            return (
              <button
                key={a}
                type="button"
                onClick={() => onZones(toggle(zones, a))}
                aria-pressed={selected}
                aria-label={`${a} arrondissement`}
                className={cn(
                  'flex h-11 items-center justify-center rounded-lg border text-[15px] font-semibold transition-colors',
                  selected ? 'border-accent bg-accent text-paper' : 'border-border bg-surface text-ink hover:border-ink'
                )}
              >
                {a}
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-display text-[2rem] text-ink">Ton budget</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip selected={!prefFree} onClick={() => onFree(false)}>
            Peu importe
          </Chip>
          <Chip selected={prefFree} onClick={() => onFree(true)}>
            Surtout gratuit
          </Chip>
        </div>
      </fieldset>
    </div>
  )
}

export function PreferencesForm({ initial, mode, onDone, onSkip }: Props) {
  const [prefs, setPrefs] = useState<Preferences>(initial)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prefs, onboarded: mode === 'onboarding' ? true : undefined }),
      })
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
        return
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        setError(d.error ?? 'Tes préférences n’ont pas pu être enregistrées. Réessaie.')
        return
      }
      setSaved(true)
      onDone?.()
    } catch {
      setError('Connexion perdue. Réessaie dans un instant.')
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    <CategoryStep key="c" value={prefs.categories} onChange={(categories) => setPrefs((p) => ({ ...p, categories }))} />,
    <AmbianceStep key="a" value={prefs.ambiances} onChange={(ambiances) => setPrefs((p) => ({ ...p, ambiances }))} />,
    <ZoneStep
      key="z"
      zones={prefs.zones}
      prefFree={prefs.prefFree}
      onZones={(zones) => setPrefs((p) => ({ ...p, zones }))}
      onFree={(prefFree) => setPrefs((p) => ({ ...p, prefFree }))}
    />,
  ]

  const feedback = (
    <p className="min-h-[1.5rem] text-[14px]" role={error ? 'alert' : 'status'}>
      {error && <span className="font-medium text-error">{error}</span>}
      {!error && saved && mode === 'settings' && <span className="font-medium text-free">Préférences enregistrées.</span>}
    </p>
  )

  if (mode === 'settings') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="space-y-10"
      >
        {steps}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Enregistrer
          </button>
          {feedback}
        </div>
      </form>
    )
  }

  const last = step === steps.length - 1
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] font-semibold text-text-muted">
        <span aria-live="polite">
          Étape {step + 1} sur {steps.length}
        </span>
        <button type="button" onClick={onSkip} className="inline-flex h-11 items-center px-2 hover:text-ink">
          Passer
        </button>
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-paper-deep')} />
        ))}
      </div>
      <div className="mt-8">{steps[step]}</div>
      <div className="mt-10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex h-12 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-text-secondary hover:text-ink disabled:invisible"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Retour
        </button>
        <button
          type="button"
          onClick={() => (last ? save() : setStep((s) => s + 1))}
          disabled={saving}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-paper disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {last ? 'C’est parti' : 'Suivant'}
          {!last && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <div className="mt-3 text-right">{feedback}</div>
    </div>
  )
}
