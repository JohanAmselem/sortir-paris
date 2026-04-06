'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Dna, Star, Bookmark, MessageSquare, Users, Zap,
  Trophy, Share2, ArrowRight, Loader2, Sparkles, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdnCategory {
  category: string
  slug: string
  icon: string | null
  count: number
  percentage: number
}

interface Badge {
  slug: string
  name: string
  emoji: string
  desc: string
}

interface ProfileData {
  adn: AdnCategory[]
  stats: { saves: number; reviews: number; attendances: number; swipes: number; totalInteractions: number }
  xp: number
  level: { level: number; name: string; emoji: string; color: string; minXp: number }
  nextLevel: { level: number; name: string; emoji: string; minXp: number } | null
  xpProgress: number
  xpInLevel: number
  xpNeeded: number
  badges: Badge[]
  userName: string
  avatarUrl: string | null
  memberSince: string
}

// Pastel colors for the radar chart
const CHART_COLORS = [
  '#7C3AED', '#F59E0B', '#EF4444', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#F43F5E', '#6366F1', '#14B8A6',
]

export default function AdnPage() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<boolean | null>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(!!data.user))
  }, [supabase])

  useEffect(() => {
    if (user === false) { setLoading(false); return }
    if (user === null) return

    fetch('/api/profile/adn')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [user])

  const handleShare = async () => {
    if (!data) return
    const text = `Mon ADN Paname : ${data.adn.slice(0, 3).map(a => `${a.icon ?? '🎭'} ${a.category} ${a.percentage}%`).join(', ')} — Niveau ${data.level.emoji} ${data.level.name} (${data.xp} XP)`
    try {
      await navigator.share({ title: 'Mon ADN Paname', text, url: 'https://www.panameclub.fr/match' })
    } catch {
      await navigator.clipboard.writeText(text)
    }
  }

  if (user === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <Dna className="h-12 w-12 text-accent" />
        <h1 className="mt-4 text-xl font-bold text-text-primary">Ton ADN Paname</h1>
        <p className="mt-2 text-[14px] text-text-secondary">Connecte-toi pour découvrir ton profil culturel</p>
        <Link href="/login?next=/compte/adn" className="mt-6 rounded-xl bg-accent px-8 py-3 text-[14px] font-bold text-white">
          Se connecter
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (!data) return null

  const hasAdn = data.adn.length > 0

  return (
    <div className="px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/compte" className="text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors">
          ← Profil
        </Link>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/20 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" />
          Partager
        </button>
      </div>

      {/* Profile card with level */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-surface overflow-hidden">
        <div className="relative bg-gradient-to-br from-accent/10 via-bg to-neon/5 p-6 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.1),transparent_60%)]" />
          <div className="relative">
            {data.avatarUrl ? (
              <Image src={data.avatarUrl} alt="" width={72} height={72} className="mx-auto rounded-full border-4 border-surface shadow-lg" />
            ) : (
              <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-surface bg-accent/10 shadow-lg">
                <span className="text-2xl">{data.level.emoji}</span>
              </div>
            )}
            <h1 className="mt-3 text-lg font-bold text-text-primary">{data.userName}</h1>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 shadow-sm">
              <span className="text-sm">{data.level.emoji}</span>
              <span className={cn('text-[12px] font-bold', data.level.color)}>{data.level.name}</span>
              <span className="text-[11px] text-text-muted">· Niv. {data.level.level}</span>
            </div>
          </div>
        </div>

        {/* XP bar */}
        <div className="px-5 py-4 border-t border-border/40">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-text-primary flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-accent" />
              {data.xp} XP
            </span>
            {data.nextLevel && (
              <span className="text-text-muted">
                {data.nextLevel.emoji} {data.nextLevel.name} dans {data.xpNeeded - data.xpInLevel} XP
              </span>
            )}
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-neon transition-all duration-700"
              style={{ width: `${data.xpProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ADN Chart */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
          <Dna className="h-4 w-4 text-accent" />
          Ton ADN Culturel
        </h2>

        {hasAdn ? (
          <div className="mt-4 rounded-2xl border border-border/60 bg-surface p-4">
            {/* Bar chart */}
            <div className="space-y-2.5">
              {data.adn.map((cat, i) => (
                <div key={cat.slug} className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-lg">{cat.icon ?? '🎭'}</span>
                  <span className="w-20 text-[12px] font-medium text-text-primary truncate">{cat.category}</span>
                  <div className="flex-1 h-5 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max(cat.percentage, 8)}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    >
                      {cat.percentage >= 15 && (
                        <span className="text-[10px] font-bold text-white">{cat.percentage}%</span>
                      )}
                    </div>
                  </div>
                  {cat.percentage < 15 && (
                    <span className="text-[11px] font-bold text-text-muted w-8">{cat.percentage}%</span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 rounded-xl bg-accent/5 p-3 text-center">
              <p className="text-[13px] text-text-secondary">
                {data.adn[0] && (
                  <>
                    Tu es surtout <strong className="text-text-primary">{data.adn[0].icon} {data.adn[0].category}</strong>
                    {data.adn[1] && <> et <strong className="text-text-primary">{data.adn[1].icon} {data.adn[1].category}</strong></>}
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 py-10 text-center">
            <Target className="mx-auto h-8 w-8 text-text-muted/30" />
            <p className="mt-3 text-[13px] text-text-muted">Ton ADN se construit au fil de tes interactions</p>
            <p className="mt-1 text-[12px] text-text-muted/70">Sauvegarde, note et participe à des événements !</p>
            <Link
              href="/match"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[12px] font-bold text-white hover:bg-accent-hover transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Commencer le Match
            </Link>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
          <Star className="h-4 w-4 text-amber-500" />
          Tes stats
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { icon: MessageSquare, label: 'Avis', value: data.stats.reviews, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { icon: Bookmark, label: 'Sauvegardés', value: data.stats.saves, color: 'text-accent', bg: 'bg-accent/10' },
            { icon: Users, label: 'Participations', value: data.stats.attendances, color: 'text-free', bg: 'bg-free/10' },
            { icon: Sparkles, label: 'Swipes', value: data.stats.swipes, color: 'text-neon', bg: 'bg-neon/10' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface p-3">
              <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', stat.bg)}>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{stat.value}</p>
                <p className="text-[11px] text-text-muted">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Badges */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
          <Trophy className="h-4 w-4 text-amber-500" />
          Badges
        </h2>

        {data.badges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.badges.map((badge) => (
              <div
                key={badge.slug}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2"
                title={badge.desc}
              >
                <span className="text-lg">{badge.emoji}</span>
                <div>
                  <p className="text-[12px] font-semibold text-text-primary">{badge.name}</p>
                  <p className="text-[10px] text-text-muted">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-border/60 p-4 text-center">
            <p className="text-[12px] text-text-muted">Aucun badge pour le moment — continue d&apos;explorer !</p>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="mt-8 space-y-2">
        <Link
          href="/match"
          className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-accent/20 hover:bg-accent-hover transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Match Culturel
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/top"
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-[14px] font-semibold text-text-primary hover:border-accent/30 transition-all"
        >
          <Trophy className="h-4 w-4 text-amber-500" />
          Top événements
        </Link>
      </div>

      {/* Member since */}
      <p className="mt-6 text-center text-[11px] text-text-muted">
        Membre depuis {new Date(data.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}
