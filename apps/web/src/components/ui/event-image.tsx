'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { isOptimizedImage } from '@/lib/image-hosts'

interface EventImageProps {
  src: string | null
  alt: string
  sizes: string
  categorySlug?: string | null
  priority?: boolean
  className?: string
}

/**
 * Event picture, or a typographic poster when the source has none or when it
 * fails to load (hotlink protection, 403, dead link): never a broken image.
 */
export function EventImage({ src, alt, sizes, categorySlug, priority, className }: EventImageProps) {
  const [failed, setFailed] = useState<string | null>(null)

  if (!src || failed === src) {
    const cat = categorySlug ? CATEGORY_BY_SLUG[categorySlug] : null
    // Decorative when the title is already next to it (alt=""): hidden from screen readers.
    const a11y = alt ? { role: 'img' as const, 'aria-label': alt } : { 'aria-hidden': true as const }
    return (
      <div className={cn('absolute inset-0 flex items-end bg-night p-3', className)} {...a11y}>
        <span className="font-display text-[2.2rem] uppercase leading-none text-paper/35">{cat?.plural ?? 'Paris'}</span>
      </div>
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!isOptimizedImage(src)}
      onError={() => setFailed(src)}
      className={cn('object-cover', className)}
    />
  )
}
