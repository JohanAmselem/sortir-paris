'use client'

import { useState, useEffect } from 'react'

interface CountdownProps {
  targetDate: Date
  className?: string
}

export function Countdown({ targetDate, className }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const diff = targetDate.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeLeft('En cours')
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 24) {
        const days = Math.floor(hours / 24)
        setTimeLeft(`Dans ${days}j`)
      } else if (hours > 0) {
        setTimeLeft(`Dans ${hours}h${minutes.toString().padStart(2, '0')}`)
      } else {
        setTimeLeft(`Dans ${minutes} min`)
      }
    }

    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (!timeLeft) return null

  return (
    <span className={className}>
      {timeLeft}
    </span>
  )
}
