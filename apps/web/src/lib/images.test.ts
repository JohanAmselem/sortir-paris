import { describe, expect, it } from 'vitest'
import { hdImageUrl } from './images'

describe('hdImageUrl', () => {
  it('passe Offi et Theatreonline en grand format', () => {
    expect(hdImageUrl('https://files.offi.fr/programmation/3360149/images/120/ac57e5e6423a2d1f3e227e508dc23c66.jpg')).toBe(
      'https://files.offi.fr/programmation/3360149/images/1000/ac57e5e6423a2d1f3e227e508dc23c66.jpg'
    )
    expect(hdImageUrl('https://www.theatreonline.com/BDDPhoto/Medias//spectacle/62892/xs_1_affiche.jpg')).toBe(
      'https://www.theatreonline.com/BDDPhoto/Medias//spectacle/62892/1_affiche.jpg'
    )
  })
  it('ne touche pas aux autres images', () => {
    expect(hdImageUrl('https://cdn.paris.fr/qfapv4/2026/08/20/huge-x.jpg')).toBe('https://cdn.paris.fr/qfapv4/2026/08/20/huge-x.jpg')
    expect(hdImageUrl(null)).toBeNull()
  })
})
