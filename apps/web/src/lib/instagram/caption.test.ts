import { describe, expect, it } from 'vitest'
import { CAPTION_MAX, LINK_IN_BIO, VERIFY_LINE, buildCaption, eventLine, hookInput, templateHook, validateHook } from './caption'
import { CAROUSEL_THEMES, STORY_THEMES } from './themes'
import type { PostItem } from './types'

const item = (over: Partial<PostItem> = {}): PostItem => ({
  type: 'event',
  title: 'Quatuor Ébène',
  subtitle: 'Philharmonie de Paris · 19e',
  when: 'Jeu. 15 oct. · 20h',
  price: 'Dès 25 €',
  category: 'Concert',
  source: 'openagenda',
  image_url: 'https://img.example.org/1.jpg',
  image_ok: true,
  ...over,
})

const items: PostItem[] = [
  { type: 'cover', title: 'Demain à Paris', subtitle: 'jeudi 15 octobre', when: 'La sélection' },
  item(),
  item({ title: 'Jamel Comedy Club', subtitle: 'Le Comedy Club · 2e', when: 'Jeu. 15 oct. · 21h30', price: '22 €', category: 'Spectacle', source: 'billetreduc' }),
  item({ title: 'Bal swing', subtitle: 'La Bellevilloise · 20e', price: 'Gratuit', image_ok: false }),
  { type: 'cta', title: 'Toutes les sorties sur panameclub.fr' },
]
const input = hookInput('Demain à Paris', 'jeudi 15 octobre', items)

describe('buildCaption', () => {
  const caption = buildCaption({ hook: 'Ta soirée de demain est trouvée.', headline: 'Demain à Paris', dateLabel: 'jeudi 15 octobre', items, hashtags: CAROUSEL_THEMES.demain.hashtags })

  it('lists every event (title — venue — day time — price) and the mandatory lines', () => {
    expect(caption).toContain('• Quatuor Ébène — Philharmonie de Paris · 19e — Jeu. 15 oct. · 20h — Dès 25 €')
    expect(caption).toContain('• Bal swing — La Bellevilloise · 20e — Jeu. 15 oct. · 20h — Gratuit')
    expect(caption).toContain(VERIFY_LINE)
    expect(caption).toContain(LINK_IN_BIO)
    expect(caption.startsWith('Ta soirée de demain est trouvée.\n\nDemain à Paris · jeudi 15 octobre')).toBe(true)
  })

  it('credits the photo sources (only photos actually used)', () => {
    expect(caption).toContain('Photos : lieux et organisateurs (via OpenAgenda, BilletRéduc).')
  })

  it('ends with 10 to 15 hashtags', () => {
    const tags = caption.split('\n').at(-1)!.split(' ')
    expect(tags.every((t) => t.startsWith('#'))).toBe(true)
    expect(tags.length).toBeGreaterThanOrEqual(10)
    expect(tags.length).toBeLessThanOrEqual(15)
  })

  it('never exceeds 2,200 characters', () => {
    const many = Array.from({ length: 40 }, (_, i) => item({ title: `Un titre vraiment très long numéro ${i} `.repeat(4) }))
    const long = buildCaption({ hook: 'Accroche.', headline: 'Ta semaine à Paris', dateLabel: 'du 12 au 18 octobre', items: many, hashtags: CAROUSEL_THEMES.semaine.hashtags })
    expect(long.length).toBeLessThanOrEqual(CAPTION_MAX)
    expect(long).toContain(LINK_IN_BIO)
    expect(long).toContain('• …')
  })

  it('clips very long titles in the event lines', () => {
    expect(eventLine(item({ title: 'x'.repeat(200) })).length).toBeLessThan(160)
  })
})

describe('hashtag lists', () => {
  it('has 10 to 15 hashtags per theme, no duplicates', () => {
    for (const t of [...Object.values(CAROUSEL_THEMES), ...Object.values(STORY_THEMES)]) {
      expect(t.hashtags.length).toBeGreaterThanOrEqual(10)
      expect(t.hashtags.length).toBeLessThanOrEqual(15)
      expect(new Set(t.hashtags).size).toBe(t.hashtags.length)
      for (const h of t.hashtags) expect(h).toMatch(/^#[a-z0-9]+$/)
    }
  })
})

describe('validateHook', () => {
  it('accepts a hook that only uses words from the input', () => {
    expect(validateHook('Demain, du jazz à la Philharmonie de Paris et un Bal swing à la Bellevilloise.', input)).toEqual({
      ok: true,
      hook: 'Demain, du jazz à la Philharmonie de Paris et un Bal swing à la Bellevilloise.',
    })
    expect(validateHook('Envie de rire ou de danser ? Ta soirée de jeudi est toute trouvée.', input).ok).toBe(true)
  })

  it('rejects a proper noun that is not in the data', () => {
    expect(validateHook('Demain, Beyoncé au Stade de France !', input)).toMatchObject({ ok: false })
    expect(validateHook('Ta soirée avec Jamel Debbouze.', input)).toMatchObject({ ok: false })
  })

  it('rejects numbers and dates that are not in the data', () => {
    expect(validateHook('Plus de 300 places encore dispo demain.', input)).toMatchObject({ ok: false })
    expect(validateHook('Rendez-vous samedi pour danser.', input)).toMatchObject({ ok: false })
    expect(validateHook('Rendez-vous jeudi pour danser.', input).ok).toBe(true)
  })

  it('rejects hashtags, links, emoji spam and long texts', () => {
    expect(validateHook('Demain à Paris #sortie', input).ok).toBe(false)
    expect(validateHook('Tout est sur panameclub.fr demain.', input).ok).toBe(false)
    expect(validateHook('Demain on sort 🎉🎶🔥', input).ok).toBe(false)
    expect(validateHook('Demain on sort, c’est la fête. '.repeat(10), input).ok).toBe(false)
  })

  it('accepts a single emoji', () => {
    expect(validateHook('Demain, Paris a du programme pour toi 🎶', input).ok).toBe(true)
  })
})

describe('templateHook', () => {
  it('is deterministic and themed', () => {
    expect(templateHook('weekend', 'x')).toBe(templateHook('weekend', 'x'))
    expect(templateHook('weekend', 'x')).toMatch(/week-end/)
    expect(templateHook('inconnu', 'x').length).toBeGreaterThan(10)
  })
})
