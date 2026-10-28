import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { expectCalculationHelp } from './support/calculation-help'
import { mockPlayers } from './support/pages'
import { mockMemberSession } from './support/session'
import { clickInPlace, dock, periodFilter, toolbar } from './support/layout'

/**
 * Page Joueurs — docs/features/joueurs.md (maquette Claude Design « Joueurs », 2026-10-12). Classement inter-clans :
 * podium, meilleurs par rôle, liste paginée par 10 qui commence au 4e, critères (stats et rôles), flèches (aucune pour
 * « Tous »), recherche et filtre de clan, semaine sans assez de classés, mode Duo ; comparateur : sélection par cases
 * à cocher ou par recherche, meilleures valeurs, radar, duels, lecture ; membre connecté : « Mon rang » et raccourcis.
 * Toutes les API sont simulées (e2e/support/players.ts).
 */

/** Menu latéral visible à partir de 1 024 px ; en dessous, le tiroir. */
const isDesktopNav = (testInfo: TestInfo) => testInfo.project.name === 'chromium-desktop'

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

/** Lignes du classement affichées : tableau à partir de 768 px, cartes en dessous. */
const listItems = (page: Page) => page.locator('[id^="player-row-"], [id^="player-card-"]').filter({ visible: true })

async function openRanking(page: Page) {
  await page.goto('/players')
  await expect(page.getByRole('heading', { level: 1, name: 'Joueurs' })).toBeVisible()
  await expect(page.getByTestId('player-podium-1')).toBeVisible()
}

/** Mode : segmented du bandeau (seconde ligne sur mobile). */
async function chooseMode(page: Page, label: string) {
  await toolbar(page).getByRole('group', { name: 'Mode' }).getByRole('button', { name: label, exact: true }).click()
}

/** Critère : liste déroulante « Classer par » du bandeau. */
async function chooseCriterion(page: Page, label: string) {
  await toolbar(page).getByRole('button', { name: /^Classer par :/ }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

test.describe('Joueurs — classement (visiteur)', () => {
  test.beforeEach(async ({ api, page }) => {
    mockPlayers(api)
    await openRanking(page)
  })

  test('podium de la semaine (période par défaut), meilleurs par rôle, liste paginée par 10 à partir du 4e', async ({ api, page }) => {
    expect(api.paramValues('/api/players/ranking', 'period')).toContain('week')
    await expect(page.getByTestId('player-podium-1')).toContainText('Ravek')
    await expect(page.getByTestId('player-podium-1').getByLabel('Premier')).toBeVisible()
    // Plaque de score des tournois : la valeur, l'unité du critère, puis parties et Top 1.
    await expect(page.getByTestId('player-podium-1').locator('.podium-plate')).toContainText('450 dégâts')
    await expect(page.getByTestId('player-podium-2')).toContainText('1 Top 1')
    // Nom en texte simple (pas de badge) et tag du clan à côté.
    await expect(page.locator('#players-panel-ranking .app-player-name-badge')).toHaveCount(0)
    await expect(listItems(page).first()).toContainText('[DEMO]')
    // Badge Fragger / Medic / Ghost ; la règle des classés dans le bloc de recherche, sous la phrase du critère.
    await expect(listItems(page).first().getByTestId('roster-role-badge')).toHaveText('Fragger')
    await expect(page.getByRole('region', { name: 'Recherche et filtre' })).toContainText('Classés : les joueurs avec au moins 10 parties de clan')
    await expect(page.getByRole('region', { name: 'Recherche et filtre' }).getByRole('link', { name: 'le guide de calcul' })).toBeVisible()
    await expect(page.getByTestId('players-freshness')).toContainText('30 classés cette semaine · 510 joueurs de 33 clans suivis')
    await expect(page.getByRole('button', { name: /^Medic : Pixos, 97 sur 100/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Classement · 4 à 30/ })).toBeVisible()
    await expect(listItems(page)).toHaveCount(10)
    await expect(listItems(page).first()).toContainText('Xanor')
    await expect(page.getByRole('navigation', { name: 'Pages du classement' })).toContainText('Joueurs 1–10 sur 27')
    await page.getByRole('navigation', { name: 'Pages du classement' }).getByRole('button', { name: '2', exact: true }).click()
    // Page 1 : rangs 4 à 13 ; page 2 : à partir du 14e.
    await expect(listItems(page).first()).toContainText('Magane97')
    await expectNoHorizontalScroll(page)
  })

  test('un rôle reclasse le podium et la liste ; flèches ▲▼ et « nouv. », aucune pour « Tous »', async ({ page }) => {
    await page.getByRole('button', { name: /^Tireur à distance : Griar/ }).click()
    await expect(page.getByRole('region', { name: 'Podium · Rôle Tireur à distance' })).toBeVisible()
    await expect(page.getByTestId('player-podium-1')).toContainText('Griar')
    await expect(page.getByTestId('player-podium-1').locator('.podium-plate')).toContainText('98 / 100')
    // Le badge ne suit pas le critère (Xanor reste Fragger, classé au rôle Tireur) ; un score « N / 100 » tient sur une ligne.
    await page.getByRole('searchbox', { name: 'Rechercher un pseudo' }).fill('Xanor')
    await expect(listItems(page)).toHaveCount(1)
    await expect(listItems(page).first().getByTestId('roster-role-badge')).toHaveText('Fragger')
    await expect(listItems(page).first().getByTestId('player-value')).toContainText('/ 100')
    expect((await listItems(page).first().getByTestId('player-value').boundingBox())?.height ?? 0).toBeLessThan(28)
    // Le badge suit la période : depuis le début, le meilleur rôle de Xanor est Medic.
    await periodFilter(page).getByRole('button', { name: 'Tous', exact: true }).click()
    await expect(listItems(page).first().getByTestId('roster-role-badge')).toHaveText('Medic')
    await periodFilter(page).getByRole('button', { name: 'Mois', exact: true }).click()
    await expect(listItems(page).first().getByTestId('roster-role-badge')).toHaveText('Fragger')
    await page.getByRole('button', { name: 'Effacer la recherche' }).click()
    await expect(page.getByTestId('criterion-summary')).toContainText('Tireur à distance : score sur 100')
    await page.getByRole('button', { name: /^Fragger : Ravek/ }).click()
    await expect(page.getByTestId('player-podium-1')).toContainText('Ravek')
    // Dégâts : Xanor (4e) était 2e le mois dernier (▼2) ; Mokito n'était pas classé (« nouv. »).
    await chooseCriterion(page, 'Dégâts')
    await expect(page.locator('[id="player-row-105"], [id="player-card-105"]').filter({ visible: true })).toContainText('nouv.')
    await expect(page.locator('[id="player-row-103"], [id="player-card-103"]').filter({ visible: true })).toContainText('▼2')
    await periodFilter(page).getByRole('button', { name: 'Tous', exact: true }).click()
    await expect(page.getByTestId('players-freshness')).toContainText('depuis le début')
    await expect(listItems(page).first()).not.toContainText('▲')
    await expect(listItems(page).first()).not.toContainText('nouv.')
  })

  test('recherche sans accents et filtre de clan sur tous les classés', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Rechercher un pseudo' }).fill('pepa')
    await expect(page.getByRole('heading', { name: /Résultats/ })).toContainText('1 joueur sur 30 classés')
    await expect(listItems(page)).toHaveCount(1)
    await expect(listItems(page).first()).toContainText('Pépane44')
    await page.getByRole('button', { name: 'Effacer la recherche' }).click()
    await page.getByRole('button', { name: /^Clan : tous les clans/ }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un clan' }).fill('ratz')
    await page.getByRole('menuitemradio', { name: /Les-Ratz/ }).click()
    await expect(page.getByRole('heading', { name: /Résultats/ })).toContainText('sur 30 classés')
    for (const item of await listItems(page).all()) await expect(item).toContainText('[RATZ]')
    await expectNoHorizontalScroll(page)
  })

  test('semaine sans assez de classés (Squad) : message, puis retour au mois', async ({ api, page }) => {
    await chooseMode(page, 'Squad')
    await expect(page.getByTestId('players-not-enough')).toContainText('Pas encore assez de parties cette semaine')
    await expect(page.getByTestId('players-not-enough')).toContainText('5 joueurs ont au moins 10 parties de clan cette semaine')
    await expect(page.getByTestId('player-podium-1')).toHaveCount(0)
    await page.getByRole('button', { name: 'Voir le classement du mois' }).click()
    await expect(page.getByTestId('player-podium-1')).toBeVisible()
    expect(api.paramValues('/api/players/ranking', 'period')).toEqual(expect.arrayContaining(['week', 'month']))
  })

  test('mode Duo : rechargement avec le mode, résultats précédents estompés', async ({ api, page }) => {
    await chooseMode(page, 'Duo')
    await expect(page.getByTestId('player-podium-1')).toContainText('475')
    expect(api.paramValues('/api/players/ranking', 'mode')).toContain('duo')
  })

  test('podium sans tampon, titre en évidence ; tri par la liste déroulante du bandeau, aussi docké', async ({ page }) => {
    const podium = page.getByRole('region', { name: 'Podium · Dégâts moyens' })
    await expect(podium).toContainText('Podium· Dégâts moyens')
    await expect(page.getByText('Winner winner chicken dinner')).toHaveCount(0)
    await expect(toolbar(page).getByRole('button', { name: 'Classer par : Dégâts' })).toBeVisible()
    await chooseCriterion(page, 'Kills')
    await expect(page.getByRole('region', { name: 'Podium · Kills moyens' })).toBeVisible()
    // Bandeau docké (sur mobile aussi) : la liste reste là, on change de tri sans remonter.
    await dock(page, 900)
    const trigger = toolbar(page).getByRole('button', { name: 'Classer par : Kills' })
    await expect(trigger).toBeVisible()
    await clickInPlace(page, trigger)
    await clickInPlace(page, page.getByRole('menuitem', { name: 'Medic', exact: true }))
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    await expect(toolbar(page).getByRole('button', { name: 'Classer par : Medic' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Podium · Rôle Medic' })).toHaveCount(1)
    await expectNoHorizontalScroll(page)
  })

  test('guide de calcul replié en bas de page, dans le HTML : « Afficher » le déplie, le lien du haut l’ouvre et y descend', async ({ page }) => {
    const guide = await expectCalculationHelp(page, 'players-scoring-guide', 'Classé à partir de 10 parties')
    await page.getByRole('link', { name: 'Comment c’est calculé ?' }).click()
    await expect(guide).toHaveJSProperty('open', true)
    await expect(guide).toBeInViewport()
    await expect(page).toHaveURL(/#guide-calcul$/)
    await expect(guide.getByText('Classé à partir de 10 parties')).toBeVisible()
    await expect(guide).toContainText('Tireur à distance — distance des kills et headshots')
    await expectNoHorizontalScroll(page)
  })

  test('menu : « Joueurs » juste sous « Ligue », actif sur la page, une seule icône', async ({ page }, testInfo) => {
    let nav = page.locator('aside').first().locator('nav')
    if (!isDesktopNav(testInfo)) {
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      nav = page.locator('#mobile-clan-nav nav')
    }
    const names = await nav.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('title')))
    expect(names.indexOf('Joueurs')).toBe(names.indexOf('Ligue') + 1)
    const link = nav.getByRole('link', { name: 'Joueurs' })
    await expect(link).toHaveAttribute('href', '/players')
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(link.locator('svg')).toHaveCount(1)
  })
})

test.describe('Joueurs — comparateur (visiteur)', () => {
  test('cocher deux joueurs puis « Comparer la sélection » : tableau, meilleures valeurs, radar, duels, lecture', async ({ api, page }) => {
    mockPlayers(api)
    await openRanking(page)
    await page.getByRole('checkbox', { name: 'Comparer Xanor' }).filter({ visible: true }).check()
    await page.getByRole('checkbox', { name: 'Comparer Pixos' }).filter({ visible: true }).check()
    await page.getByRole('button', { name: 'Comparer la sélection' }).click()
    await expect(page).toHaveURL(/tab=compare/)
    await expect(page).toHaveURL(/ids=103%2C106|ids=103,106/)
    await expect(page.getByTestId('compare-head-1')).toContainText('Xanor')
    await expect(page.getByTestId('compare-head-2')).toContainText('Pixos')
    await expect(page.getByTestId('compare-head-1')).toContainText('Arme la plus jouée : UMP45')
    // Dégâts : Xanor (441) devant Pixos (432).
    await expect(page.getByTestId('compare-row-avgDamage').getByLabel('Meilleur')).toHaveCount(1)
    await expect(page.getByRole('img', { name: 'Profil par rôle des éléments comparés' })).toBeVisible()
    await expect(page.getByTestId('duel')).toContainText('Ces joueurs ne se sont jamais croisés.')
    await expect(page.getByTestId('compare-reading').getByRole('listitem')).toHaveCount(2)
    await expectNoHorizontalScroll(page)
  })

  test('comparateur vide, puis deux joueurs choisis par la recherche ; un 3e joueur sous le seuil reste indicatif', async ({ api, page }) => {
    mockPlayers(api)
    await page.goto('/players?tab=compare')
    await expect(page.getByTestId('compare-empty')).toContainText('Choisis au moins deux joueurs')
    await page.getByRole('searchbox', { name: /^Joueur 1 :/ }).fill('rave')
    await page.getByRole('menuitem', { name: /Ravek/ }).click()
    await page.getByRole('searchbox', { name: /^Joueur 2 :/ }).fill('arcos')
    await page.getByRole('menuitem', { name: /Arcos/ }).click()
    await expect(page.getByTestId('compare-head-2')).toContainText('Arcos')
    await expect(page.getByTestId('duel')).toContainText('Ravek et Arcos · 3 éliminations')
    await expect(page.getByTestId('duel')).toContainText('Dernière rencontre : 3 oct., Erangel. Ravek a éliminé Arcos.')
    await page.getByRole('button', { name: 'Ajouter un 3e joueur' }).click()
    await page.getByRole('searchbox', { name: /^Joueur 3 :/ }).fill('lemon')
    await page.getByRole('menuitem', { name: /Lemon/ }).click()
    await expect(page.getByTestId('compare-unqualified')).toContainText('Lemon a 4 parties de clan cette semaine : moins de 10')
    await expect(page.getByTestId('compare-head-3')).toContainText('Lemon')
    expect(api.paramValues('/api/players/compare', 'ids')).toContain('100,101,300')
    await page.getByRole('button', { name: 'Retirer Lemon' }).click()
    await expect(page.getByTestId('compare-head-3')).toHaveCount(0)
    await expectNoHorizontalScroll(page)
  })
})

test.describe('Joueurs — membre connecté', () => {
  test('« Mon rang » : carte, pastille qui amène à ma ligne ; raccourcis « Moi » et moyenne de mon clan', async ({ api, page }) => {
    mockMemberSession(api)
    mockPlayers(api)
    await openRanking(page)
    await expect(page.getByTestId('my-rank')).toContainText('#15')
    await expect(page.getByTestId('my-rank')).toContainText('sur 30 classés')
    await expect(page.getByTestId('my-rank')).toContainText('À 3 de Magane97 [RATZ], juste devant (#14).')
    await toolbar(page).getByTestId('mine-chip').click()
    const mine = page.locator('[id="player-row-1"], [id="player-card-1"]').filter({ visible: true })
    await expect(mine).toBeInViewport()
    await expect(mine).toContainText('MOI')
    await page.getByRole('tab', { name: /Comparateur/ }).click()
    await page.getByTestId('compare-picker-1').getByRole('button', { name: 'Moi' }).click()
    await page.getByTestId('compare-picker-2').getByRole('button', { name: 'La moyenne de mon clan' }).click()
    await expect(page.getByTestId('compare-head-1')).toContainText('Joueur Alpha')
    await expect(page.getByTestId('compare-head-2')).toContainText('Moyenne Clan Démo')
    await expect(page.getByText('Pas de duels avec une moyenne de clan.')).toBeVisible()
  })
})
