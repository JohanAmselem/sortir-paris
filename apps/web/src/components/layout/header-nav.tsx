'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function HeaderNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Navigation principale" className="hidden items-center gap-0.5 md:flex">
      {items.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative rounded-md px-3 py-2 text-[14px] font-medium transition-colors',
              active ? 'text-ink' : 'text-text-secondary hover:text-ink'
            )}
          >
            {link.label}
            {active && <span aria-hidden className="absolute inset-x-3 -bottom-[9px] h-[2px] bg-accent" />}
          </Link>
        )
      })}
    </nav>
  )
}
