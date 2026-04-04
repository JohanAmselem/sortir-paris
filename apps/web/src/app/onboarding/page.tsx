'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react'

const CATEGORIES = [
  { id: 'concerts', icon: '🎵', label: 'Concerts', desc: 'Rock, jazz, classique, rap...' },
  { id: 'expos', icon: '🎨', label: 'Expos', desc: 'Art contemporain, photo, design...' },
  { id: 'theatre', icon: '🎭', label: 'Théâtre', desc: 'Comédie, drame, one-man show...' },
  { id: 'cinema', icon: '🎬', label: 'Cinéma', desc: 'Avant-premières, ciné plein air...' },
  { id: 'festivals', icon: '🎪', label: 'Festivals', desc: 'Musique, street art, food...' },
  { id: 'conferences', icon: '🎤', label: 'Conférences', desc: 'Talks, débats, rencontres...' },
  { id: 'danse', icon: '💃', label: 'Danse', desc: 'Contemporain, hip-hop, ballet...' },
  { id: 'ateliers', icon: '🛠️', label: 'Ateliers', desc: 'DIY, cuisine, art, céramique...' },
  { id: 'visites', icon: '🏛️', label: 'Visites', desc: 'Musées, patrimoine, street art...' },
]

const AMBIANCES = [
  { id: 'chill', emoji: '😌', label: 'Chill', desc: 'Posé, tranquille' },
  { id: 'festif', emoji: '🎉', label: 'Festif', desc: 'On fait la fête !' },
  { id: 'intellectuel', emoji: '🧠', label: 'Intellectuel', desc: 'Culture, réflexion' },
  { id: 'romantique', emoji: '❤️', label: 'Romantique', desc: 'Sortie en duo' },
  { id: 'en-famille', emoji: '👨‍👩‍👧', label: 'En famille', desc: 'Avec les kids' },
  { id: 'entre-amis', emoji: '👫', label: 'Entre amis', desc: 'Soirée entre potes' },
  { id: 'insolite', emoji: '🤯', label: 'Insolite', desc: 'Surprenant, original' },
  { id: 'plein-air', emoji: '☀️', label: 'Plein air', desc: 'Parks, terrasses' },
]

const ZONES = [
  { id: '1er-4e', label: 'Centre (1er–4e)', desc: 'Marais, Châtelet, Louvre' },
  { id: '5e-6e', label: 'Rive Gauche (5e–6e)', desc: 'Latin, Saint-Germain' },
  { id: '7e-8e', label: 'Ouest chic (7e–8e)', desc: 'Champs-Élysées, Invalides' },
  { id: '9e-10e', label: 'Nord vibrant (9e–10e)', desc: 'Pigalle, Canal Saint-Martin' },
  { id: '11e-12e', label: 'Est festif (11e–12e)', desc: 'Bastille, Oberkampf, Nation' },
  { id: '13e-14e', label: 'Sud créatif (13e–14e)', desc: 'Butte-aux-Cailles, Montparnasse' },
  { id: '15e-16e', label: 'Ouest résidentiel (15e–16e)', desc: 'Auteuil, Beaugrenelle' },
  { id: '17e-18e', label: 'Montmartre & Batignolles (17e–18e)', desc: 'Sacré-Cœur, Épinettes' },
  { id: '19e-20e', label: 'Est populaire (19e–20e)', desc: 'Belleville, Villette, Ménilmontant' },
  { id: 'banlieue', label: 'Petite couronne', desc: 'Montreuil, Saint-Denis, Vincennes...' },
]

const BUDGET_OPTIONS = [
  { id: 'free', emoji: '🆓', label: 'Gratuit surtout', desc: 'Je préfère les bons plans gratuits' },
  { id: 'cheap', emoji: '💰', label: 'Petit budget', desc: 'Moins de 15€ idéalement' },
  { id: 'any', emoji: '💳', label: 'Pas de limite', desc: 'Le prix n\'est pas un critère' },
]

const TOTAL_STEPS = 4

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedAmbiances, setSelectedAmbiances] = useState<string[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [budget, setBudget] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) => {
    setList(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    )
  }

  const canProceed = () => {
    if (step === 0) return selectedCategories.length >= 2
    if (step === 1) return selectedAmbiances.length >= 1
    if (step === 2) return selectedZones.length >= 1
    if (step === 3) return budget !== null
    return true
  }

  const handleFinish = async () => {
    setLoading(true)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: selectedCategories,
          ambiances: selectedAmbiances,
          zones: selectedZones,
          prefFree: budget === 'free',
        }),
      })
      // Mark user as onboarded
      await fetch('/api/auth/onboarded', { method: 'POST' })
      router.push('/')
    } catch {
      router.push('/')
    }
  }

  const STEP_TITLES = [
    { title: "Qu'est-ce qui te branche ?", subtitle: 'Choisis au moins 2 catégories', emoji: '🎯' },
    { title: 'Tu sors plutôt pour...', subtitle: 'Sélectionne tes vibes préférées', emoji: '✨' },
    { title: 'Tes quartiers de prédilection', subtitle: 'Où aimes-tu traîner ?', emoji: '📍' },
    { title: 'Question budget', subtitle: 'On adapte les recommandations', emoji: '💸' },
  ]

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <span className="text-sm font-bold text-text-primary">
            <span className="text-primary">PANAME</span>{' '}
            <span className="text-accent">CLUB</span>
          </span>
          <span className="text-xs font-medium text-text-muted">
            {step + 1}/{TOTAL_STEPS}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Progress bar */}
        <div className="mb-8 flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all duration-500',
                i < step
                  ? 'bg-accent'
                  : i === step
                    ? 'bg-accent/60'
                    : 'bg-border'
              )}
            />
          ))}
        </div>

        {/* Step header */}
        <div className="mb-6">
          <span className="text-3xl">{STEP_TITLES[step].emoji}</span>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">
            {STEP_TITLES[step].title}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {STEP_TITLES[step].subtitle}
          </p>
        </div>

        {/* Step 1: Categories */}
        {step === 0 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => toggle(selectedCategories, setSelectedCategories, cat.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200',
                    selected
                      ? 'border-accent bg-accent/5 shadow-md shadow-accent/10'
                      : 'border-border bg-surface hover:border-accent/30 hover:shadow-sm'
                  )}
                >
                  <span className="text-3xl">{cat.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{cat.label}</p>
                    <p className="text-[11px] text-text-muted">{cat.desc}</p>
                  </div>
                  {selected && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 2: Ambiances */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {AMBIANCES.map((amb) => {
              const selected = selectedAmbiances.includes(amb.id)
              return (
                <button
                  key={amb.id}
                  onClick={() => toggle(selectedAmbiances, setSelectedAmbiances, amb.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200',
                    selected
                      ? 'border-accent bg-accent/5 shadow-md shadow-accent/10'
                      : 'border-border bg-surface hover:border-accent/30 hover:shadow-sm'
                  )}
                >
                  <span className="text-3xl">{amb.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{amb.label}</p>
                    <p className="text-[11px] text-text-muted">{amb.desc}</p>
                  </div>
                  {selected && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 3: Zones */}
        {step === 2 && (
          <div className="space-y-2.5">
            {ZONES.map((zone) => {
              const selected = selectedZones.includes(zone.id)
              return (
                <button
                  key={zone.id}
                  onClick={() => toggle(selectedZones, setSelectedZones, zone.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200',
                    selected
                      ? 'border-accent bg-accent/5 shadow-md shadow-accent/10'
                      : 'border-border bg-surface hover:border-accent/30 hover:shadow-sm'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{zone.label}</p>
                    <p className="text-[11px] text-text-muted">{zone.desc}</p>
                  </div>
                  {selected && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 4: Budget */}
        {step === 3 && (
          <div className="space-y-3">
            {BUDGET_OPTIONS.map((opt) => {
              const selected = budget === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setBudget(opt.id)}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-all duration-200',
                    selected
                      ? 'border-accent bg-accent/5 shadow-md shadow-accent/10'
                      : 'border-border bg-surface hover:border-accent/30 hover:shadow-sm'
                  )}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text-primary">{opt.label}</p>
                    <p className="text-xs text-text-muted">{opt.desc}</p>
                  </div>
                  {selected && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>
          )}
          <button
            onClick={() => {
              if (step < TOTAL_STEPS - 1) {
                setStep(step + 1)
              } else {
                handleFinish()
              }
            }}
            disabled={!canProceed() || loading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition-all',
              canProceed()
                ? step === TOTAL_STEPS - 1
                  ? 'bg-accent text-white shadow-lg shadow-accent/25 hover:shadow-xl hover:bg-accent/90 active:scale-[0.98]'
                  : 'bg-primary text-white shadow-md hover:bg-primary/90 active:scale-[0.98]'
                : 'bg-border text-text-muted cursor-not-allowed'
            )}
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : step === TOTAL_STEPS - 1 ? (
              <>
                <Sparkles className="h-4 w-4" />
                C&apos;est parti !
              </>
            ) : (
              <>
                Suivant
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {/* Skip */}
        <button
          onClick={() => router.push('/')}
          className="mt-4 w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Passer et explorer directement
        </button>

        {/* Selection count hint */}
        {step === 0 && selectedCategories.length > 0 && selectedCategories.length < 2 && (
          <p className="mt-3 text-center text-xs text-accent">
            Encore {2 - selectedCategories.length} catégorie{(2 - selectedCategories.length) > 1 ? 's' : ''} minimum
          </p>
        )}
      </div>
    </div>
  )
}
