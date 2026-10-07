import { ImageResponse } from 'next/og'
import { getEventBySlug } from '@/lib/events/detail'
import { formatWhen } from '@/lib/paris-time'
import { formatPrice } from '@/lib/format'

export const alt = 'Paname Club : fiche de sortie'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

const INK = '#1c1730'
const PAPER = '#f7f5ef'
const VIOLET = '#a78bfa'

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const e = await getEventBySlug(slug).catch(() => null)

  const title = e?.title ?? 'Que faire à Paris ce soir ?'
  const when = e ? formatWhen(e) : ''
  const where = e?.venue ? `${e.venue.name}${e.venue.arrondissement ? ` · ${e.venue.arrondissement}` : ''}` : ''
  const price = e ? formatPrice(e) : null

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, color: PAPER }}>
        {e?.imageUrl && (
          <img src={e.imageUrl} alt="" width={460} height={630} style={{ width: 460, height: 630, objectFit: 'cover' }} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56 }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800 }}>
            PANAME<span style={{ color: VIOLET, fontWeight: 300 }}>CLUB</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {when && <div style={{ fontSize: 30, color: VIOLET, fontWeight: 700 }}>{when}</div>}
            <div style={{ fontSize: title.length > 60 ? 50 : 64, fontWeight: 800, lineHeight: 1.02, marginTop: 12 }}>
              {title.length > 110 ? title.slice(0, 107) + '…' : title}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 24, fontSize: 28, color: '#f7f5efcc' }}>
              {where && <span>{where}</span>}
              {price && price.tone !== 'unknown' && <span style={{ color: price.tone === 'free' ? '#7ee2b8' : PAPER }}>{price.label}</span>}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  )
}
