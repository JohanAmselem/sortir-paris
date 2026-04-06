import { ImageResponse } from 'next/og'
import { db, articles } from '@sortir/db'
import { eq, and } from 'drizzle-orm'

export const runtime = 'edge'
export const alt = 'Paname Club — News culturelles'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TYPE_EMOJI: Record<string, string> = {
  actualite: '🔴',
  selection: '⭐',
  focus: '🔍',
  tendance: '📈',
  interview: '🎙️',
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let title = 'News culturelles'
  let type = 'actualite'
  let excerpt = 'Toute l\'actualité culturelle à Paris'

  try {
    const result = await db
      .select({ title: articles.title, type: articles.type, excerpt: articles.excerpt })
      .from(articles)
      .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
      .limit(1)

    if (result[0]) {
      title = result[0].title
      type = result[0].type
      excerpt = result[0].excerpt
    }
  } catch {
    // fallback to defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '60px',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <span style={{ fontSize: '32px' }}>{TYPE_EMOJI[type] ?? '📰'}</span>
          <span style={{ fontSize: '18px', color: '#E94560', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
            {type === 'actualite' ? 'Actualité' : type === 'selection' ? 'Sélection' : type === 'focus' ? 'Focus' : type === 'tendance' ? 'Tendance' : 'Interview'}
          </span>
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: 800, color: 'white', lineHeight: 1.2, margin: 0, maxWidth: '900px' }}>
          {title}
        </h1>
        <p style={{ fontSize: '22px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, margin: '16px 0 0', maxWidth: '800px' }}>
          {excerpt.slice(0, 120)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '40px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#E94560' }}>PANAME</span>
          <span style={{ fontSize: '20px', fontWeight: 200, color: 'rgba(255,255,255,0.6)' }}>CLUB</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
