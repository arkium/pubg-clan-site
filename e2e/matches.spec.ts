import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockClanMatches } from './support/pages'

/**
 * Matchs du clan et soirée — docs/features/matches.md (maquette Claude Design « Matchs et soirées »).
 * Bandeau commun, carnet des soirées, navigation datée, plan de vol, cartes de fin de partie ; journée de jeu à
 * Paris commençant à 06:00 (la partie de 00:40 appartient à la soirée du 26).
 */

const isNarrow = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

test.describe('liste des matchs', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanMatches(api)
    await page.goto(`/clans/${CLAN_ID}/matches?period=month`)
    await expect(page.getByRole('heading', { level: 1, name: /Matchs/ })).toBeVisible()
  })

  test('bandeau et indicateurs', async ({ page }) => {
    const banner = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) })
    await expect(banner).toContainText('8 parties · 3 soirées')
    await expect(banner).toContainText('1 chicken dinner')
    await expect(page.getByText('Top 1', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('12,5 % des parties')).toBeVisible()
  })

  test('carnet : une ligne par soirée, une case par partie, lien vers la soirée', async ({ page }) => {
    const sessions = page.getByRole('region', { name: 'Soirées' })
    const first = sessions.getByRole('link', { name: /Samedi 26 septembre/ })
    await expect(first).toHaveAccessibleName(/5 parties, 1 top 1/)
    await expect(sessions.getByRole('link')).toHaveCount(3)
    await first.click()
    await expect(page).toHaveURL(new RegExp(`/clans/${CLAN_ID}/matches/session/2026-09-26\\?period=month`))
    await expect(page.getByRole('heading', { level: 1, name: 'Samedi 26 septembre' })).toBeVisible()
  })
})

test.describe('soirée', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanMatches(api)
    await page.goto(`/clans/${CLAN_ID}/matches/session/2026-09-26?period=month`)
    await expect(page.getByRole('heading', { level: 1, name: 'Samedi 26 septembre' })).toBeVisible()
  })

  test('la partie de 00:40 reste dans la soirée qui a commencé la veille', async ({ page }, testInfo) => {
    const plan = page.getByRole('region', { name: 'Plan de vol de la soirée' })
    const steps = plan.getByRole('button', { name: /^\d{2}:\d{2} · / })
    await expect(plan).toContainText('19:42 → 01:05')
    await expect(steps.first()).toHaveAccessibleName(/^19:42/)
    if (isNarrow(testInfo)) {
      // Jamais de défilement horizontal (charte) : 4 étapes par page sur mobile, la 5e derrière le chevron.
      await expect(steps).toHaveCount(4)
      await expect(plan).toContainText('parties 1–4 sur 5')
      await plan.getByRole('button', { name: 'Parties suivantes' }).click()
      await expect(steps).toHaveCount(1)
    } else {
      await expect(steps).toHaveCount(5)
    }
    await expect(steps.last()).toHaveAccessibleName(/^00:40/)
    const scrollers = await plan.evaluate((node) =>
      [...node.querySelectorAll('*')].filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).length
    )
    expect(scrollers).toBe(0)
  })

  test('navigation datée entre soirées', async ({ page }, testInfo) => {
    const nav = page.getByRole('navigation', { name: 'Soirées voisines' })
    await expect(nav.getByRole('link', { name: /Soirée précédente : Vendredi 25 septembre/ })).toBeVisible()
    await expect(nav.getByText('Suivante')).toBeVisible()
    if (!isNarrow(testInfo)) await expect(nav.locator('[aria-current="page"]')).toContainText('26')
    await nav.getByRole('link', { name: /Soirée précédente/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Vendredi 25 septembre' })).toBeVisible()
  })

  test('plan de vol : un clic met la partie en avant', async ({ page }) => {
    const step = page.getByRole('region', { name: 'Plan de vol de la soirée' }).getByRole('button', { name: /21:20.*top 1/ })
    await step.click()
    await expect(step).toHaveAttribute('aria-pressed', 'true')
  })

  test('cartes de fin de partie : place sur le lobby, chicken dinner, débriefing ou état', async ({ page }) => {
    const win = page.getByRole('article', { name: /21:20 · Erangel · place 1/ })
    await expect(win).toContainText('#1/25')
    await expect(win).toContainText('Chicken dinner')
    await expect(win.getByRole('link', { name: 'Débriefing' })).toHaveAttribute('href', /\/telemetry\/matches\/s26-3\/debrief/)
    const pending = page.getByRole('article', { name: /00:40/ })
    await expect(pending).toContainText('Télémétrie en attente')
    await expect(pending.getByRole('link', { name: 'État' })).toBeVisible()
    // Plus de jargon technique côté joueurs.
    await expect(page.getByText(/Parser OK|Fichier local/)).toHaveCount(0)
  })

  test('le thème clair s’applique (panneaux clairs)', async ({ page }) => {
    await page.evaluate(() => window.localStorage.setItem('pubg_app_theme', 'light'))
  // WebKit signale comme erreurs les requêtes interrompues par un rechargement : on attend la fin du réseau.
  await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Samedi 26 septembre' })).toBeVisible()
    // Le thème se pose avec le shell, qui n'apparaît qu'une fois la session lue : sous charge, la page peut encore
    // s'afficher sans lui. On attend la couleur au lieu de la lire une seule fois.
    const plan = page.getByRole('region', { name: 'Plan de vol de la soirée' })
    await expect.poll(() => plan.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)')
  })
})
