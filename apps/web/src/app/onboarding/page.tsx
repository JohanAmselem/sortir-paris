'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { id: 'concerts', icon: '🎵', label: 'Concerts' },
  { id: 'expos', icon: '🎨', label: 'Expositions' },
  { id: 'theatre', icon: '🎭', label: 'Théâtre' },
  { id: 'cinema', icon: '🎬', label: 'Cinéma' },
  { id: 'festivals', icon: '🎪', label: 'Festivals' },
  { id: 'conferences', icon: '🎤', label: 'Conférences' },
  { id: 'danse', icon: '💃', label: 'Danse' },
  { id: 'ateliers', icon: '🛠️', label: 'Ateliers' },
]

const AMBIANCES = [
  { id: 'chill', emoji: '😌', label: 'Chill' },
  { id: 'festif', emoji: '🎉', label: 'Festif' },
  { id: 'intellectuel', emoji: '🧠', label: 'Intellectuel' },
  { id: 'romantique', emoji: '❤️', label: 'Romantique' },
  { id: 'en-famille', emoji: '👨‍👩‍👧', label: 'En famille' },
  { id: 'entre-amis', emoji: '👫', label: 'Entre amis' },
  { id: 'insolite', emoji: '🤯', label: 'Insolite' },
  { id: 'plein-air', emoji: '☀️', label: 'Plein air' },
]

const ZONES = [
  '1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e', '9e', '10e',
  '11e', '12e', '13e', '14e', '15e', '16e', '17e', '18e', '19e', '20e',
  'Boulogne', 'Montreuil', 'Saint-Denis', 'Vincennes',
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedAmbiances, setSelectedAmbiances] = useState<string[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
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

  const handleFinish = async () => {
    setLoading(true)
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: selectedCategories,
        ambiances: selectedAmbiances,
        zones: selectedZones,
      }),
    })
    router.push('/')
  }

  const steps = [
    // Step 1: Categories
    <div key="categories">
      <h1 className="text-2xl font-bold text-text-primary">
        Qu&apos;est-ce qui t&apos;intéresse ?
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Choisis au moins 2 catégories
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => toggle(selectedCategories, setSelectedCategories, cat.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4 transition-all',
              selectedCategories.includes(cat.id)
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface hover:border-border-strong'
            )}
          >
            <span className="text-2xl">{cat.icon}</span>
            <span className="text-sm font-medium">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>,

    // Step 2: Ambiances
    <div key="ambiances">
      <h1 className="text-2xl font-bold text-text-primary">
        Tu sors plutôt pour...
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Sélectionne tes ambiances préférées
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {AMBIANCES.map((amb) => (
          <button
            key={amb.id}
            onClick={() => toggle(selectedAmbiances, setSelectedAmbiances, amb.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4 transition-all',
              selectedAmbiances.includes(amb.id)
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface hover:border-border-strong'
            )}
          >
            <span className="text-2xl">{amb.emoji}</span>
            <span className="text-sm font-medium">{amb.label}</span>
          </button>
        ))}
      </div>
    </div>,

    // Step 3: Zones
    <div key="zones">
      <h1 className="text-2xl font-bold text-text-primary">
        Tes zones préférées
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Où aimes-tu sortir ?
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {ZONES.map((zone) => (
          <button
            key={zone}
            onClick={() => toggle(selectedZones, setSelectedZones, zone)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-all',
              selectedZones.includes(zone)
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface text-text-secondary hover:border-border-strong'
            )}
          >
            {zone}
          </button>
        ))}
      </div>
    </div>,
  ]

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      {/* Progress */}
      <div className="mb-8 flex gap-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-accent' : 'bg-border'
            )}
          />
        ))}
      </div>

      {/* Content */}
      {steps[step]}

      {/* Navigation */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 rounded-lg border border-border px-4 py-3 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Retour
          </button>
        )}
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            Suivant
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={loading}
            className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {loading ? 'Enregistrement...' : "C'est parti !"}
          </button>
        )}
      </div>

      {/* Skip */}
      {step === 0 && (
        <button
          onClick={() => router.push('/')}
          className="mt-4 w-full text-center text-sm text-text-muted hover:text-text-secondary"
        >
          Passer cette étape
        </button>
      )}
    </div>
  )
}
