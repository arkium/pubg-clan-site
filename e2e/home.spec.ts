import type { TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { homeTournaments } from './support/data'
import { mockClanLeaderboard, mockHomeShowcase } from './support/pages'

/**
 * Vitrine publique de l'accueil (`/`, visiteur sans session) — docs/features/accueil.md.
 * Plein écran sans le shell, compteurs et kill feed, carrousel des Top 1, liens vers /join, /login et /clans, vocabulaire
 * d'inscription des clans (jamais de recrutement) ;
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

test('Lecture de zone, sous Discord : trois points et le lien vers la page', async ({ page }) => {
  const zone = page.getByRole('region', { name: /Pas la zone finale/ })
  await zone.scrollIntoViewIfNeeded()
  await expect(zone.getByRole('listitem')).toHaveCount(3)
  await expect(zone).toContainText('L’avion place le premier cercle')
  await expect(zone).toContainText('Vise le centre, pas la ligne')
  await expect(zone.getByRole('link', { name: 'Lire la zone →' })).toHaveAttribute('href', '/lecture-de-zone')
  // Juste après la section Discord, avant le pied de page.
  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('section[aria-labelledby]')].map((section) => section.getAttribute('aria-labelledby'))
    return ids.indexOf('home-zone-reading-title') - ids.indexOf('home-discord-title')
  })
  expect(order).toBe(1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
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

test('les appels à l’action parlent d’inscrire son clan, jamais de recrutement, et mènent à /join, /login et au mode visiteur', async ({ page }) => {
  // Le site suit les clans qui existent déjà dans PUBG : aucun texte ne doit ressembler à une annonce de recrutement.
  await expect(page.locator('body')).not.toContainText(/recrutement|rejoindre le squad|une place dans l.avion|demander à rejoindre/i)
  const signUp = page.getByRole('link', { name: 'Inscrire mon clan', exact: true }).filter({ visible: true })
  await expect(signUp.first()).toHaveAttribute('href', '#inscription')
  await signUp.first().click()
  const section = page.getByRole('region', { name: /Ton clan joue déjà/ })
  await expect(section).toBeInViewport()
  await expect(page.getByTestId('home-join-scope')).toHaveText('chickendinner.fr ne recrute pas : il suit les clans qui existent déjà dans PUBG.')
  await expect(section.getByRole('link', { name: 'Donner mon pseudo PUBG' })).toHaveAttribute('href', '/join')
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

// ── Tournois (maquette « Accueil - Tournois », 2026-10-08) ─────────────────────────────────────────────

const isUnder768 = (testInfo: TestInfo) => isMobile(testInfo)

async function overflowOf(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test('tournois : pastille « En direct » sur le lien et ticket du direct, avec le suivant', async ({ page }, testInfo) => {
  if (isNarrow(testInfo)) {
    const banner = page.getByTestId('home-tournament-banner')
    await expect(banner).toContainText('Tournoi en direct')
    await expect(banner).toContainText('Coupe d’automne 2026')
    await expect(banner).toContainText('5 manches')
    await expect(banner.getByRole('link', { name: /Suivre/ })).toHaveAttribute('href', '/tournaments/coupe-automne')
    await expect(page.getByTestId('home-tournament-ticket')).toBeHidden()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await expect(page.locator('#home-mobile-menu').getByRole('link', { name: /Tournois/ })).toContainText('En direct')
  } else {
    await expect(page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('link', { name: /Tournois/ })).toContainText('En direct')
    const ticket = page.getByTestId('home-tournament-ticket')
    await expect(ticket).toContainText('Tournoi en direct')
    await expect(ticket).toContainText('1er [LMT] La Meute')
    await expect(ticket).toContainText('5 manches')
    await expect(ticket).toContainText('Ensuite : Scrims du jeudi · dans 5 h')
    await expect(ticket.getByRole('link', { name: /Suivre/ })).toHaveAttribute('href', '/tournaments/coupe-automne')
    await expect(page.getByTestId('home-tournament-banner')).toBeHidden()
  }
  expect(await overflowOf(page)).toBeLessThanOrEqual(0)
})

test('tournois : le direct et son top 3, puis les prochains par pages de trois, avant les Chicken Dinners', async ({ page }, testInfo) => {
  const section = page.getByTestId('home-tournaments')
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByRole('heading', { name: 'En ce moment et à venir' })).toBeVisible()
  await expect(section.getByRole('link', { name: 'Tous les tournois' })).toHaveAttribute('href', '/tournaments')

  const live = page.getByTestId('home-tournament-live')
  await expect(live).toContainText('Coupe d’automne 2026')
  await expect(live).toContainText('9 clans en lice')
  await expect(live).toContainText('dernière manche il y a 22 min')
  await expect(live.getByRole('listitem')).toHaveCount(3)
  await expect(live.getByRole('listitem').first()).toContainText('[LMT] La Meute')
  await expect(live.getByRole('link', { name: 'Suivre le classement' })).toHaveAttribute('href', '/tournaments/coupe-automne')

  // Cartes à partir de 768 px, agenda en dessous ; trois tournois par page, le quatrième derrière les chevrons.
  const shown = isUnder768(testInfo) ? page.getByTestId('home-tournament-row') : page.getByTestId('home-tournament-card')
  const hidden = isUnder768(testInfo) ? page.getByTestId('home-tournament-card') : page.getByTestId('home-tournament-row')
  await expect(shown.filter({ visible: true })).toHaveCount(3)
  await expect(hidden.filter({ visible: true })).toHaveCount(0)
  await expect(shown.first()).toContainText('Scrims du jeudi')
  await expect(shown.first()).toContainText('dans 5 h')
  await expect(section).not.toContainText('Coupe d’hiver')
  await expect(section).toContainText('Pas d’inscription')

  const pager = section.getByRole('navigation', { name: 'Pages des prochains tournois' })
  await expect(pager).toContainText('1 / 2')
  await expect(pager.getByRole('button', { name: 'Tournois précédents' })).toBeDisabled()
  await pager.getByRole('button', { name: 'Tournois suivants' }).click()
  await expect(pager).toContainText('2 / 2')
  await expect(shown.filter({ visible: true })).toHaveCount(1)
  await expect(shown.first()).toContainText('Coupe d’hiver')
  await expect(pager.getByRole('button', { name: 'Tournois suivants' })).toBeDisabled()

  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('section[aria-labelledby]')].map((element) => element.getAttribute('aria-labelledby'))
    return ids.indexOf('home-dinner-title') - ids.indexOf('home-tournaments-title')
  })
  expect(order).toBe(1)
  expect(await overflowOf(page)).toBeLessThanOrEqual(0)
})

test('tournois : rien en cours, le prochain tournoi et le nombre de tournois à venir', async ({ api, page }, testInfo) => {
  api.on('GET', '/api/home/tournaments', { body: homeTournaments('upcoming') })
  await page.reload()
  await expect(page.getByTestId('home-dinner')).toBeVisible()
  await expect(page.getByTestId('home-tournaments').getByRole('heading', { name: 'Prochains tournois' })).toBeVisible()
  await expect(page.getByTestId('home-tournament-live')).toHaveCount(0)
  if (isNarrow(testInfo)) {
    const banner = page.getByTestId('home-tournament-banner')
    await expect(banner).toContainText('Prochain tournoi')
    await expect(banner).toContainText('dans 5 h')
    await expect(banner.getByRole('link', { name: /Voir/ })).toHaveAttribute('href', '/tournaments/scrims-jeudi')
  } else {
    await expect(page.getByRole('navigation', { name: 'Navigation publique' }).getByLabel('4 tournois à venir')).toBeVisible()
    const ticket = page.getByTestId('home-tournament-ticket')
    await expect(ticket).toContainText('Prochain tournoi')
    await expect(ticket).toContainText('Scrims du jeudi')
    await expect(ticket).toContainText('Puis : Solo Showdown #4 · dans 4 j')
  }
})

test('tournois : un tournoi à venir prend toute la largeur, deux se partagent la rangée, sans chevrons', async ({ api, page }, testInfo) => {
  test.skip(isUnder768(testInfo), 'cartes à partir de 768 px, agenda en dessous')
  const upcoming = homeTournaments('upcoming').upcoming
  const section = page.getByTestId('home-tournaments')
  const cards = page.getByTestId('home-tournament-card')
  const widthOf = async (index: number) => (await cards.nth(index).boundingBox())?.width ?? 0

  for (const count of [1, 2]) {
    api.on('GET', '/api/home/tournaments', { body: { live: [], upcoming: upcoming.slice(0, count), upcomingCount: count, results: [] } })
    await page.reload()
    await section.scrollIntoViewIfNeeded()
    await expect(cards).toHaveCount(count)
    const rowWidth = (await page.getByTestId('home-tournament-cards').boundingBox())?.width ?? 0
    // Une carte : toute la rangée ; deux : la moitié chacune (à l'écart près).
    expect(Math.abs((await widthOf(0)) * count - rowWidth)).toBeLessThanOrEqual(16)
    await expect(section.getByRole('navigation', { name: 'Pages des prochains tournois' })).toHaveCount(0)
  }
  expect(await overflowOf(page)).toBeLessThanOrEqual(0)
})

test('tournois : un tournoi terminé depuis moins de 3 jours, ses résultats seuls', async ({ api, page }) => {
  api.on('GET', '/api/home/tournaments', { body: homeTournaments('results') })
  await page.reload()
  await expect(page.getByTestId('home-dinner')).toBeVisible()
  const section = page.getByTestId('home-tournaments')
  await expect(section.getByRole('heading', { name: 'Derniers résultats' })).toBeVisible()
  const results = page.getByTestId('home-tournament-results')
  await expect(results).toContainText('Coupe d’été 2026')
  await expect(results).toContainText('Vainqueur')
  await expect(results).toContainText('Classement final')
  await expect(results.getByRole('listitem')).toHaveCount(3)
  await expect(results.getByRole('link', { name: 'Voir le classement final' })).toHaveAttribute('href', '/tournaments/coupe-ete')
  await expect(section).not.toContainText('Pas d’inscription')
  // Pas de direct ni de tournoi proche : ni ticket, ni bandeau, ni pastille.
  await expect(page.getByTestId('home-tournament-ticket')).toHaveCount(0)
  await expect(page.getByTestId('home-tournament-banner')).toHaveCount(0)
  expect(await overflowOf(page)).toBeLessThanOrEqual(0)
})

test('tournois : rien en direct, rien dans les 14 jours, aucun résultat récent, la vitrine n’en montre rien', async ({ api, page }, testInfo) => {
  api.on('GET', '/api/home/tournaments', { body: homeTournaments('none') })
  await page.reload()
  await expect(page.getByTestId('home-dinner')).toBeVisible()
  await expect(page.getByTestId('home-tournaments')).toHaveCount(0)
  await expect(page.getByTestId('home-tournament-ticket')).toHaveCount(0)
  await expect(page.getByTestId('home-tournament-banner')).toHaveCount(0)
  if (!isNarrow(testInfo)) {
    const link = page.getByRole('navigation', { name: 'Navigation publique' }).getByRole('link', { name: /Tournois/ })
    await expect(link).toHaveText('Tournois')
  }
})
