import Link from 'next/link'
import { ArrowRight, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Entry point to the « Alertes concerts » (compte, Club, newsletter…).
 * Members go to « Mes artistes », visitors to the presentation page.
 */
export function AlertsPromoCard({
  member,
  title = 'Alertes concerts',
  text,
  className,
}: {
  member: boolean
  title?: string
  text?: string
  className?: string
}) {
  const href = member ? '/compte/artistes' : '/alertes-concerts'
  const body =
    text ??
    (member
      ? 'Tes artistes, tes alertes : nouvelles dates à Paris, ouverture des billetteries, rappel la veille.'
      : 'Suis tes artistes et sois prévenu dès qu’ils annoncent une date à Paris. Gratuit.')
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5 transition-colors hover:border-accent',
        className
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-paper">
        <BellRing className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-ink">{title}</span>
        <span className="block text-[14px] text-text-secondary">{body}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-[14px] font-semibold text-accent sm:inline-flex">
        {member ? 'Mes artistes' : 'Découvrir'}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-accent sm:hidden" aria-hidden />
    </Link>
  )
}
