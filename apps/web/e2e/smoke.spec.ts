import { expect, test, type Page } from '@playwright/test'

/** Collect page errors and hydration warnings: a page that "works" must not throw. */
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

test('homepage: discovery answers in seconds', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /je veux sortir/i })).toBeVisible()
  await expect(page.getByText('Chargement...')).toHaveCount(0)
  // Changing a chip updates the suggestions without leaving the page.
  await page.getByRole('button', { name: 'ce week-end' }).click()
  await expect(page.getByRole('button', { name: 'ce week-end' })).toHaveAttribute('aria-pressed', 'true')
  await noHorizontalScroll(page)
  expect(errors).toEqual([])
})

test('free-text request is understood', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/dis-le avec tes mots/i).fill('concert gratuit ce soir dans le 11e')
  await page.getByRole('button', { name: /trouver/i }).click()
  await expect(page.getByText(/Compris/)).toBeVisible({ timeout: 15_000 })
})

for (const path of ['/ce-soir', '/ce-week-end', '/gratuit', '/evenements', '/categories/concerts', '/paris/11e', '/collections/expos-du-moment', '/lieux', '/surprise']) {
  test(`listing ${path} renders`, async ({ page }) => {
    const errors = watchErrors(page)
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
    await noHorizontalScroll(page)
    expect(errors).toEqual([])
  })
}

test('filters are reflected in the URL and survive reload', async ({ page }) => {
  await page.goto('/evenements')
  await page.getByRole('button', { name: 'Gratuit', exact: true }).first().click()
  await expect(page).toHaveURL(/free=1/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Gratuit', exact: true }).first()).toHaveAttribute('aria-pressed', 'true')
})

test('event page: one primary action, structured data', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/ce-week-end')
  const first = page.locator('article h3 a').first()
  await first.click()
  await expect(page).toHaveURL(/\/evenements\//)
  await expect(page.locator('h1')).toBeVisible()
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(ld.some((t) => t.includes('"@type":"Event"'))).toBe(true)
  expect(errors).toEqual([])
})

test('unknown event returns 404', async ({ page }) => {
  const res = await page.goto('/evenements/cet-evenement-n-existe-pas-123')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /perdu dans paris/i })).toBeVisible()
})

test('legacy URLs redirect', async ({ page }) => {
  await page.goto('/recherche')
  await expect(page).toHaveURL(/\/evenements$/)
  await page.goto('/collections/expos-printemps')
  await expect(page).toHaveURL(/expos-du-moment/)
})

test('map loads venues and lists them', async ({ page }) => {
  await page.goto('/carte')
  // Without a Mapbox token (local runs) the page must degrade to a clear message.
  const unavailable = page.getByText('Carte indisponible')
  const panel = page.getByText(/sorties? dans cette zone/)
  await expect(unavailable.or(panel)).toBeVisible({ timeout: 20_000 })
  if (await unavailable.isVisible()) {
    await expect(page.getByRole('link', { name: /liste des sorties/i })).toBeVisible()
  }
})

test('sitemaps and robots', async ({ request }) => {
  expect((await request.get('/robots.txt')).status()).toBe(200)
  const sm = await request.get('/sitemap.xml')
  expect(sm.status()).toBe(200)
  const ev = await request.get('/sitemap-events.xml')
  expect(ev.status()).toBe(200)
  expect(await ev.text()).toContain('/evenements/')
})
