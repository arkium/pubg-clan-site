import { expect, test } from './support/api'
import { HUB_CLANS, homeShowcaseWithClans } from './support/home-clans'
import { mockHomeShowcase } from './support/pages'

/**
 * Hub des clans — fin de la vitrine, après « Lecture de zone » (docs/features/accueil.md, maquette « Accueil - Bandeau
 * clans » 1a). Deux bandes qui défilent en sens opposés, pause au survol, figées si l'appareil limite les animations ;
 * tous les clans suivis, chiffres de la Ligue de la semaine ; aucun défilement horizontal de la page.
 */

async function openHome(page: import('@playwright/test').Page, api: import('./support/api').ApiMock, reducedMotion: 'reduce' | 'no-preference') {
  mockHomeShowcase(api)
  api.on('GET', '/api/home/showcase', { body: homeShowcaseWithClans() })
  await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await expect(page.getByTestId('home-dinner')).toBeVisible()
}

test('le hub des clans ferme la vitrine, juste après « Lecture de zone »', async ({ page, api }) => {
  await openHome(page, api, 'reduce')
  const hub = page.getByTestId('home-clans-hub')
  await expect(hub).toBeVisible()
  await expect(page.locator('section[aria-labelledby="home-zone-reading-title"] + section[data-testid="home-clans-hub"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="home-clans-hub"] + footer.home-footer')).toHaveCount(1)

  await expect(hub.getByRole('heading', { level: 2, name: /Pas un clan\.\s*Tous les clans\./i })).toBeVisible()
  const counters = hub.getByTestId('home-hub-counters')
  await expect(counters).toContainText('29')
  await expect(counters).toContainText('399')
  await expect(counters).toContainText(/26\s707/)
  await expect(counters).toContainText('Parties analysées')
})

test('la bande jaune est la liste des clans : un lien par clan, chiffres de la Ligue dans le nom accessible', async ({ page, api }) => {
  await openHome(page, api, 'reduce')
  const hub = page.getByTestId('home-clans-hub')
  const list = hub.getByRole('list', { name: 'Clans suivis sur chickendinner.fr' })
  // La copie de bouclage et la bande noire sont masquées aux lecteurs d'écran.
  await expect(list.getByRole('link')).toHaveCount(HUB_CLANS.length)
  await expect(hub.getByRole('link', { name: /La Meute/ })).toHaveCount(1)

  const meute = list.getByRole('link', { name: /La Meute/ })
  await expect(meute).toHaveAttribute('href', '/clans/1/overview')
  await expect(meute).toHaveAccessibleName(/1e de la Ligue, 1\s486 PS · 44 parties, \+2 places depuis la semaine dernière/)
  await expect(list.getByRole('link', { name: /Les Ratz/ })).toHaveAccessibleName(/−1 place depuis la semaine dernière/)
  await expect(list.getByRole('link', { name: /La Team France/ })).toHaveAccessibleName(/même rang que la semaine dernière/)
  // Nouveau classé : aucune tendance, plutôt qu'un signe vide.
  await expect(list.getByRole('link', { name: /Bof Team/ })).not.toHaveAccessibleName(/semaine dernière/)
  await expect(list.getByRole('link', { name: /Crazy Academy/ })).toHaveAccessibleName(/En qualification · 3 \/ 5 parties/)
  await expect(list.getByRole('link', { name: /Fun’s Nest/ })).toHaveAccessibleName(/Pas encore de partie cette semaine/)

  // Rang en Ligue sur les seuls clans classés.
  const yellow = hub.getByTestId('home-hub-band-yellow')
  await expect(yellow.locator('.home-hub-row').first().locator('.home-hub-rank')).toHaveCount(4)

  // Logo absent du serveur : logo par défaut (images en chargement différé : la section doit être à l'écran).
  await hub.scrollIntoViewIfNeeded()
  await expect(yellow.locator('.home-hub-row').first().locator('img').first()).toHaveAttribute('src', /\/pubg\.png$/)

  // Bande noire : hors lecteurs d'écran et hors tabulation.
  const dark = hub.getByTestId('home-hub-band-dark')
  await expect(dark).toHaveAttribute('aria-hidden', 'true')
  await expect(dark.locator('a:not([tabindex="-1"])')).toHaveCount(0)
  await expect(dark.locator('.home-hub-row').first()).toContainText('1 486 PS · 44 parties')
  await expect(dark.locator('.home-hub-row').first()).toContainText('▲2')
  await expect(dark.locator('.home-hub-row').first()).toContainText('▼1')
})

test('les deux bandes défilent en sens opposés et s’arrêtent au survol', async ({ page, api }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'animation : une largeur suffit')
  await openHome(page, api, 'no-preference')
  const hub = page.getByTestId('home-clans-hub')
  const yellowTrack = hub.getByTestId('home-hub-band-yellow').locator('.home-hub-track')
  const darkTrack = hub.getByTestId('home-hub-band-dark').locator('.home-hub-track')

  await expect(yellowTrack).toHaveCSS('animation-name', 'home-hub-scroll')
  await expect(yellowTrack).toHaveCSS('animation-direction', 'normal')
  await expect(darkTrack).toHaveCSS('animation-direction', 'reverse')
  await expect(yellowTrack).toHaveCSS('animation-play-state', 'running')

  await hub.getByTestId('home-hub-band-yellow').hover()
  await expect(yellowTrack).toHaveCSS('animation-play-state', 'paused')
  await expect(darkTrack).toHaveCSS('animation-play-state', 'paused')
})

test('figé quand l’appareil limite les animations', async ({ page, api }) => {
  await openHome(page, api, 'reduce')
  await expect(page.getByTestId('home-hub-band-yellow').locator('.home-hub-track')).toHaveCSS('animation-name', 'none')
})

test('deux sorties : l’annuaire des clans et la Ligue', async ({ page, api }) => {
  await openHome(page, api, 'reduce')
  const hub = page.getByTestId('home-clans-hub')
  await expect(hub.getByRole('link', { name: 'Explorer l’annuaire des clans' })).toHaveAttribute('href', '/clans')
  await expect(hub.getByRole('link', { name: 'Voir la Ligue' })).toHaveAttribute('href', '/clans-leaderboard')
})

test('les bandes inclinées ne font jamais défiler la page en largeur', async ({ page, api }) => {
  await openHome(page, api, 'reduce')
  await page.getByTestId('home-clans-hub').scrollIntoViewIfNeeded()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('sans clan à montrer, pas de hub', async ({ page, api }) => {
  mockHomeShowcase(api)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('home-dinner')).toBeVisible()
  await expect(page.getByTestId('home-clans-hub')).toHaveCount(0)
})
