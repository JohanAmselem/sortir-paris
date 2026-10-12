import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { renderSlide, SLIDE_SIZE } from './render'
import { checkPhoto } from './photo'
import type { PostItem } from './types'

/** Set IG_SLIDES_OUT=/some/dir to look at the rendered slides. */
const OUT = process.env.IG_SLIDES_OUT

async function check(item: PostItem, kind: 'carousel' | 'story', name: string) {
  const jpeg = await renderSlide(item, kind)
  // JPEG magic bytes (SOI marker).
  expect(jpeg[0]).toBe(0xff)
  expect(jpeg[1]).toBe(0xd8)
  const meta = await sharp(jpeg).metadata()
  expect(meta.format).toBe('jpeg')
  expect(meta.width).toBe(SLIDE_SIZE[kind].width)
  expect(meta.height).toBe(SLIDE_SIZE[kind].height)
  expect(meta.space).toBe('srgb')
  expect(jpeg.length).toBeLessThan(8 * 1024 * 1024)
  if (OUT) await sharp(jpeg).toFile(`${OUT}/${name}.jpg`)
}

const event: PostItem = {
  type: 'event',
  title: 'Quatuor Ébène : intégrale des quatuors de Beethoven',
  subtitle: 'Philharmonie de Paris · 19e',
  when: 'Mer. 15 oct. · 20h',
  price: 'Dès 25 €',
  category: 'Concert',
  image_url: null,
  image_ok: false,
}

describe('renderSlide', { timeout: 30_000 }, () => {
  it('renders a feed cover as a 1080×1350 JPEG', async () => {
    await check({ type: 'cover', title: 'Demain à Paris', subtitle: 'mercredi 15 octobre', when: 'La sélection' }, 'carousel', 'cover')
  })
  it('renders the typographic fallback when there is no photo', async () => {
    await check(event, 'carousel', 'event-text')
  })
  it('renders story slides as 1080×1920 JPEGs', async () => {
    await check(event, 'story', 'story-text')
    await check({ type: 'cover', title: 'Demain à Paris', subtitle: 'mercredi 15 octobre', when: 'Concerts' }, 'story', 'story-cover')
  })
  it('renders the final call to action', async () => {
    await check({ type: 'cta', title: 'Toutes les sorties sur panameclub.fr' }, 'carousel', 'cta')
  })
  it('falls back to typography when the photo cannot be fetched', async () => {
    await check({ ...event, image_url: 'http://localhost/x.jpg', image_ok: true, credit: 'Photo : X (via Y)' }, 'carousel', 'event-fallback')
  })

  describe('with a photo', () => {
    afterEach(() => vi.unstubAllGlobals())
    const stubPhoto = async (width: number, height: number) => {
      const img = await sharp({
        create: { width, height, channels: 3, background: { r: 60, g: 90, b: 140 } },
      })
        .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 3}" r="${height / 5}" fill="#e8c27a"/></svg>`) }])
        .jpeg()
        .toBuffer()
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(img), { headers: { 'content-type': 'image/jpeg' } })))
    }
    it('uses a large enough photo, full bleed with the credit', async () => {
      await stubPhoto(1600, 1000)
      expect(await checkPhoto('https://img.example.org/a.jpg')).toEqual({ ok: true, width: 1600 })
      await check({ ...event, image_url: 'https://img.example.org/a.jpg', image_ok: true, credit: 'Photo : Philharmonie de Paris (via OpenAgenda)' }, 'carousel', 'event-photo')
      await check({ ...event, image_url: 'https://img.example.org/a.jpg', image_ok: true, credit: 'Photo : Philharmonie de Paris (via OpenAgenda)' }, 'story', 'story-photo')
    })
    it('refuses a photo narrower than 600 px', async () => {
      await stubPhoto(500, 400)
      expect(await checkPhoto('https://img.example.org/small.jpg')).toEqual({ ok: false, width: 500 })
      await check({ ...event, image_url: 'https://img.example.org/small.jpg', image_ok: true }, 'carousel', 'event-small')
    })
  })
})
