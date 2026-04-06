import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Paname Club — News culturelles'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
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
          <span style={{ fontSize: '32px' }}>📰</span>
          <span style={{ fontSize: '18px', color: '#E94560', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
            News culturelles
          </span>
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: 800, color: 'white', lineHeight: 1.2, margin: 0, maxWidth: '900px' }}>
          Toute l&apos;actualité culturelle à Paris
        </h1>
        <p style={{ fontSize: '22px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, margin: '16px 0 0', maxWidth: '800px' }}>
          Expos, spectacles, concerts, tendances et bons plans
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
