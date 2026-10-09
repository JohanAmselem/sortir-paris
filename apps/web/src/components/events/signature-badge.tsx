import { Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Lieu phare": one of the big Paris cultural venues (lib/venues-signature.ts).
 * Factual, discreet. `compact` = icon only (cards), with the text for screen readers.
 */
export function SignatureBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <span className={cn('inline-flex shrink-0 items-center text-accent', className)} title="Lieu phare de Paris">
        <Landmark className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Lieu phare</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-accent/30 px-2 py-0.5 text-[12px] font-semibold text-accent',
        className
      )}
      title="Une des grandes scènes ou institutions culturelles de Paris"
    >
      <Landmark className="h-3 w-3" aria-hidden />
      Lieu phare
    </span>
  )
}
