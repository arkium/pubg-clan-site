import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { periodFilter } from './support/layout'
import { mockMemberItems } from './support/pages'

/** Objets consommés d'un joueur — page migrée vers la charte le 03/10/2026 (docs/ui/index.html). */

const kpi = (page: Page, label: string) => page.locator('.app-kpi').filter({ has: page.getByRole('term').filter({ hasText: label }) })

test.describe('objets consommés du joueur', () => {
  test.beforeEach(async ({ api, page }) => {
    mockMemberItems(api)
    await page.goto(`/members/${MEMBER_ID}/items`)
    await expect(page.getByRole('heading', { level: 1, name: 'Objets consommés de Joueur Alpha' })).toBeVisible()
  })

  test('bannière joueur, fil d’Ariane vers son tableau de bord, chiffres clés', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Joueur Alpha/ }).first()).toHaveAttribute('href', `/members/${MEMBER_ID}/dashboard`)
    // « Tous » par défaut : 100 × 20 objets sur 25 × 20 matchs.
    await expect(kpi(page, 'Objets consommés')).toContainText('2 000')
    await expect(kpi(page, 'Objets consommés')).toContainText('500 matchs analysés depuis le 17/09/2026')
    await expect(kpi(page, 'Par match')).toContainText('4')
    await expect(kpi(page, 'Famille dominante')).toContainText('Boosts')
    await expect(kpi(page, 'Famille dominante')).toContainText('50 % des objets consommés')
  })

  test('familles et objets, sans défilement horizontal', async ({ page }) => {
    const families = page.getByRole('list', { name: 'Familles' }).getByRole('listitem')
    await expect(families).toHaveCount(3)
    // Moyenne par match : 1 000 boosts sur 500 matchs.
    await expect(families.first()).toContainText('Boosts')
    await expect(families.first().getByTestId('family-per-match').locator('b')).toHaveText('2')
    await expect(families.first().getByTestId('family-per-match')).toContainText('par match')
    await expect(page.getByText('la télémétrie des matchs plus anciens ne conservait pas')).toHaveCount(0)
    const items = page.getByRole('table').or(page.getByRole('list', { name: 'Objets les plus consommés' })).filter({ visible: true })
    await expect(items).toContainText('Trousse de soins')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('changer la période recharge sans replier la page', async ({ api, page }) => {
    await periodFilter(page).getByRole('button', { name: 'Semaine' }).click()
    await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/item-use`, 'period').at(-1)).toBe('week')
    await expect(kpi(page, 'Objets consommés')).toContainText('100')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objets consommés')
  })
})
