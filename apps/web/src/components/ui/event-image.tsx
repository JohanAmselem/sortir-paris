'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_BY_SLUG } from '@/lib/events/taxonomy'
import { isOptimizedImage } from '@/lib/image-hosts'
import { hdImageUrl } from '@/lib/images'

interface EventImageProps {
  src: string | null
  alt: string
  sizes: string
  categorySlug?: string | null
  /** Titre écrit sur l'affiche de repli (sortie sans image). */
  title?: string
  /** Taille de l'affiche de repli : vignette, carte ou grande photo. */
  fallback?: 'sm' | 'md' | 'lg'
  /** Texte de l'affiche de repli en haut, quand un titre est déjà posé en bas de l'image. */
  fallbackTop?: boolean
  /** Repli sans texte (tuiles qui portent déjà leur libellé). */
  bare?: boolean
  priority?: boolean
  className?: string
}

/**
 * Photo de la sortie en grand format (hdImageUrl), ou une affiche typographique
 * quand la source n'en a pas ou qu'elle ne se charge pas : jamais d'image cassée,
 * jamais d'initiales.
 */
export function EventImage({ src, alt, sizes, categorySlug, title, fallback = 'md', fallbackTop = false, bare = false, priority, className }: EventImageProps) {
  const hd = hdImageUrl(src)
  const [failed, setFailed] = useState<string | null>(null)

  if (!hd || failed === hd) {
    const cat = categorySlug ? CATEGORY_BY_SLUG[categorySlug] : null
    // Décorative quand le titre est déjà à côté (alt="") : cachée aux lecteurs d'écran.
    const a11y = alt ? { role: 'img' as const, 'aria-label': alt } : { 'aria-hidden': true as const }
    return (
      <div
        className={cn(
          'absolute inset-0 flex flex-col overflow-hidden bg-linear-to-br from-accent-strong/45 via-night-soft to-paper',
          fallback === 'sm' ? 'p-2' : fallback === 'md' ? 'p-3' : 'p-5 md:p-8',
          fallbackTop ? (fallback === 'lg' ? 'justify-start pt-16 md:pt-8' : 'justify-start') : 'justify-end',
          className
        )}
        {...a11y}
      >
        {!bare && fallback !== 'sm' && title && <span className="t-micro text-accent-glow">{cat?.name ?? 'Paris'}</span>}
        {!bare && (
          <span
            className={cn(
              'break-words text-ink',
              fallback === 'sm' ? 't-micro line-clamp-3' : fallback === 'md' ? 't-title2 mt-1 line-clamp-3 uppercase' : 't-display mt-2 line-clamp-4 uppercase'
            )}
          >
            {title || cat?.plural || 'Paris'}
          </span>
        )}
      </div>
    )
  }
  return (
    <Image
      src={hd}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!isOptimizedImage(hd)}
      onError={() => setFailed(hd)}
      className={cn('object-cover', className)}
    />
  )
}
