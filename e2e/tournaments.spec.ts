import type { Locator, Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { appHeader, dock, toolbar } from './support/layout'
import {
  LIVE_TOURNAMENT_ID,
  SOLO_TOURNAMENT_ID,
  UPCOMING_TOURNAMENT_ID,
  liveTournamentStandings,
  mockTournaments,
  signInAsMember,
} from './support/tournaments'

/**
 * Tournois — docs/features/tournois.md, « Pages joueurs » (maquette « Tournois », 2026-09-27). Le mode d'abord : cartes
 * de mode (légende et filtre), direct en grand avec le classement en cours, à venir, palmarès dont le vainqueur suit le
 * mode ; page d'un tournoi avec bandeau collant (exception mobile), podium, classement avec forme, manches une par une.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const modeCards = (page: Page) => page.getByRole('region', { name: 'Modes de tournoi' })
const palmares = (page: Page) => page.getByRole('region', { name: 'Palmarès' })
const phaseBadge = (page: Page) => page.getByTestId('tournament-phase')
const roundPicker = (page: Page) => page.locator('#tournament-rounds').getByRole('group', { name: 'Choisir une manche' })

/** Teintes Tailwind en dur interdites par la charte (docs/ui/index.html, « Interdits »). */
const HARD_CODED_COLOR = /\b(?:bg|text|border)-(?:red|sky|amber|emerald|rose|blue|indigo|orange|yellow)-\d{2,3}\b/

/** Couleur de fond calculée de l'élément, et celle du jeton `--theme-ui-accent` à sa place. */
async function backgroundAndAccent(locator: Locator) {
  return locator.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--theme-ui-accent)'
    element.parentElement?.appendChild(probe)
    const accent = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { background: getComputedStyle(element).backgroundColor, accent }
  })
}

/** Débordement horizontal de la page, et blocs de la page qui défilent de côté (charte : jamais). */
async function horizontalScroll(page: Page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollers: [...document.querySelectorAll('.app-main-flush *')]
      .filter((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className.toString().slice(0, 80)),
  }))
}

test.beforeEach(({ api }) => {
  mockTournaments(api)
})

test.describe('liste', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournaments')
    // Le shell remonte la page quand la session arrive (WebKit) : un clic fait avant serait perdu.
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1, name: 'Tournois' })).toBeVisible()
    await expect(modeCards(page)).toBeVisible()
  })

  test('en direct, à venir et palmarès, compteurs du bandeau d’image', async ({ page }) => {
    await expect(page.getByText('1 en direct')).toBeVisible()
    await expect(page.getByText('2 à venir')).toBeVisible()
    await expect(page.getByText('3 terminés')).toBeVisible()

    const live = page.getByRole('link', { name: /Coupe d’automne, en direct/ })
    await expect(live).toHaveAttribute('href', `/tournaments/${LIVE_TOURNAMENT_ID}`)
    await expect(live).toContainText('Classement en cours')
    await expect(live).toContainText('[LMT] La Meute')
    await expect(live).toContainText('il y a 22 min')

    const upcoming = page.getByRole('region', { name: 'À venir' })
    await expect(upcoming).toContainText('Scrims du jeudi')
    await expect(upcoming).toContainText(/dans [45] h/)
  })

  test('le vainqueur du palmarès suit le mode : joueur, équipe ou clan', async ({ page }) => {
    const rows = palmares(page).getByRole('link')
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: 'Solo Showdown' })).toContainText('[RATZ] Nova')
    await expect(rows.filter({ hasText: 'Mix & Match #1' })).toContainText('équipe mixte de 3 clans')
    await expect(rows.filter({ hasText: 'Coupe d’été' })).toContainText('7 clans en lice')
    // Plus aucun « clans engagés » quel que soit le mode.
    await expect(page.getByText(/clans? engagés?/)).toHaveCount(0)
  })

  test('une carte de mode filtre, un second clic retire le filtre', async ({ page }) => {
    const solo = modeCards(page).getByRole('button', { name: /Solo/ })
    await expect(solo).toContainText('1')
    await solo.click()
    await expect(solo).toHaveAttribute('aria-pressed', 'true')
    await expect(palmares(page).getByRole('link')).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Coupe d’automne, en direct/ })).toHaveCount(0)
    await solo.click()
    await expect(palmares(page).getByRole('link')).toHaveCount(3)
  })

  test('recherche et statut dans le bandeau, sans émoji', async ({ page }) => {
    await expect(toolbar(page).getByRole('button', { name: 'En direct', exact: true })).toBeVisible()
    await expect(toolbar(page)).not.toContainText(/🔥|⏳|🏁/u)
    await toolbar(page).getByRole('button', { name: 'Terminés' }).click()
    await expect(page.getByRole('region', { name: 'À venir' })).toHaveCount(0)
    await toolbar(page).getByRole('searchbox').fill('meute')
    await expect(palmares(page).getByRole('link')).toHaveCount(1)
    await expect(palmares(page)).toContainText('Coupe d’été')
  })

  test('« Comment ça marche ? » : quatre lignes, repliées', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /Comment ça marche/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByRole('listitem').filter({ hasText: 'parties personnalisées' })).toBeVisible()
    await expect(toggle.locator('xpath=following-sibling::ol/li')).toHaveCount(4)
  })

  test('le bandeau docke, y compris sur mobile (exception sticky.md §2)', async ({ page }) => {
    // WebKit hydrate le shell (session, navigation) après le contenu : attendre qu'il soit posé avant de mesurer le seuil.
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page).getByRole('searchbox')).toBeVisible()
  })
})

test('connecté : la liste situe ton clan dans le direct', async ({ api, page }) => {
  signInAsMember(api)
  await page.goto('/tournaments')
  await expect(page.getByText('Ton clan est 2e, à 6 pts de [LMT] La Meute')).toBeVisible()
})

test.describe('détail d’un tournoi inter-clans', () => {
  test.beforeEach(async ({ api, page }) => {
    signInAsMember(api)
    await page.goto(`/tournaments/${LIVE_TOURNAMENT_ID}`)
    // Le shell remonte la page quand la session arrive (WebKit) : un clic fait avant serait perdu.
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1, name: 'Coupe d’automne' })).toBeVisible()
  })

  test('« en direct » à l’accent de la charte, aucune couleur en dur dans l’en-tête', async ({ page }) => {
    await expect(phaseBadge(page)).toHaveText('EN DIRECT')
    await expect(phaseBadge(page)).toHaveAttribute('data-phase', 'live')
    // Plus de pastille rouge : l'accent plein (charte §1.2), comme la carte « en direct » de la liste.
    const { background, accent } = await backgroundAndAccent(phaseBadge(page))
    expect(background).toBe(accent)
    const classes = await page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }).evaluate((header) =>
      [header, ...header.querySelectorAll('*')].map((element) => element.getAttribute('class') ?? '').join(' ')
    )
    expect(classes).not.toMatch(HARD_CODED_COLOR)
    await expect(page.getByRole('heading', { level: 1 })).toHaveClass(/\bt-banner-title\b/)
  })

  test('aucun défilement horizontal, tableau et manches compris', async ({ page }) => {
    expect(await horizontalScroll(page)).toEqual({ page: 0, scrollers: [] })
  })

  test('le mode est dit en clair, la place du lecteur est dans le bandeau', async ({ page }) => {
    await expect(page.getByText(/Inter-clans :\s*Une ligne par clan/)).toBeVisible()
    await expect(page.getByTestId('tournament-viewer-position')).toContainText('Ton clan : 2e')
    await expect(page.getByTestId('tournament-viewer-position')).toContainText('à 6 pts du 1er')
    await expect(toolbar(page).getByRole('link', { name: 'Classement' })).toHaveAttribute('href', '#tournament-standings')
    // Sans droit d'organisateur : ni synchronisation ni diffusion.
    await expect(page.getByRole('button', { name: 'Synchroniser PUBG' })).toHaveCount(0)
  })

  test('classement : ta ligne surlignée, forme par manche, MVP', async ({ page }, testInfo) => {
    const mine = page.locator('tr[aria-current="true"]')
    await expect(mine).toContainText('[DEMO] Clan Démo')
    await expect(mine).toContainText('Ton clan')
    if (!isMobile(testInfo)) {
      await expect(mine.locator('.tournament-place')).toHaveCount(5)
      await expect(mine.locator('.tournament-place--win')).toHaveCount(1)
      // #1 en accent plein (« #1 jaune à encre sombre », comme PlacementBadge sous la charte).
      const { background, accent } = await backgroundAndAccent(mine.locator('.tournament-place--win'))
      expect(background).toBe(accent)
    }
    // Charte §3 : aucun texte sous 11 px, places de la forme et des manches comprises.
    const sizes = await page.locator('.tournament-place').evaluateAll((places) => places.map((place) => parseFloat(getComputedStyle(place).fontSize)))
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
    await expect(page.getByText('MVP du tournoi')).toBeVisible()
  })

  test('détail par escouade, gardé en inter-clans', async ({ page }) => {
    await page.getByRole('button', { name: 'Détail par escouade' }).click()
    await expect(page.locator('#tournament-standings tbody tr')).toHaveCount(1)
    await page.getByRole('button', { name: 'Cumul par clan' }).click()
    await expect(page.locator('#tournament-standings tbody tr')).toHaveCount(4)
  })

  test('manches une par une, la dernière d’abord, avec le lien vers le débrief', async ({ page }) => {
    const rounds = page.locator('#tournament-rounds')
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 5')
    await rounds.getByRole('button', { name: 'Manche précédente' }).click()
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 4')
    await rounds.getByRole('button', { name: 'M1', exact: true }).click()
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 1')
    await expect(rounds.getByRole('button', { name: 'Manche précédente' })).toBeDisabled()
    await expect(rounds.getByRole('link', { name: /Débrief 2D/ })).toHaveAttribute('href', `/tournaments/${LIVE_TOURNAMENT_ID}/matches/match-1`)
  })

  test('barème en barres et règles, escouades mixtes en inter-clans', async ({ page }) => {
    const rules = page.locator('#tournament-rules')
    await expect(rules.getByRole('listitem')).toHaveCount(10)
    await expect(rules).toContainText('Escouades mixtes')
    await expect(rules).toContainText('partage intégral')
  })

  test('le bandeau docke avec ses ancres, y compris sur mobile', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page).getByRole('link', { name: 'Manches' })).toBeVisible()
    await expect(page.getByTestId('tournament-viewer-position')).toBeVisible()
    // Docké, une seule ligne (charte §6), 375 px compris : ancres et place du lecteur sur la même ligne.
    const centers = await Promise.all(
      [
        toolbar(page).getByRole('link', { name: 'Classement' }),
        toolbar(page).getByRole('link', { name: 'Barème' }),
        page.getByTestId('tournament-viewer-position'),
      ].map(async (locator) => {
        const box = await locator.boundingBox()
        return box ? box.y + box.height / 2 : Number.NaN
      })
    )
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(4)
  })
})

test('douze manches : puces paginées, forme bornée, aucun défilement horizontal', async ({ api, page }, testInfo) => {
  signInAsMember(api)
  api.on('GET', `/api/tournaments/${LIVE_TOURNAMENT_ID}/standings`, { body: liveTournamentStandings(12) })
  await page.goto(`/tournaments/${LIVE_TOURNAMENT_ID}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1, name: 'Coupe d’automne' })).toBeVisible()

  // La première, la courante et ses voisines, la dernière : « … » entre elles (charte, « Pagination »).
  const chips = roundPicker(page).getByRole('button', { name: /^M\d+$/ })
  await expect(chips).toHaveText(['M1', 'M11', 'M12'])
  await roundPicker(page).getByRole('button', { name: 'M1', exact: true }).click()
  await expect(page.locator('#tournament-rounds').getByRole('article')).toHaveAttribute('aria-label', 'Manche 1')
  await expect(chips).toHaveText(['M1', 'M2', 'M12'])
  await roundPicker(page).getByRole('button', { name: 'Manche suivante' }).click()
  await expect(chips).toHaveText(['M1', 'M2', 'M3', 'M12'])

  if (!isMobile(testInfo)) {
    // Forme bornée aux dernières manches : 5 sous 1 024 px, 10 au-delà.
    const visible = await page
      .locator('tr[aria-current="true"] .tournament-place')
      .evaluateAll((places) => places.filter((place) => place.getClientRects().length > 0).length)
    expect(visible).toBe(testInfo.project.name === 'chromium-tablet' ? 5 : 10)
  }
  expect(await horizontalScroll(page)).toEqual({ page: 0, scrollers: [] })
})

test('tournoi à venir : état neutre, classement vide sans invitation à synchroniser', async ({ api, page }) => {
  signInAsMember(api)
  await page.goto(`/tournaments/${UPCOMING_TOURNAMENT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Scrims du jeudi' })).toBeVisible()
  // Le shell remonte la page quand la session arrive (WebKit) : attendre qu'elle soit stable avant de lire le classement.
  await page.waitForLoadState('networkidle')
  await expect(phaseBadge(page)).toHaveText('À VENIR')
  await expect(phaseBadge(page)).not.toHaveClass(HARD_CODED_COLOR)
  const { background, accent } = await backgroundAndAccent(phaseBadge(page))
  expect(background).not.toBe(accent)
  await expect(page.getByText(/commence dans [45] h/)).toBeVisible()
  const standings = page.locator('#tournament-standings')
  await expect(standings).toContainText('Le tournoi n’a pas commencé')
  await expect(standings).not.toContainText('synchronisation')
  await expect(toolbar(page).getByRole('link', { name: 'Manches' })).toHaveCount(0)
})

test('détail d’un tournoi solo : trophée des clans, « Toi », pas d’escouades mixtes', async ({ api, page }) => {
  signInAsMember(api)
  await page.goto(`/tournaments/${SOLO_TOURNAMENT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Solo Showdown' })).toBeVisible()
  await expect(phaseBadge(page)).toHaveText('TERMINÉ')
  await expect(page.getByTestId('tournament-viewer-position')).toContainText('Toi : 2e')
  await expect(page.getByRole('region', { name: 'Trophée des clans' })).toContainText('[RATZ] Les Ratz')
  await expect(page.locator('#tournament-rules')).not.toContainText('Escouades mixtes')
  // Aucune manche : ni section, ni ancre vers elle.
  await expect(toolbar(page).getByRole('link', { name: 'Manches' })).toHaveCount(0)
})

test('visiteur : aucune ligne « Ton clan », aucune invitation à synchroniser', async ({ page }) => {
  await page.goto(`/tournaments/${LIVE_TOURNAMENT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Coupe d’automne' })).toBeVisible()
  await expect(page.getByTestId('tournament-viewer-position')).toHaveCount(0)
  await expect(page.locator('tr[aria-current="true"]')).toHaveCount(0)
})

test('anciennes adresses par clan : redirection HTTP vers les pages globales', async ({ page }) => {
  const list = await page.request.get(`/clans/${CLAN_ID}/tournaments`, { maxRedirects: 0 })
  expect(list.status()).toBe(307)
  expect(new URL(list.headers().location, 'http://localhost').pathname).toBe('/tournaments')

  const detail = await page.request.get(`/clans/${CLAN_ID}/tournaments/${LIVE_TOURNAMENT_ID}`, { maxRedirects: 0 })
  expect(detail.status()).toBe(307)
  expect(new URL(detail.headers().location, 'http://localhost').pathname).toBe(`/tournaments/${LIVE_TOURNAMENT_ID}`)
})
