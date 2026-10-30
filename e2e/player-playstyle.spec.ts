import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { MEMBER_ID } from './support/data'
import { periodFilter, toolbar } from './support/layout'
import { mockPlayerDashboard } from './support/members'
import { mockMemberBodyZones } from './support/body-zones'
import { mockPlayerPlaystyle } from './support/player-playstyle'

/**
 * Style de jeu d'un joueur — docs/features/membres.md (page créée le 03/10/2026, selon la charte). La télémétrie du
 * joueur comparée au clan : profil par rôle avec rang, mobilité / cercle / survie, coopération par coéquipier.
 */

const section = (page: Page, name: string) => page.getByRole('region', { name })

async function openPlaystyle(page: Page) {
  await page.goto(`/members/${MEMBER_ID}/playstyle`)
  await expect(page.getByRole('heading', { level: 1, name: 'Style de jeu de Joueur Alpha' })).toBeVisible()
}

test.describe('style de jeu du joueur', () => {
  test.beforeEach(async ({ api, page }) => {
    mockPlayerPlaystyle(api)
    await openPlaystyle(page)
  })

  test('profil : score, moyenne du clan et rang par rôle', async ({ page }) => {
    const fragger = page.getByTestId('role-fragger')
    await expect(fragger).toContainText('82 %')
    await expect(fragger).toContainText('Moyenne du clan 61 %')
    await expect(fragger).toContainText('+21 pts vs clan')
    await expect(page.getByTestId('rank-fragger')).toHaveText('Meilleur du clan')
    await expect(page.getByTestId('role-medic')).toContainText('+14 pts vs clan')
    await expect(page.getByTestId('rank-medic')).toHaveText('2ᵉ sur 8 joueurs du clan')
    await expect(page.getByTestId('rank-ghost')).toHaveText('8ᵉ sur 8 joueurs du clan')
    await expect(toolbar(page).getByTestId('playstyle-context')).toHaveText('20 parties analysées · comparé à 8 joueurs du clan')
  })

  test('mobilité, cercle et survie : le joueur et le clan en regard', async ({ page }) => {
    const themes = section(page, 'Mobilité, cercle et survie')
    await expect(themes.getByRole('article')).toHaveCount(3)
    const circle = themes.getByRole('article', { name: 'Gestion du cercle' })
    await expect(circle.getByRole('columnheader', { name: 'Clan' })).toBeVisible()
    await expect(circle.getByRole('row', { name: /Premier contact/ })).toContainText('phase 2,4')
  })

  test('coopération : ses coéquipiers, du plus coopératif au moins coopératif', async ({ page }) => {
    const cooperation = section(page, 'Coopération')
    await expect(cooperation.getByRole('term').filter({ hasText: 'Réanimations' }).locator('..')).toContainText('25')
    const names = await cooperation.getByRole('table').getByRole('link').allTextContents()
    expect(names).toEqual(['Joueur Bravo', 'Joueur Charlie', 'Joueur Delta'])
    await expect(cooperation.getByRole('link', { name: 'Joueur Bravo' })).toHaveAttribute('href', '/members/2/playstyle')
  })

  test('aucune partie analysée sur la période : un message, pas de sections vides', async ({ page }) => {
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect(page.getByText('Aucune partie de Joueur Alpha analysée par la télémétrie ce mois')).toBeVisible()
    await expect(section(page, 'Profil de jeu')).toHaveCount(0)
    // Les liens « aller plus loin » restent.
    await expect(page.getByRole('link', { name: /Objets consommés/ })).toHaveAttribute('href', `/members/${MEMBER_ID}/items`)
  })

  test('meilleures formations : venues des statistiques par carte, sans le mode jamais joué', async ({ page }) => {
    const teams = section(page, 'Meilleures formations')
    await expect(teams.getByRole('article')).toHaveCount(2)
    await expect(teams.getByRole('article', { name: 'Meilleur squad' })).toContainText('Joueur Delta')
    await expect(teams.getByRole('article', { name: 'Meilleur duo' })).toContainText('19,2 %')
    await expect(page.getByRole('link', { name: /Statistiques par carte/ })).toHaveAttribute('href', `/members/${MEMBER_ID}/map-stats`)
  })

  test('aucun défilement horizontal', async ({ page }) => {
    await expect(section(page, 'Coopération').getByRole('table')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test('le tableau de bord mène au style de jeu par la carte « Profil de jeu »', async ({ api, page }) => {
  mockPlayerDashboard(api)
  await page.goto(`/members/${MEMBER_ID}/dashboard`)
  const link = page.getByRole('article', { name: 'Profil de jeu' }).getByRole('link', { name: 'Détail →' })
  await expect(link).toHaveAttribute('href', `/members/${MEMBER_ID}/playstyle`)
})

// Zones d'impact (docs/TODO/zones-d-impact.md ; maquette « Zones-impact » de Claude Design) : section après
// « Mobilité, cercle et survie », sans ancre.
test.describe('style de jeu du joueur — zones d’impact', () => {
  test('semaine : deux panneaux, « vs clan », bande des 8 semaines et évolution', async ({ api, page }) => {
    mockPlayerPlaystyle(api)
    await openPlaystyle(page)

    const zones = section(page, 'Zones d’impact')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('190 touches · 13 % à la tête')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('Tête25 · 13 %')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('+ 340 dégâts non localisés')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('8,3 touches par partie · 23 partie(s) mesurée(s)')
    await expect(zones.getByTestId('body-zones-taken')).toContainText('160 touches · 12 % à la tête')
    await expect(zones.getByTestId('body-zones-taken')).toContainText('Haut du corps 65 % · bras et jambes 25 %')
    await expect(zones.getByTestId('body-zones-vs-clan-dealt')).toHaveText('vs clanTête : 13 % · clan 11 % · +2 pts')
    // Moins touché à la tête que le clan : à son avantage, en vert.
    await expect(zones.getByTestId('body-zones-vs-clan-taken').locator('b')).toHaveText('−2 pts')
    await expect(zones.getByTestId('body-zones-vs-clan-taken').locator('b')).toHaveAttribute('style', /--theme-ui-positive/)
    await expect(zones.getByTestId('body-zones-weeks-trend')).toHaveText('▲ 2 pts vs semaine précédente')
    await expect(zones.getByTestId('body-zones-weeks')).toContainText('S37S38S39S40S41S42S43S44')
    // S40 sous l'échantillon : dessinée vide.
    await expect(zones.getByTestId('body-zones-weeks').locator('span[title^="S40"]')).toHaveClass(/border-dashed/)
    await expect(zones.getByRole('heading', { name: 'Zones d’impact' })).toBeVisible()

    // Aucun défilement horizontal, mobile compris.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('« Tous » : depuis le 13 septembre 2026, aucune évolution', async ({ api, page }) => {
    mockPlayerPlaystyle(api)
    await openPlaystyle(page)
    await periodFilter(page).getByRole('button', { name: 'Tous' }).click()

    const zones = section(page, 'Zones d’impact')
    await expect(zones.getByText('Parties analysées depuis le 13 septembre 2026')).toBeVisible()
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('à la tête')
    await expect(zones.getByTestId('body-zones-weeks-trend')).toHaveCount(0)
  })

  test('échantillon faible : taux en gris, aucune évolution ; rien de mesuré : état vide, jamais un zéro', async ({ api, page }) => {
    mockPlayerPlaystyle(api)
    mockMemberBodyZones(api, 'low-sample')
    await openPlaystyle(page)

    const zones = section(page, 'Zones d’impact')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('Échantillon faible')
    await expect(zones.getByTestId('body-zones-dealt')).toContainText('12 touches, 30 au moins pour un taux')
    await expect(zones.getByTestId('body-zones-vs-clan-dealt')).toHaveText('vs clanTête : échantillon faible · clan 11 %')
    await expect(zones.getByTestId('body-zones-weeks-trend')).toHaveCount(0)

    mockMemberBodyZones(api, 'empty')
    await page.reload()
    await expect(section(page, 'Zones d’impact').getByTestId('body-zones-empty')).toContainText('Aucune touche localisée sur la période')
    await expect(section(page, 'Zones d’impact').getByTestId('body-zones-dealt')).toHaveCount(0)
  })
})
