import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { mockClanLeaderboard, mockHomeShowcase } from './support/pages'

/**
 * Vitrine publique de l'accueil (`/`, visiteur sans session) — docs/features/accueil.md.
 * Plein écran sans le shell, compteurs et kill feed, carrousel des Top 1, liens vers /join, /login et /clans ;
 * entrée « Accueil » du menu latéral. Le cas « membre connecté » (« Mon espace ») exige une session en base : non couvert.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const isNarrow = (testInfo: TestInfo) => isMobile(testInfo) || testInfo.project.name === 'chromium-tablet'

test.beforeEach(async ({ api, page }) => {
  mockHomeShowcase(api)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('home-dinner')).toBeVisible()
})

test('la vitrine s’affiche en plein écran, sans le shell ni son pied de page', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: /Winner winner/i })).toBeVisible()
  await expect(page.locator('aside')).toHaveCount(0)
  await expect(page.locator('.app-footer')).toBeHidden()
  await expect(page.getByText('29 clans suivis · PC')).toBeVisible()
  await expect(page.locator('.home-footer').getByText(/KRAFTON, Inc\. Ce site est un projet communautaire non officiel/)).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('le pied de page de la vitrine mène aux pages légales', async ({ page }) => {
  const legal = page.locator('.home-footer').getByRole('navigation', { name: 'Informations légales' })
  await expect(legal.getByRole('link')).toHaveCount(3)
  await expect(legal.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales')
  await expect(legal.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite')
  await expect(legal.getByRole('link', { name: 'À propos' })).toHaveAttribute('href', '/a-propos')
})

test('« Nouveautés » : mortier et carte des ressources, chacune vers sa page', async ({ page }) => {
  const news = page.getByRole('region', { name: /deux nouveaux outils/ })
  await news.scrollIntoViewIfNeeded()
  await expect(news.getByRole('article')).toHaveCount(2)
  await expect(news.getByRole('link', { name: 'S’entraîner au mortier →' })).toHaveAttribute('href', '/mortier')
  await expect(news.getByRole('link', { name: 'Ouvrir la carte →' })).toHaveAttribute('href', '/carte-des-ressources')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('Discord : alertes Top 1, résultats de tournoi, réglages, et lien d’inscription', async ({ page }) => {
  const discord = page.getByRole('region', { name: /Ton Discord le sait déjà/ })
  await discord.scrollIntoViewIfNeeded()
  await expect(discord.getByRole('listitem')).toHaveCount(3)
  await expect(discord).toContainText('Alerte Chicken Dinner')
  await expect(discord).toContainText('Résultats de tournoi')
  await expect(discord.getByRole('link', { name: 'Inscrire mon clan →' })).toHaveAttribute('href', '/join')
})

test('le carrousel passe d’un Top 1 à l’autre, dans les deux sens', async ({ page }) => {
  const card = page.getByTestId('home-dinner')
  await expect(page.getByRole('heading', { name: 'Chicken Dinner de la semaine' }).or(page.getByRole('heading', { name: 'Derniers Chicken Dinners' }))).toBeVisible()
  await expect(card).toContainText('[ALFA] Clan ALFA')
  await expect(card).toContainText('Miramar')
  await expect(card).toContainText('31 min 42')
  await expect(card).toContainText('/ 26')
  await expect(card.getByRole('img', { name: 'MVP' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Top 1 suivant' }).click()
  await expect(page.getByText('2 / 3')).toBeVisible()
  await expect(card).toContainText('[ECHO] Clan ECHO')

  await page.getByRole('button', { name: 'Top 1 précédent' }).click()
  await page.getByRole('button', { name: 'Top 1 précédent' }).click()
  await expect(page.getByText('3 / 3')).toBeVisible()
  await expect(card).toContainText('Taego')
  await expect(card).not.toContainText('/ 26') // partie sans télémétrie : « #1 » seul
  await expect(card.getByRole('link', { name: /Revoir la partie/ })).toHaveAttribute(
    'href',
    '/clans/1/telemetry/matches/match-3/debrief'
  )
})

test('le kill feed nomme le tueur, jamais la victime', async ({ page }) => {
  const feed = page.getByRole('list', { name: 'Kill feed des dernières victoires' }).filter({ visible: true })
  await expect(feed).toContainText('Joueur Alpha')
  await expect(feed).toContainText('un joueur [ABC]')
  await expect(feed).toContainText('un adversaire')
  await expect(feed.locator('li')).toHaveCount(5)
})

test('les appels à l’action mènent à /join, /login et au mode visiteur', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Demander à rejoindre' })).toHaveAttribute('href', '/join')
  await expect(page.getByRole('link', { name: 'Parcourir en visiteur' })).toHaveAttribute('href', '/clans')
  await expect(page.getByRole('link', { name: 'Se connecter' }).filter({ visible: true })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: 'Voir le classement' })).toHaveAttribute('href', '/clans-leaderboard')
})

test('« Pourquoi atterrir ici » : Ligue, tournois et comparateur, chacun vers sa page', async ({ page }) => {
  const why = page.getByRole('region', { name: /Toute la scène PUBG francophone/ })
  await why.scrollIntoViewIfNeeded()
  await expect(why.getByRole('article')).toHaveCount(3)
  await expect(why.getByRole('link', { name: 'Voir la Ligue →' })).toHaveAttribute('href', '/clans-leaderboard')
  await expect(why.getByRole('link', { name: 'Voir les tournois →' })).toHaveAttribute('href', '/tournaments')
  await expect(why.getByRole('link', { name: 'Ouvrir le comparateur →' })).toHaveAttribute('href', '/clans/comparator')
  await expect(why.getByRole('article', { name: /Saute de l.avion/ })).toContainText('ZÉRO INSCRIPTION')
  // Textes vérifiés contre les pages : le comparateur compare des clans, la Ligue classe au Power score.
  await expect(why).not.toContainText('deux joueurs')
  await expect(why).toContainText('Power score')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('ordinateur : compteurs et navigation dans le héros', async ({ page }, testInfo) => {
  test.skip(isNarrow(testInfo), 'sous 1024 px, les compteurs et la navigation passent sous le héros et dans le menu')
  await expect(page.getByText('KILLS CETTE SEMAINE', { exact: true })).toBeVisible()
  await expect(page.getByText('399', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('link', { name: 'Tournois' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('link', { name: 'Les clans' })).toHaveAttribute('href', '/clans')
})

test('mobile et tablette : le menu ouvre la navigation publique', async ({ page }, testInfo) => {
  test.skip(!isNarrow(testInfo), 'navigation affichée dans le héros sur ordinateur')
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  const menu = page.locator('#home-mobile-menu')
  await expect(menu.getByRole('link', { name: 'Les clans' })).toHaveAttribute('href', '/clans')
  await expect(menu.getByRole('link', { name: 'Ligue des clans' })).toHaveAttribute('href', '/clans-leaderboard')
  await page.getByRole('button', { name: 'Fermer le menu' }).click()
  await expect(menu).toHaveCount(0)
})

test('ordinateur : l’entrée « Accueil » du menu latéral ramène à la vitrine', async ({ api, page }, testInfo) => {
  test.skip(isNarrow(testInfo), 'le menu latéral n’est affiché en permanence qu’à partir de 1024 px')
  mockClanLeaderboard(api)
  await page.goto('/clans/1/leaderboard')
  const home = page.locator('aside').getByRole('link', { name: 'Accueil' })
  await expect(home).toHaveAttribute('href', '/')
  await home.click()
  await expect(page.getByTestId('home-dinner')).toBeVisible()
  await expect(page.locator('aside')).toHaveCount(0)
})
