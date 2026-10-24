import type { Locator, Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { appHeader, dock, toolbar } from './support/layout'
import {
  LIVE_TOURNAMENT_ID,
  ORGANIZER_OWNER_SESSION,
  OUTSIDE_SUPERUSER_SESSION,
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
    await expect(toolbar(page).getByRole('link', { name: 'Podium' })).toHaveAttribute('href', '#tournament-podium')
    await expect(toolbar(page).getByRole('link', { name: 'Awards' })).toHaveAttribute('href', '#tournament-awards')
    await expect(toolbar(page).getByRole('link', { name: 'Armes' })).toHaveAttribute('href', '#tournament-weapons')
    // Bandeau de remerciement au bas de l'en-tête : le message, puis les clans par ordre alphabétique (2026-10-11).
    const ticker = page.getByTestId('tournament-thanks-ticker')
    await expect(ticker).toContainText('Merci à tous les clans pour leur participation')
    await expect(ticker.locator('.sr-only')).toHaveText(
      'Merci à tous les clans pour leur participation : [BOFS] Bof Team, [DEMO] Clan Démo, [LMT] La Meute, [RATZ] Les Ratz.'
    )
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
    // Le MVP n'a plus sa bande : il est en tête des top killers (demande du 2026-10-11).
    await expect(page.getByTestId('tournament-killers').locator('ol > li').first()).toContainText('MVP')
  })

  test('podium en marches, top killers et top scorers : MVP en tête, ligne du lecteur, liste dépliable', async ({ page }) => {
    const podium = page.getByRole('region', { name: 'Podium du tournoi' })
    await expect(podium).toContainText('Winner winner chicken dinner')
    await expect(podium.getByTestId('tournament-podium-1')).toContainText('La Meute')
    await expect(podium.getByTestId('tournament-podium-1')).toContainText('[LMT]')
    await expect(podium.getByTestId('tournament-podium-1')).toContainText('58 pts')
    await expect(podium.getByTestId('tournament-podium-2')).toContainText('Clan Démo')
    await expect(podium.getByTestId('tournament-podium-3')).toContainText('Les Ratz')

    // Le lecteur est 9e des killers : top 5, « ⋮ », puis sa ligne.
    const killers = page.getByTestId('tournament-killers')
    await expect(killers.locator('ol > li')).toHaveCount(7)
    await expect(killers.locator('li[aria-current="true"]')).toContainText('Joueur Alpha')
    await expect(killers.locator('li[aria-current="true"]')).toContainText('Toi')
    await killers.getByRole('button', { name: 'Voir les 12 players' }).click()
    await expect(killers.locator('ol > li')).toHaveCount(12)
    await killers.getByRole('button', { name: 'Revenir au top 5' }).click()
    await expect(killers.locator('ol > li')).toHaveCount(7)

    // Premier des scorers : déjà dans le top 5, pas de ligne en plus.
    const scorers = page.getByTestId('tournament-scorers')
    await expect(scorers.locator('ol > li')).toHaveCount(5)
    await expect(scorers.locator('ol > li').first()).toContainText('Toi')
    await expect(scorers.locator('ol > li').first()).toContainText('60')
  })

  test('moyenne par clan : points des players ÷ nombre de players, ton clan repéré', async ({ page }) => {
    await page.getByRole('button', { name: 'Moyenne par clan' }).click()
    const standings = page.locator('#tournament-standings')
    await expect(standings).toContainText('moyenne = points des players du clan')
    await expect(standings.locator('tbody tr')).toHaveCount(4)
    // Un seul player, mais la meilleure moyenne : tous les clans sont classés (décision du 2026-10-11).
    await expect(standings.locator('tbody tr').first()).toContainText('[RATZ] Les Ratz')
    await expect(standings.locator('tbody tr').first()).toContainText('48,00')
    const mine = standings.locator('tr[aria-current="true"]')
    await expect(mine).toContainText('[DEMO] Clan Démo')
    await expect(mine).toContainText('37,50')
    await expect(mine).toContainText('Ton clan')
    // Rien à filtrer par clan dans la moyenne.
    await expect(standings.getByRole('button', { name: /^Clan : / })).toHaveCount(0)
  })

  test('awards : fun facts, carrousel à chevrons en pause, « Tout voir »', async ({ page }) => {
    const awards = page.locator('#tournament-awards')
    await expect(awards).toContainText('Kills au total')
    await expect(awards).toContainText('dont 78 à la tête')
    await expect(awards).toContainText('Manche 2')
    await expect(awards).toContainText('978')

    const width = page.viewportSize()?.width ?? 1280
    const perView = width >= 1024 ? 3 : width >= 640 ? 2 : 1
    const shown = awards.locator('[aria-roledescription="diapositive"]:not([inert]) article')
    // Pause d'abord : le défilement automatique ne doit pas déplacer les cartes pendant le test.
    await awards.getByRole('button', { name: 'Mettre le défilement en pause' }).click()
    await expect(awards.getByRole('button', { name: 'Reprendre le défilement' })).toBeVisible()
    await expect(shown).toHaveCount(perView)
    await expect(shown.first()).toHaveAttribute('aria-label', 'Le carton')
    await expect(shown.first()).toContainText('M3')
    await expect(awards.getByRole('button', { name: 'Awards précédents' })).toBeDisabled()
    await awards.getByRole('button', { name: 'Awards suivants' }).click()
    await expect(shown.first()).toHaveAttribute('aria-label', 'La brute')

    await awards.getByRole('button', { name: 'Tout voir' }).click()
    await expect(awards.getByRole('article')).toHaveCount(5)
    await expect(awards.getByRole('button', { name: 'Awards suivants' })).toHaveCount(0)
    await expect(awards.getByRole('article', { name: 'Le brouteur d’herbe' })).toContainText('1h 45m 05s')
    await awards.getByRole('button', { name: 'Réduire' }).click()
    await expect(shown).toHaveCount(perView)
  })

  test('awards : glisser à la souris ou au doigt change de carte', async ({ page }, testInfo) => {
    const awards = page.locator('#tournament-awards')
    await awards.getByRole('button', { name: 'Mettre le défilement en pause' }).click()
    const shown = awards.locator('[aria-roledescription="diapositive"]:not([inert]) article')
    const carousel = awards.getByTestId('tournament-awards-carousel')
    await carousel.scrollIntoViewIfNeeded()
    const box = await carousel.boundingBox()
    if (!box) throw new Error('carrousel invisible')
    const y = box.y + box.height / 2
    const drag = async (fromRatio: number, toRatio: number) => {
      await page.mouse.move(box.x + box.width * fromRatio, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * toRatio, y, { steps: 8 })
      await page.mouse.up()
    }
    // Vers la gauche : la carte suivante ; vers la droite : retour. Un petit geste ne change rien.
    await drag(0.8, 0.5)
    await expect(shown.first()).toHaveAttribute('aria-label', 'La brute')
    await drag(0.5, 0.8)
    await expect(shown.first()).toHaveAttribute('aria-label', 'Le carton')
    await drag(0.5, 0.47)
    await expect(shown.first()).toHaveAttribute('aria-label', 'Le carton')

    // Au doigt (écran tactile émulé par Chromium) : même geste, mêmes événements « pointer ».
    if (testInfo.project.name === 'chromium-mobile') {
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
      await touch('touchStart', box.x + box.width * 0.85)
      for (let step = 1; step <= 8; step += 1) await touch('touchMove', box.x + box.width * (0.85 - (0.5 * step) / 8))
      await touch('touchEnd', 0)
      await expect(shown.first()).toHaveAttribute('aria-label', 'La brute')
    }
  })

  test('armes du tournoi : classées par kills, trois meilleurs tireurs', async ({ page }) => {
    const weapons = page.locator('#tournament-weapons').getByTestId('tournament-weapon')
    await expect(weapons).toHaveCount(3)
    await expect(weapons.first()).toContainText('MP5K')
    await expect(weapons.first()).toContainText('50')
    await expect(weapons.first()).toContainText('Pistolets-mitrailleurs')
    await expect(weapons.first().locator('li')).toHaveCount(3)
    await expect(weapons.nth(1).locator('li')).toHaveCount(1)
  })

  test('détail par escouade, gardé en inter-clans, avec la forme de chaque escouade', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Détail par squad' }).click()
    await expect(page.locator('#tournament-standings tbody tr')).toHaveCount(1)
    // Une colonne par manche (M1, M2…) avec la place de la squad ; masquées sur mobile, comme la forme.
    if (testInfo.project.name !== 'chromium-mobile' && testInfo.project.name !== 'webkit-iphone') {
      await expect(page.locator('#tournament-standings thead')).toContainText('M1')
      await expect(page.locator('#tournament-standings tbody tr').first().locator('[title="Manche 1 : 1re place"]')).toHaveCount(1)
    }
    await page.getByRole('button', { name: 'Cumul par clan' }).click()
    await expect(page.locator('#tournament-standings tbody tr')).toHaveCount(4)
  })

  test('détail par player : même barème, kills à chaque manche, pagination', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Détail par player' }).click()
    const table = page.locator('#tournament-standings')
    await expect(table.locator('tbody tr')).toHaveCount(20)
    await expect(table).toContainText('25 players')
    await expect(table.locator('tbody tr').first()).toContainText('Joueur Alpha')
    // Le lecteur (membre 1) est repéré.
    await expect(table.locator('tbody tr').first()).toContainText('Toi')
    if (testInfo.project.name !== 'chromium-mobile' && testInfo.project.name !== 'webkit-iphone') {
      await expect(table.locator('thead')).toContainText('Dégâts')
      await expect(table.locator('thead')).toContainText('M1')
    }
    const pager = page.getByRole('navigation', { name: 'Pages du détail par player' })
    await expect(pager).toContainText('Players 1–20 sur 25')
    await pager.getByRole('button', { name: '2', exact: true }).click()
    await expect(table.locator('tbody tr')).toHaveCount(5)
    await expect(pager).toContainText('Players 21–25 sur 25')
  })

  test('filtre « Clan » des détails : seuls les squads et players du clan choisi, rang du classement complet', async ({ page }) => {
    const standings = page.locator('#tournament-standings')
    // Rien à filtrer dans le cumul par clan.
    await expect(standings.getByRole('button', { name: /^Clan : / })).toHaveCount(0)
    await page.getByRole('button', { name: 'Détail par player' }).click()
    await standings.getByRole('button', { name: 'Clan : tous les clans' }).click()
    await expect(standings.getByRole('menu', { name: 'Clan' })).toContainText('[DEMO] Clan Démo')
    await standings.getByRole('menuitemradio', { name: '[RATZ] Les Ratz' }).click()
    // Aucun player des Ratz dans l'exemple : la liste se vide, le décompte le dit.
    await expect(standings).toContainText('0 player sur 25')
    await standings.getByRole('button', { name: 'Clan : [RATZ] Les Ratz' }).click()
    await standings.getByRole('menuitemradio', { name: '[DEMO] Clan Démo' }).click()
    await expect(standings.locator('tbody tr')).toHaveCount(20)
    await expect(standings).toContainText('25 players')
  })

  test('manches une par une, la dernière d’abord, avec le bouton du replay 2D', async ({ page }) => {
    const rounds = page.locator('#tournament-rounds')
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 5')
    await rounds.getByRole('button', { name: 'Manche précédente' }).click()
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 4')
    await rounds.getByRole('button', { name: 'M1', exact: true }).click()
    await expect(rounds.getByRole('article')).toHaveAttribute('aria-label', 'Manche 1')
    await expect(rounds.getByRole('button', { name: 'Manche précédente' })).toBeDisabled()
    // Inter-clans : chaque manche liste les escouades, leurs joueurs et leur clan (tag écrit une fois par clan).
    await expect(rounds.locator('thead')).toContainText('Squad')
    await expect(rounds.locator('tbody')).toContainText('[DEMO] Joueur Alpha, Joueur Bravo')
    await expect(rounds.getByRole('article')).toContainText('Chicken dinner')
    // Le replay 2D est mis en avant : le bouton ouvre directement l'onglet Replay du débrief.
    await expect(rounds.getByRole('link', { name: /Revoir en replay 2D/ })).toHaveAttribute(
      'href',
      `/tournaments/${LIVE_TOURNAMENT_ID}/matches/match-1?tab=replay`
    )
  })

  test('barème en barres et règles, escouades mixtes en inter-clans', async ({ page }) => {
    const rules = page.locator('#tournament-rules')
    await expect(rules.getByRole('listitem')).toHaveCount(10)
    await expect(rules).toContainText('Squads mixtes')
    await expect(rules).toContainText('partage intégral')
  })

  test('le bandeau docke avec ses ancres, y compris sur mobile', async ({ page }, testInfo) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page).getByRole('link', { name: 'Manches' })).toBeVisible()
    await expect(page.getByTestId('tournament-viewer-position')).toBeVisible()
    // Docké, awards et armes partagent l'ancre « Stats » ; sur mobile, « Podium » et « Barème » s'effacent (2026-10-11).
    await expect(toolbar(page).getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '#tournament-awards')
    await expect(toolbar(page).getByRole('link', { name: 'Armes' })).toHaveCount(0)
    await expect(toolbar(page).getByRole('link', { name: 'Barème' })).toHaveCount(isMobile(testInfo) ? 0 : 1)
    // « Podium » (en haut de page) : docké sur ordinateur et tablette, pas sur mobile faute de place.
    await expect(toolbar(page).getByRole('link', { name: 'Podium' })).toHaveCount(isMobile(testInfo) ? 0 : 1)
    // Docké, une seule ligne (charte §6), 375 px compris : ancres et place du lecteur sur la même ligne.
    const centers = await Promise.all(
      [
        toolbar(page).getByRole('link', { name: 'Classement' }),
        toolbar(page).getByRole('link', { name: isMobile(testInfo) ? 'Stats' : 'Barème' }),
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
  // Ni bandeau de remerciement, ni award, ni arme avant la première manche : ni sections, ni ancres.
  await expect(page.getByTestId('tournament-thanks-ticker')).toHaveCount(0)
  await expect(toolbar(page).getByRole('link', { name: 'Awards' })).toHaveCount(0)
  await expect(page.locator('#tournament-weapons')).toHaveCount(0)
})

test('détail d’un tournoi solo : trophée des clans, « Toi », pas d’escouades mixtes', async ({ api, page }) => {
  signInAsMember(api)
  await page.goto(`/tournaments/${SOLO_TOURNAMENT_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Solo Showdown' })).toBeVisible()
  await expect(phaseBadge(page)).toHaveText('TERMINÉ')
  await expect(page.getByTestId('tournament-viewer-position')).toContainText('Toi : 2e')
  await expect(page.getByRole('region', { name: 'Trophée des clans' })).toContainText('[RATZ] Les Ratz')
  await expect(page.locator('#tournament-rules')).not.toContainText('Squads mixtes')
  // Aucune manche : ni section, ni ancre vers elle.
  await expect(toolbar(page).getByRole('link', { name: 'Manches' })).toHaveCount(0)
})

test('Owner organisateur : boutons « réservés à l’organisation », synchro qui recharge le classement', async ({ api, page }) => {
  signInAsMember(api, ORGANIZER_OWNER_SESSION)
  let standingsLoads = 0
  let syncs = 0
  api
    .on('GET', `/api/tournaments/${LIVE_TOURNAMENT_ID}/standings`, () => {
      standingsLoads += 1
      return { body: liveTournamentStandings() }
    })
    .on('POST', `/api/clans/${CLAN_ID}/tournaments/${LIVE_TOURNAMENT_ID}/sync`, () => {
      syncs += 1
      return { body: { ok: true, eligibleMatches: 5, newRounds: 1, materializationErrors: [] } }
    })
  await page.goto(`/tournaments/${LIVE_TOURNAMENT_ID}`)
  await expect(page.getByText('Réservé à l’organisation — les joueurs ne voient pas ces boutons.')).toBeVisible()
  await page.waitForLoadState('networkidle')
  const loadsBefore = standingsLoads

  const sync = page.getByRole('button', { name: 'Synchroniser PUBG' })
  // Sous le bouton : attendre la fin de la manche, le site réessaie seul.
  await expect(sync).toHaveAccessibleDescription(/PUBG publie une manche 2 à 3 minutes après sa fin/)
  await sync.click()
  const notice = page.getByTestId('tournament-sync-notice')
  await expect(notice).toContainText('1 nouvelle manche ajoutée — 5 manches au total.')
  expect(syncs).toBe(1)
  // Une manche arrivée : le classement se recharge seul, plus de « Rechargez la page ».
  await expect.poll(() => standingsLoads).toBeGreaterThan(loadsBefore)
})

test('SuperUser d’un autre clan : synchronise aussi ; sans nouvelle manche, essais automatiques arrêtables', async ({ api, page }) => {
  signInAsMember(api, OUTSIDE_SUPERUSER_SESSION)
  let syncs = 0
  api.on('POST', `/api/clans/${CLAN_ID}/tournaments/${LIVE_TOURNAMENT_ID}/sync`, () => {
    syncs += 1
    return { body: { ok: true, eligibleMatches: 4, newRounds: 0, materializationErrors: [] } }
  })
  await page.goto(`/tournaments/${LIVE_TOURNAMENT_ID}`)
  await page.waitForLoadState('networkidle')
  const sync = page.getByRole('button', { name: 'Synchroniser PUBG' })
  await expect(sync).toBeEnabled()
  await sync.click()
  const notice = page.getByTestId('tournament-sync-notice')
  await expect(notice).toContainText('Aucune nouvelle manche pour l’instant — 4 manches déjà au classement.')
  await expect(notice).toContainText(/Prochain essai dans \d+ s \(essai 2 sur 10\)\./)
  expect(syncs).toBe(1)
  await notice.getByRole('button', { name: 'Arrêter les essais' }).click()
  await expect(notice).toContainText('Essais automatiques arrêtés.')
  await expect(notice.getByRole('button', { name: 'Arrêter les essais' })).toHaveCount(0)
})

test('Owner : « Gérer les tournois de mon clan » en bouton principal, à l’accent de la charte', async ({ api, page }) => {
  signInAsMember(api, ORGANIZER_OWNER_SESSION)
  await page.goto('/tournaments')
  const manage = page.getByRole('link', { name: 'Gérer les tournois de mon clan' })
  await expect(manage).toHaveAttribute('href', `/clans/${CLAN_ID}/settings/tournaments`)
  const { background, accent } = await backgroundAndAccent(manage)
  expect(background).toBe(accent)
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
