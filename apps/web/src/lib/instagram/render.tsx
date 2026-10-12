/* eslint-disable @next/next/no-img-element -- Satori (next/og) renders plain <img> */
/**
 * Slide rendering: next/og (Satori) → PNG → JPEG (sharp). Instagram only
 * accepts JPEG. Feed 1080×1350 (4:5, the tallest ratio allowed in the feed),
 * story 1080×1920 (9:16). Brand: ink #171717, gold #c0a16c, paper #f7f5ef.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import type { ReactElement } from 'react'
import { photoDataUrl } from './photo'
import type { PostItem, PostKind } from './types'

export const INK = '#171717'
export const GOLD = '#c0a16c'
export const PAPER = '#f7f5ef'

export const SLIDE_SIZE: Record<PostKind, { width: number; height: number }> = {
  carousel: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

type Font = { name: string; data: Buffer; weight: 400 | 700 | 800; style: 'normal' }

let assets: Promise<{ fonts: Font[]; logo: Record<string, string> }> | null = null

/** Fonts (Archivo, OFL, vendored in ./fonts) and brand logos (public/brand), read once. */
function loadAssets() {
  assets ??= (async () => {
    const root = process.cwd()
    const font = async (w: 400 | 700 | 800): Promise<Font> => ({
      name: 'Archivo',
      data: await readFile(join(root, 'src/lib/instagram/fonts', `archivo-latin-${w}-normal.woff`)),
      weight: w,
      style: 'normal',
    })
    const svg = async (file: string) => `data:image/svg+xml;base64,${(await readFile(join(root, 'public/brand', file))).toString('base64')}`
    const [f4, f7, f8, mark, markLight, word, wordLight, logoLight] = await Promise.all([
      font(400),
      font(700),
      font(800),
      svg('logo-mark.svg'),
      svg('logo-mark-light.svg'),
      svg('logo-wordmark.svg'),
      svg('logo-wordmark-light.svg'),
      svg('logo-light.svg'),
    ])
    return { fonts: [f4, f7, f8], logo: { mark, markLight, word, wordLight, logoLight } }
  })().catch((err) => {
    assets = null
    throw err
  })
  return assets
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function titleSize(title: string, story: boolean): number {
  const n = title.length
  const base = n <= 28 ? 92 : n <= 50 ? 76 : n <= 80 ? 62 : 52
  return story ? Math.round(base * 1.08) : base
}

type Logos = Awaited<ReturnType<typeof loadAssets>>['logo']

function Brand({ logo, light, scale = 1 }: { logo: Logos; light: boolean; scale?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 * scale }}>
      <img src={light ? logo.markLight : logo.mark} alt="" width={62 * scale} height={64 * scale} />
      <img src={light ? logo.wordLight : logo.word} alt="" width={300 * scale} height={31 * scale} />
    </div>
  )
}

function Cover({ item, kind, logo }: { item: PostItem; kind: PostKind; logo: Logos }) {
  const story = kind === 'story'
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: PAPER, color: INK, padding: story ? '220px 84px 300px' : '84px' }}>
      <Brand logo={logo} light={false} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {item.when ? (
          <div style={{ fontSize: 40, fontWeight: 700, color: GOLD, letterSpacing: 4, textTransform: 'uppercase' }}>{item.when}</div>
        ) : null}
        <div style={{ fontSize: story ? 140 : 128, fontWeight: 800, lineHeight: 0.98, marginTop: 24, letterSpacing: -2 }}>{item.title}</div>
        <div style={{ display: 'flex', width: 160, height: 8, background: GOLD, marginTop: 44 }} />
        {item.subtitle ? <div style={{ fontSize: 50, fontWeight: 400, marginTop: 40 }}>{capitalize(item.subtitle)}</div> : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 34, fontWeight: 700 }}>
        <span>panameclub.fr</span>
        <span style={{ color: GOLD }}>{story ? 'Notre sélection' : 'Fais défiler →'}</span>
      </div>
    </div>
  )
}

function Details({ item, story, onPhoto }: { item: PostItem; story: boolean; onPhoto: boolean }) {
  const title = clip(item.title, 110)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {item.when ? <div style={{ fontSize: 42, fontWeight: 700, color: GOLD }}>{item.when}</div> : null}
      <div style={{ fontSize: titleSize(title, story), fontWeight: 800, lineHeight: 1.02, marginTop: 14, color: PAPER, letterSpacing: -1 }}>{title}</div>
      {item.subtitle ? (
        <div style={{ fontSize: 36, marginTop: 22, color: onPhoto ? '#f7f5efe6' : '#f7f5efcc' }}>{clip(item.subtitle, 70)}</div>
      ) : null}
      {item.price ? (
        <div style={{ display: 'flex', marginTop: 28 }}>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, padding: '10px 26px', borderRadius: 999, background: item.price === 'Gratuit' ? GOLD : PAPER, color: INK }}>
            {item.price}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EventPhoto({ item, kind, logo, photo }: { item: PostItem; kind: PostKind; logo: Logos; photo: string }) {
  const story = kind === 'story'
  const { width, height } = SLIDE_SIZE[kind]
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: INK }}>
      <img src={photo} alt="" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, width, height }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          display: 'flex',
          backgroundImage: 'linear-gradient(180deg, rgba(23,23,23,0.55) 0%, rgba(23,23,23,0) 22%, rgba(23,23,23,0) 38%, rgba(23,23,23,0.88) 68%, rgba(23,23,23,0.97) 100%)',
        }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: story ? '200px 72px 280px' : '64px 72px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {item.category ? (
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, padding: '10px 24px', borderRadius: 999, background: GOLD, color: INK, textTransform: 'uppercase', letterSpacing: 2 }}>
              {item.category}
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          <img src={logo.markLight} alt="" width={62} height={64} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Details item={item} story={story} onPhoto />
          {item.credit ? <div style={{ fontSize: 22, marginTop: 30, color: '#f7f5efb3' }}>{clip(item.credit, 90)}</div> : null}
        </div>
      </div>
    </div>
  )
}

/** No usable photo: typography only. */
function EventText({ item, kind, logo }: { item: PostItem; kind: PostKind; logo: Logos }) {
  const story = kind === 'story'
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: INK, color: PAPER, padding: story ? '200px 80px 280px' : '80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD, letterSpacing: 4, textTransform: 'uppercase' }}>{item.category ?? 'Sortie'}</div>
        <img src={logo.markLight} alt="" width={62} height={64} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: 120, height: 8, background: GOLD, marginBottom: 48 }} />
        <Details item={item} story={story} onPhoto={false} />
      </div>
      <img src={logo.wordLight} alt="" width={300} height={31} />
    </div>
  )
}

function Cta({ kind, logo }: { kind: PostKind; logo: Logos }) {
  const story = kind === 'story'
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: INK, color: PAPER, padding: 84, textAlign: 'center' }}>
      <img src={logo.logoLight} alt="" width={520} height={279} />
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.08, marginTop: 84, maxWidth: 860 }}>Toutes les sorties sur panameclub.fr</div>
      <div style={{ display: 'flex', width: 140, height: 8, background: GOLD, marginTop: 48 }} />
      <div style={{ fontSize: 48, fontWeight: 700, color: GOLD, marginTop: 48 }}>Active tes Alertes concerts</div>
      <div style={{ fontSize: 34, marginTop: 20, color: '#f7f5efcc' }}>Tes artistes passent à Paris ? Tu es prévenu le premier.</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: story ? 120 : 84 }}>Lien en bio</div>
    </div>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * One slide as JPEG bytes. Event photo problems fall back to the typographic
 * slide; `degraded` says the photo was expected but could not be used (the
 * media route then caches the image briefly only).
 */
export async function renderSlideInfo(item: PostItem, kind: PostKind): Promise<{ jpeg: Buffer; degraded: boolean }> {
  const { fonts, logo } = await loadAssets()
  const { width, height } = SLIDE_SIZE[kind]
  let node: ReactElement
  let degraded = false
  if (item.type === 'cover') node = <Cover item={item} kind={kind} logo={logo} />
  else if (item.type === 'cta') node = <Cta kind={kind} logo={logo} />
  else {
    const wanted = Boolean(item.image_ok && item.image_url)
    const photo = wanted ? await photoDataUrl(item.image_url!, width, height) : null
    degraded = wanted && !photo
    node = photo ? <EventPhoto item={item} kind={kind} logo={logo} photo={photo} /> : <EventText item={{ ...item, credit: undefined }} kind={kind} logo={logo} />
  }
  const png = Buffer.from(await new ImageResponse(node, { width, height, fonts }).arrayBuffer())
  const jpeg = await sharp(png).flatten({ background: INK }).toColorspace('srgb').jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
  return { jpeg, degraded }
}

export async function renderSlide(item: PostItem, kind: PostKind): Promise<Buffer> {
  return (await renderSlideInfo(item, kind)).jpeg
}
