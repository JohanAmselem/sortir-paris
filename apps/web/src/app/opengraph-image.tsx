import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Paname Club — Sorties culturelles à Paris'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #0A0A0A 50%, #16213E 100%)',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: -150,
            left: -150,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '24px' }}>
          <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-2px' }}>PANAME</span>
          <span style={{ fontSize: 72, fontWeight: 300, color: '#E94560', letterSpacing: '-2px' }}>CLUB</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 400,
            marginBottom: '40px',
          }}
        >
          Sorties culturelles à Paris
        </div>

        {/* Category icons */}
        <div style={{ display: 'flex', gap: '16px', fontSize: 36 }}>
          {['🎵', '🎨', '🎭', '🎬', '🎪', '💃'].map((icon, i) => (
            <div
              key={i}
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  )
}
