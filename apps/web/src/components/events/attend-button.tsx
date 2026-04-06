'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import Image from 'next/image'
import { UserCheck, Users, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface AttendButtonProps {
  eventId: string
  className?: string
}

interface Attendee {
  name: string | null
  avatarUrl: string | null
}

export function AttendButton({ eventId, className }: AttendButtonProps) {
  const supabase = useMemo(() => createClient(), [])
  const [isAttending, setIsAttending] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [isPending, startTransition] = useTransition()
  const [loaded, setLoaded] = useState(false)
  const [hasUser, setHasUser] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasUser(!!data.user))
  }, [supabase])

  useEffect(() => {
    fetch(`/api/attendance?eventId=${eventId}`)
      .then(r => r.json())
      .then(data => {
        setAttendeeCount(data.count)
        setAttendees(data.attendees ?? [])
        setIsAttending(data.isAttending)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [eventId])

  const toggle = () => {
    startTransition(async () => {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })

      if (res.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
        return
      }

      const data = await res.json()
      setIsAttending(data.attending)
      setAttendeeCount(prev => data.attending ? prev + 1 : Math.max(0, prev - 1))
    })
  }

  if (!loaded) return null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        onClick={toggle}
        disabled={isPending}
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all active:scale-[0.97]',
          isAttending
            ? 'bg-accent/10 text-accent border-2 border-accent/30 hover:bg-accent/15'
            : 'bg-surface border-2 border-border hover:border-accent/30 text-text-primary hover:text-accent'
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isAttending ? (
          <UserCheck className="h-4 w-4" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        {isAttending ? 'J\'y vais !' : 'J\'y vais'}
      </button>

      {/* Attendee avatars + count */}
      {attendeeCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {attendees.slice(0, 4).map((a, i) => (
              a.avatarUrl ? (
                <Image
                  key={i}
                  src={a.avatarUrl}
                  alt=""
                  width={22}
                  height={22}
                  className="rounded-full border-2 border-surface"
                />
              ) : (
                <div key={i} className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface bg-accent/10">
                  <span className="text-[8px] font-bold text-accent">
                    {a.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              )
            ))}
          </div>
          <span className="text-[12px] text-text-muted">
            {attendeeCount} membre{attendeeCount > 1 ? 's' : ''} {attendeeCount > 1 ? 'y vont' : 'y va'}
          </span>
        </div>
      )}
    </div>
  )
}
