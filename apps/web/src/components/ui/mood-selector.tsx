'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const MOODS = [
  { emoji: '🎵', label: 'Musique live', query: 'concert musique live ce soir' },
  { emoji: '🎨', label: 'Culture', query: 'expo art culture à voir' },
  { emoji: '😂', label: 'Rire', query: 'spectacle humour stand-up comédie' },
  { emoji: '🌙', label: 'Soirée', query: 'soirée sortie club bar dj' },
  { emoji: '👨‍👩‍👧', label: 'En famille', query: 'activité sortie enfants famille' },
  { emoji: '🆓', label: 'Gratuit', query: 'événement gratuit sortie free' },
  { emoji: '🌿', label: 'Plein air', query: 'sortie plein air parc jardin balade' },
  { emoji: '💑', label: 'En duo', query: 'sortie romantique couple date soirée' },
] as const

export function MoodSelector({ className }: { className?: string }) {
  const router = useRouter()

  return (
    <div className={cn('', className)}>
      <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-2.5">
        {MOODS.map((mood) => (
          <button
            key={mood.label}
            onClick={() =>
              router.push(`/evenements?q=${encodeURIComponent(mood.query)}&ai=1`)
            }
            className={cn(
              'group flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-surface px-3 py-3',
              'transition-all duration-200',
              'hover:shadow-md hover:-translate-y-0.5 hover:border-accent/30',
              'active:scale-95',
              'sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:rounded-xl'
            )}
          >
            <span className="text-xl transition-transform duration-200 group-hover:scale-110 sm:text-base">
              {mood.emoji}
            </span>
            <span className="text-[10px] font-semibold text-text-secondary group-hover:text-text-primary sm:text-[12px]">
              {mood.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
