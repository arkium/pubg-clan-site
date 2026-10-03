import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, MEMBER_ID } from './support/data'
import { appHeader, dock, periodFilter, scrollToY, toolbar } from './support/layout'
import { mockClanMembers, mockPlayerDashboard } from './support/members'

/**
 * Membres du clan et tableau de bord d'un joueur — docs/features/membres.md (maquette « Membres et joueur »,
 * 2026-09-27). « A joué ce soir » remplace le « en jeu » de la maquette (import horaire) ; K/M, win rate et parties sur
 * 30 jours ; une seule période pour tout le tableau de bord ; chevrons au lieu d'un défilement horizontal.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

const activeList = (page: Page) => page.getByRole('list', { name: 'Membres actifs' })

test.describe('Membres du clan', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanMembers(api)
    await page.goto(`/clans/${CLAN_ID}/members`)
    await expect(page.getByRole('heading', { level: 1, name: 'Membres du clan' })).toBeVisible()
    await expect(activeList(page).getByRole('listitem').first()).toBeVisible()
  })

  test('bandeau : effectif et « a joué ce soir » au lieu de « en jeu »', async ({ page }) => {
    await expect(page.getByText('Clan Démo · 12 joueurs')).toBeVisible()
    await expect(page.getByTestId('tonight-count')).toHaveText('2 ont joué ce soir')
    await expect(page.getByText(/en jeu/i)).toHaveCount(0)
  })

  test('fiche : rôle, activité, trois chiffres sur 30 jours, arme fétiche, médailles ; elle ouvre le tableau de bord', async ({ page }) => {
    const alpha = activeList(page).getByRole('link', { name: 'Joueur Alpha' })
    await expect(alpha).toHaveAttribute('href', '/members/1/dashboard')
    await expect(alpha).toContainText('Fragger')
    await expect(alpha).toContainText('a joué ce soir')
    await expect(alpha).toContainText('2,84') // K/M = 182 / 64
    await expect(alpha).toContainText('18,8 %')
    await expect(alpha).toContainText('Arme fétiche : BerylM762')
    await expect(alpha.getByTestId('played-tonight')).toBeVisible()
    await expect(activeList(page).getByRole('link', { name: 'Joueur Charlie' })).toContainText('vu il y a 1 j')
    await expect(page.getByText(/K\/D/)).toHaveCount(0)
  })

  test('9 actifs ; la réserve (30 jours sans partie) est repliée et s’ouvre', async ({ page }) => {
    await expect(activeList(page).getByRole('listitem')).toHaveCount(9)
    const toggle = page.getByRole('button', { name: /En réserve/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toContainText('3 joueurs · pas de partie depuis 30 jours')
    await toggle.click()
    const reserve = page.getByRole('list', { name: 'Membres en réserve' })
    await expect(reserve.getByRole('link')).toHaveCount(3)
    await expect(reserve.getByRole('link', { name: /Joueur Juliett/ })).toContainText('dernière partie le')
    await expect(reserve.getByRole('link', { name: /Joueur Lima/ })).toContainText('aucune partie suivie')
  })

  test('filtre par rôle, recherche par pseudo, tri par K/M', async ({ page }) => {
    await page.getByRole('group', { name: 'Rôle' }).getByRole('button', { name: 'Medic' }).click()
    await expect(activeList(page).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('group', { name: 'Rôle' }).getByRole('button', { name: 'Tous' }).click()

    await page.getByRole('searchbox', { name: 'Rechercher un membre' }).fill('delta_fr')
    await expect(activeList(page).getByRole('listitem')).toHaveCount(1)
    await page.getByRole('button', { name: 'Effacer la recherche' }).click()

    await page.getByRole('group', { name: 'Trier par' }).getByRole('button', { name: 'K/M' }).click()
    await expect(activeList(page).getByRole('link').first()).toHaveAccessibleName('Joueur Alpha')
    await expect(activeList(page).getByRole('link').nth(1)).toHaveAccessibleName('Joueur Delta')
  })

  test('demandes en attente : le lien n’apparaît pas pour un visiteur', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Demandes en attente/ })).toHaveCount(0)
  })

  test('sans période : pas de docking sur mobile, aucun défilement horizontal', async ({ page }, testInfo) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    if (isMobile(testInfo)) {
      await scrollToY(page, 900)
      await expect(toolbar(page)).toHaveAttribute('data-docked', 'false')
    } else {
      await dock(page)
      await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
    }
    await expectNoHorizontalScroll(page)
  })
})

test('Membres : demandes en attente comptées pour qui peut les traiter', async ({ api, page }) => {
  mockClanMembers(api, { pendingCount: 2 })
  await page.goto(`/clans/${CLAN_ID}/members`)
  await expect(page.getByRole('link', { name: 'Demandes en attente (2)' })).toHaveAttribute('href', `/clans/${CLAN_ID}/members/pending`)
})

test.describe('Tableau de bord d’un joueur', () => {
  test.beforeEach(async ({ api, page }) => {
    mockPlayerDashboard(api)
    await page.goto(`/members/${MEMBER_ID}/dashboard`)
    await expect(page.getByRole('heading', { level: 1, name: 'Joueur Alpha' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Chiffres clés' })).toBeVisible()
  })

  test('bandeau docké : le retour du fil d’Ariane reste à portée (toutes largeurs)', async ({ page }) => {
    const trail = page.getByRole('link', { name: 'Retour à Membres' })
    const target = await trail.getAttribute('href')
    await expect(toolbar(page).getByTestId('toolbar-back')).toHaveCount(0) // au repos : le fil d'Ariane est juste au-dessus
    await dock(page)
    const back = toolbar(page).getByRole('link', { name: 'Retour à Membres' })
    await expect(back).toBeVisible()
    await expect(back).toHaveAttribute('href', target!)
    // À la hauteur du rail de la période, jamais plus haut.
    const [backHeight, railHeight] = await Promise.all([
      back.evaluate((el) => Math.round(el.getBoundingClientRect().height)),
      toolbar(page).locator('.app-segmented-control').first().evaluate((el) => Math.round(el.getBoundingClientRect().height)),
    ])
    expect(backHeight).toBe(railHeight)
  })

  test('carte joueur : rôle de la période, distinction, soirée en cours, suivi depuis', async ({ page }) => {
    const badges = page.getByTestId('player-badges')
    await expect(badges).toContainText('Fragger · 82 %')
    await expect(badges).toContainText('Top killer de la semaine')
    await expect(badges).toContainText('A joué ce soir')
    await expect(page.getByText(/Alpha_FR · Clan Démo \[DEMO\] · suivi depuis mars 2025/)).toBeVisible()
  })

  test('une seule période pour toute la page', async ({ api, page }) => {
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect(page).toHaveURL(/[?&]period=month\b/)
    for (const path of ['dashboard', 'telemetry/weapons', 'nemesis', 'city-insights', 'drop-pressure', 'matches']) {
      await expect.poll(() => api.paramValues(`/api/members/${MEMBER_ID}/${path}`, 'period').at(-1)).toBe('month')
    }
    await expect(page.getByTestId('kpi-Kills')).toContainText('256')
  })

  test('chiffres clés : écart au clan, top 1, barres d’activité', async ({ page }) => {
    await expect(page.getByTestId('kpi-Kills')).toContainText('+18 % vs clan')
    await expect(page.getByTestId('kpi-Win rate')).toContainText('4 top 1 sur 22 parties')
    await expect(page.getByTestId('kpi-Parties')).toContainText('6 assistances · 11 réanimations')
    await expect(page.getByTestId('kpi-Kills').getByRole('img', { name: /Kills par soirée : lun\./ })).toBeVisible()
  })

  test('meilleure partie et profil de jeu (repère du clan, tendance)', async ({ page }) => {
    const best = page.getByRole('article', { name: 'Meilleure partie de la période' })
    await expect(best).toContainText('WINNER WINNER CHICKEN DINNER')
    await expect(best).toContainText('Erangel · Squad FPP')
    await expect(best).toContainText('avec Joueur Bravo, Joueur Charlie, Joueur Delta')
    await expect(best.getByRole('link', { name: 'Revoir la partie →' })).toHaveAttribute('href', /\/telemetry\/matches\/sm-best\/debrief/)
    await expect(page.getByTestId('profile-fragger')).toContainText('▲ 6')
    await expect(page.getByTestId('profile-medic')).toContainText('▼ 3')
    await expect(page.getByRole('article', { name: 'Profil de jeu' })).toContainText('phase 2,1')
  })

  test('arsenal, frères d’armes, némésis, drop : chaque carte ouvre sa page', async ({ page }) => {
    await expect(page.getByRole('article', { name: 'Arsenal' }).getByRole('link', { name: 'Armes →' })).toHaveAttribute('href', `/members/${MEMBER_ID}/weapons`)
    await expect(page.getByRole('article', { name: 'Arsenal' }).getByRole('listitem')).toHaveCount(3)
    await expect(page.getByRole('article', { name: 'Frères d’armes' }).getByRole('link', { name: /Joueur Bravo/ })).toHaveAttribute('href', '/members/2/dashboard')
    const nemesis = page.getByRole('article', { name: 'Némésis' })
    await expect(nemesis).toContainText('xX_Kr4ken_Xx')
    await expect(nemesis).toContainText('Baguette_Sniper [BGT]')
    await expect(nemesis).toContainText('Bots neutralisés : 23')
    await expect(nemesis.getByRole('link', { name: 'Détail →' })).toHaveAttribute('href', `/members/${MEMBER_ID}/nemesis`)
    const drop = page.getByRole('article', { name: 'Au drop' })
    await expect(drop).toContainText('Ville favorite : Pochinki')
    await expect(drop.getByRole('link', { name: 'Zones →' })).toHaveAttribute('href', `/members/${MEMBER_ID}/drop-zones`)
  })

  test('5 dernières parties, liens vers le débriefing, puis l’historique', async ({ page }) => {
    const recent = page.getByRole('region', { name: 'Dernières parties' })
    await expect(recent.getByRole('listitem')).toHaveCount(5)
    await expect(recent.getByRole('link', { name: /Miramar/ })).toHaveAttribute('href', /\/clans\/1\/telemetry\/matches\/sm-1\/debrief/)
    await expect(recent.getByRole('link', { name: 'Tout l’historique →' })).toHaveAttribute('href', `/members/${MEMBER_ID}/matches?period=week`)
  })

  test('dernière ligne : calendrier des 5 semaines (sans lien) et carte Carrière PUBG', async ({ page }) => {
    const calendar = page.getByRole('region', { name: 'Calendrier' })
    const days = calendar.getByRole('list', { name: 'Parties par jour' }).getByRole('listitem')
    await expect(days).toHaveCount(35)
    await expect(calendar.locator('[data-games="2"]')).toHaveAttribute('aria-label', /2 parties · 1 top 1/)
    await expect(calendar.getByTestId('calendar-win')).toHaveCount(2)
    await expect(calendar).toContainText('3 jours')
    await expect(calendar).toContainText('21 h – 23 h')
    await expect(calendar.getByRole('link')).toHaveCount(0)
    const career = page.getByTestId('career-card')
    await expect(career).toHaveAttribute('href', `/members/${MEMBER_ID}/stats`)
    await expect(career).toContainText('×42')
    await expect(career).toContainText('Or 2')
    await expect(career).toContainText('1 médaille d’or dans le clan')
  })

  test('pages du joueur : puces dans le bandeau, chevrons sur mobile au lieu d’un défilement', async ({ page }, testInfo) => {
    const nav = page.getByRole('navigation', { name: 'Pages du joueur' })
    await expect(nav.getByRole('link', { name: /Tableau de bord/ })).toHaveCount(0)
    if (isMobile(testInfo)) {
      await expect(nav.getByRole('link')).toHaveCount(4)
      const firstChip = (await nav.getByRole('link').first().textContent()) ?? ''
      await nav.getByRole('button', { name: 'Éléments suivants' }).click()
      await expect(nav.getByRole('link').first()).not.toHaveText(firstChip)
      await expect(nav.getByRole('button', { name: 'Éléments précédents' })).toBeEnabled()
    } else {
      await expect(nav.getByRole('button', { name: 'Éléments suivants' })).toBeHidden()
      // Badge : nombre de parties de la période.
      await expect(nav.getByRole('link', { name: /Matchs/ })).toContainText('25')
    }
    await expectNoHorizontalScroll(page)
  })

  test('bandeau de période docké, aussi sur mobile (page à période)', async ({ page }) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
  })
})
