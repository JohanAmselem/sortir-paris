import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'Alertes concerts Paname Club : tes artistes passent à Paris ? Tu es prévenu le premier.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// Built once (static): the brand files are read from public/brand at build time.
export const dynamic = 'force-static'

const NIGHT = '#1c1730'
const PAPER = '#f7f5ef'
const VIOLET = '#a78bfa'

async function brand(file: string): Promise<string> {
  const svg = await readFile(join(process.cwd(), 'public', 'brand', file))
  return `data:image/svg+xml;base64,${svg.toString('base64')}`
}

export default async function OGImage() {
  const [mark, wordmark] = await Promise.all([brand('logo-mark-light.svg'), brand('logo-wordmark-light.svg')])
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: NIGHT, color: PAPER, padding: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={mark} alt="" width={68} height={70} />
          <img src={wordmark} alt="" width={310} height={32} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 32, color: VIOLET, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Alertes concerts</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, marginTop: 16 }}>Tes artistes passent à Paris ?</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, color: VIOLET }}>Tu es prévenu le premier.</div>
          <div style={{ fontSize: 30, marginTop: 28, color: '#f7f5efcc' }}>Gratuit · Paris et petite couronne · e-mail ou notification</div>
        </div>
      </div>
    ),
    size
  )
}
