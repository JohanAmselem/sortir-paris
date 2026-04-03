import { ImageResponse } from 'next/og'
import { db, events, venues, categories } from '@sortir/db'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'
export const alt = 'Paname Club — Événement'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const result = await db
    .select({ event: events, venue: venues, category: categories })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(categories, eq(events.categoryId, categories.id))
    .where(eq(events.slug, slug))
    .limit(1)

  if (result.length === 0) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0A0A0A',
            color: 'white',
            fontSize: 48,
            fontWeight: 800,
          }}
        >
          PANAME CLUB
        </div>
      ),
      size
    )
  }

  const { event, venue, category } = result[0]
  const startDate = event.startDate
    ? new Date(event.startDate).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '48px',
          backgroundColor: '#0A0A0A',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #1A1A2E 0%, #0A0A0A 50%, #16213E 100%)',
            display: 'flex',
          }}
        />

        {/* Accent circle decoration */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(233,69,96,0.3) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          {/* Category + Price badge */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            {category && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(233,69,96,0.2)',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#E94560',
                }}
              >
                {category.icon} {category.name}
              </div>
            )}
            {event.isFree && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'rgba(16,185,129,0.2)',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#10B981',
                }}
              >
                Gratuit
              </div>
            )}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.1,
              marginBottom: '16px',
              maxWidth: '900px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {event.title}
          </div>

          {/* Venue + Date */}
          <div style={{ display: 'flex', gap: '24px', fontSize: 24, color: 'rgba(255,255,255,0.7)' }}>
            {venue && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                📍 {venue.name}
              </div>
            )}
            {startDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                📅 {startDate}
              </div>
            )}
          </div>

          {/* Branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              marginTop: '32px',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>PANAME</span>
            <span style={{ fontSize: 28, fontWeight: 300, color: '#E94560' }}>CLUB</span>
          </div>
        </div>
      </div>
    ),
    size
  )
}
