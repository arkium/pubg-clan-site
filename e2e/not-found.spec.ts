import { expect, test } from './support/api'

/**
 * Page 404 à la charte (src/app/not-found.tsx) : adresse inconnue → statut 404, titre « Hors de la zone », sorties vers
 * les pages publiques, aucun défilement horizontal. Next.js pose lui-même le `noindex`.
 */

test('une adresse inconnue répond 404 avec la page « Hors de la zone » et ses sorties', async ({ page }) => {
  const response = await page.goto('/une-page-qui-n-existe-pas')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Hors de la zone' })).toBeVisible()
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toHaveCount(1)

  const exits = page.getByRole('navigation', { name: 'Pages pour repartir' })
  await expect(exits.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/')
  await expect(exits.getByRole('link', { name: 'Les clans' })).toHaveAttribute('href', '/clans')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
