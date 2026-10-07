import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ href = '/compte', label = 'Mon compte' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-text-secondary hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  )
}
