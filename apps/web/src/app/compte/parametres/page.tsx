'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Bell, Mail, Shield, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function ParametresPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifEvents, setNotifEvents] = useState(true)
  const [notifWeekly, setNotifWeekly] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
        return
      }
      setUser(data.user)
      setLoading(false)
    })
  }, [supabase, router])

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Back */}
      <Link
        href="/compte"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au profil
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-text-primary">Paramètres</h1>

      {/* Notifications */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-text-primary">
          <Bell className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-bold">Notifications</h2>
        </div>
        <div className="mt-3 space-y-3">
          <label className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Événements sauvegardés</p>
              <p className="text-xs text-text-muted">Rappel avant le début d&apos;un événement</p>
            </div>
            <button
              onClick={() => setNotifEvents(!notifEvents)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                notifEvents ? 'bg-accent' : 'bg-border'
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                notifEvents ? 'left-[22px]' : 'left-0.5'
              )} />
            </button>
          </label>

          <label className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Digest hebdomadaire</p>
              <p className="text-xs text-text-muted">Les meilleurs événements de la semaine par email</p>
            </div>
            <button
              onClick={() => setNotifWeekly(!notifWeekly)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                notifWeekly ? 'bg-accent' : 'bg-border'
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                notifWeekly ? 'left-[22px]' : 'left-0.5'
              )} />
            </button>
          </label>
        </div>
      </section>

      {/* Account */}
      <section className="mt-8">
        <div className="flex items-center gap-2 text-text-primary">
          <Mail className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-bold">Compte</h2>
        </div>
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Email</p>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
      </section>

      {/* Privacy */}
      <section className="mt-8">
        <div className="flex items-center gap-2 text-text-primary">
          <Shield className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-bold">Confidentialité</h2>
        </div>
        <div className="mt-3 space-y-2">
          <Link
            href="/onboarding"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent/20 transition-all"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Modifier mes préférences</p>
              <p className="text-xs text-text-muted">Catégories, zones, ambiances, budget</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Save button */}
      <button
        onClick={handleSave}
        className={cn(
          'mt-8 w-full rounded-xl py-3.5 text-sm font-semibold transition-all',
          saved
            ? 'bg-free text-white'
            : 'bg-accent text-white hover:bg-accent/90 active:scale-[0.98]'
        )}
      >
        {saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>

      {/* Danger zone */}
      <section className="mt-10 rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          <h2 className="text-[15px] font-bold text-red-600">Zone dangereuse</h2>
        </div>
        <p className="mt-2 text-xs text-red-500/70">
          La suppression de ton compte est irréversible. Toutes tes données seront effacées.
        </p>
        <button className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
          Supprimer mon compte
        </button>
      </section>
    </div>
  )
}
