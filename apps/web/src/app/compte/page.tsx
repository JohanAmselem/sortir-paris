'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'
import {
  Bookmark,
  Settings,
  LogOut,
  ChevronRight,
  User,
  Sparkles,
  Heart,
  Dna,
  Gift,
  Zap,
  Trophy,
  Target,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function ComptePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
          <User className="h-10 w-10 text-accent" />
        </div>
        <h1 className="mt-6 text-xl font-bold text-text-primary">
          Rejoins Paname Club
        </h1>
        <p className="mt-2 max-w-xs text-sm text-text-secondary">
          Crée ton compte pour sauvegarder tes événements, recevoir des recommandations personnalisées et ne rien rater.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent/90 transition-all active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" />
          Se connecter / Créer un compte
        </Link>
      </div>
    )
  }

  // Logged in
  const avatarUrl =
    user.user_metadata?.avatar_url || user.user_metadata?.picture
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0]

  const MENU_ITEMS = [
    {
      href: '/compte/adn',
      icon: Dna,
      label: 'Mon ADN Paname',
      desc: 'Profil culturel, badges, XP',
      color: 'text-accent',
    },
    {
      href: '/compte/sauvegardes',
      icon: Bookmark,
      label: 'Mes favoris',
      desc: 'Événements sauvegardés',
      color: 'text-blue-500',
    },
    {
      href: '/drop',
      icon: Gift,
      label: 'Mon Drop hebdo',
      desc: '5 sorties choisies pour toi',
      color: 'text-neon',
    },
    {
      href: '/match',
      icon: Heart,
      label: 'Match Culturel',
      desc: 'Swipe et découvre',
      color: 'text-pink-500',
    },
    {
      href: '/quiz',
      icon: Target,
      label: 'Quiz — Tu préfères',
      desc: 'Découvre ton profil culturel',
      color: 'text-orange-500',
    },
    {
      href: '/onboarding',
      icon: Sparkles,
      label: 'Mes goûts',
      desc: 'Modifier mes préférences',
      color: 'text-amber-500',
    },
    {
      href: '/compte/parametres',
      icon: Settings,
      label: 'Paramètres',
      desc: 'Notifications, email',
      color: 'text-text-muted',
    },
  ]

  return (
    <div className="px-4 py-8">
      {/* Profile card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <User className="h-7 w-7 text-accent" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-text-primary">{displayName}</h1>
            <p className="text-sm text-text-muted">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="mt-6 space-y-2">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-md hover:border-accent/20"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-hover">
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">{item.label}</p>
              <p className="text-xs text-text-muted">{item.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-text-muted" />
          </Link>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100"
      >
        <LogOut className="h-4 w-4" />
        Se déconnecter
      </button>
    </div>
  )
}
