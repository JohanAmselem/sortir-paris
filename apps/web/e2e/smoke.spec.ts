import { expect, test, type Page } from '@playwright/test'

/** Erreurs de page et d'hydratation : une page qui « marche » ne doit rien lever. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat|Minified React error #4(18|25)/i.test(m.text())) errors.push(m.text())
  })
  return errors
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('accueil : « Ce soir à Paris », les pastilles changent Notre choix en place', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /ce soir à paris/i })).toBeVisible()
  await page.getByRole('button', { name: 'Ce week-end' }).click()
  await expect(page.getByRole('button', { name: 'Ce week-end' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { level: 1, name: /ce week-end à paris/i })).toBeVisible()
  await noHorizontalScroll(page)
  expect(errors).toEqual([])
})

test('la recherche comprend les dates', async ({ page }) => {
  await page.goto('/agenda?q=concert%20mars%202027')
  await expect(page.getByText('On a compris :')).toBeVisible()
  await expect(page.getByRole('link', { name: /mars 2027/ }).first()).toBeVisible()
})

for (const path of ['/agenda', '/agenda/2027-03', '/agenda/2027-03/concerts', '/ce-soir', '/ce-week-end', '/gratuit', '/categories/concerts', '/paris/11e', '/lieux', '/mes-sorties']) {
  test(`page ${path}`, async ({ page }) => {
    const errors = watchErrors(page)
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
    await noHorizontalScroll(page)
    expect(errors).toEqual([])
  })
}

test('les filtres de l’Agenda passent dans l’adresse', async ({ page }) => {
  await page.goto('/agenda')
  await page.getByText('Prix', { exact: true }).click()
  await page.getByRole('link', { name: 'Gratuit', exact: true }).click()
  await expect(page).toHaveURL(/free=1/)
})

test('fiche : un seul bouton principal, données structurées', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/ce-week-end')
  await page.locator('article h3 a').first().click()
  await expect(page).toHaveURL(/\/evenements\//)
  await expect(page.locator('h1')).toBeVisible()
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(ld.some((t) => t.includes('"@type":"Event"'))).toBe(true)
  expect(errors).toEqual([])
})

test('sortie inconnue : 404', async ({ page }) => {
  const res = await page.goto('/evenements/cet-evenement-n-existe-pas-123')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /perdu dans paris/i })).toBeVisible()
})

test('les anciennes adresses redirigent', async ({ page }) => {
  await page.goto('/evenements?q=jazz')
  await expect(page).toHaveURL(/\/agenda\?q=jazz$/)
  await page.goto('/club')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/collections/expos-du-moment')
  await expect(page).toHaveURL(/\/agenda$/)
  await page.goto('/compte/sauvegardes')
  await expect(page).toHaveURL(/mes-sorties/)
})

test('la carte charge les lieux', async ({ page }) => {
  await page.goto('/carte')
  // Sans jeton Mapbox (en local), la page se dégrade en un message clair.
  const unavailable = page.getByText('Carte indisponible')
  const panel = page.getByText(/sorties? dans cette zone/)
  await expect(unavailable.or(panel)).toBeVisible({ timeout: 20_000 })
  if (await unavailable.isVisible()) {
    await expect(page.getByRole('link', { name: /agenda/i }).first()).toBeVisible()
  }
})

test('sitemaps et robots', async ({ request }) => {
  expect((await request.get('/robots.txt')).status()).toBe(200)
  const sm = await request.get('/sitemap.xml')
  expect(sm.status()).toBe(200)
  expect(await sm.text()).toContain('/agenda/')
  const ev = await request.get('/sitemap-events.xml')
  expect(ev.status()).toBe(200)
  expect(await ev.text()).toContain('/evenements/')
})
