'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NearMeButtonProps {
  className?: string
  basePath?: string
}

export function NearMeButton({ className, basePath = '/evenements' }: NearMeButtonProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const isActive = searchParams.has('lat') && searchParams.has('lng')

  const handleClick = () => {
    if (isActive) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('lat')
      params.delete('lng')
      router.push(`${basePath}?${params.toString()}`, { scroll: false })
      return
    }

    if (!navigator.geolocation) return

    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('lat', position.coords.latitude.toFixed(6))
        params.set('lng', position.coords.longitude.toFixed(6))
        router.push(`${basePath}?${params.toString()}`, { scroll: false })
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 5000 }
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all',
        isActive
          ? 'border-accent bg-accent text-white shadow-sm'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border-strong',
        loading && 'opacity-60',
        className
      )}
    >
      <Navigation className={cn('h-3.5 w-3.5', loading && 'animate-pulse')} />
      {loading ? 'Localisation...' : isActive ? 'Autour de moi ✓' : 'Autour de moi'}
    </button>
  )
}
