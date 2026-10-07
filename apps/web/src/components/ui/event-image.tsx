import Image from 'next/image'
import { cn } from '@/lib/utils'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'

/** Hosts optimised by next/image (see next.config.ts). Others are served as-is. */
const OPTIMIZED_HOSTS = [/(^|\.)paris\.fr$/, /(^|\.)openagenda\.com$/, /(^|\.)evbuc\.com$/, /(^|\.)acsta\.net$/, /(^|\.)tmdb\.org$/]

function isOptimized(src: string): boolean {
  try {
    const host = new URL(src).hostname
    return OPTIMIZED_HOSTS.some((re) => re.test(host))
  } catch {
    return false
  }
}

interface EventImageProps {
  src: string | null
  alt: string
  sizes: string
  categorySlug?: string | null
  priority?: boolean
  className?: string
}

/** Event picture, or a typographic poster when the source has none. */
export function EventImage({ src, alt, sizes, categorySlug, priority, className }: EventImageProps) {
  if (!src) {
    const cat = categorySlug ? CATEGORY_BY_SLUG[categorySlug] : null
    return (
      <div
        className={cn('absolute inset-0 flex items-end bg-night p-3', className)}
        role="img"
        aria-label={alt}
      >
        <span className="font-display text-[2.2rem] uppercase leading-none text-paper/15">
          {cat?.plural ?? 'Paris'}
        </span>
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
      unoptimized={!isOptimized(src)}
      className={cn('object-cover', className)}
    />
  )
}
