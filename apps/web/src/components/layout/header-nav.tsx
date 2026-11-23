'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const MATCHES: Record<string, string[]> = {
  '/agenda': ['/agenda', '/categories', '/paris', '/gratuit', '/ce-week-end', '/lieux'],
}

export function HeaderNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
      {items.map((link) => {
        const prefixes = MATCHES[link.href] ?? [link.href]
        const active = prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              't-small relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 font-semibold transition-colors',
              active ? 'text-ink' : 'text-text-secondary hover:text-ink'
            )}
          >
            {link.label}
            {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
          </Link>
        )
      })}
    </nav>
  )
}
