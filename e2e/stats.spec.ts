import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID, itemUseStats } from './support/data'
import { appHeader, dock, periodFilter, scrollToY, toolbar } from './support/layout'
import { mockClanCareer, mockClanPlaystyle } from './support/stats'

/**
 * Statistiques du clan — docs/features/statistiques.md (maquette « Statistiques », 2026-09-27). « Style de jeu » :
 * télémétrie de la période (profil, objets, synergies, coopération). « Carrière PUBG » : cumuls de l'API PUBG, sans
 * période. Pagination au lieu de défilement horizontal ; `/stats/items` redirige vers la section des objets.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const section = (page: Page, id: string) => page.locator(`#${id}`)

/** Aucune page ne doit défiler horizontalement (règle du site, rappelée par la demande du 2026-09-27). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test.describe('Style de jeu du clan', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanPlaystyle(api)
    await page.goto(`/clans/${CLAN_ID}/stats`)
    await expect(page.getByRole('heading', { level: 1, name: 'Style de jeu du clan' })).toBeVisible()
    await expect(section(page, 'sec-profile').getByRole('article', { name: /Fragger/ })).toBeVisible()
  })

  test('une seule période pour toute la page, synergies et coopération en parties officielles', async ({ api, page }) => {
    await expect(page.getByTestId('playstyle-context')).toHaveText('8 joueurs · 3,4 bots / match · 212 positions / match')
    await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
    await expect(page).toHaveURL(/[?&]period=month\b/)
    for (const path of ['telemetry/playstyle', 'bot-stats', 'telemetry/item-use', 'telemetry/synergies', 'overview/matches-stats']) {
      await expect.poll(() => api.paramValues(`/api/clans/${CLAN_ID}/${path}`, 'period').at(-1)).toBe('month')
    }
    expect(new Set(api.paramValues(`/api/clans/${CLAN_ID}/telemetry/synergies`, 'matchType'))).toEqual(new Set(['official']))
    expect(new Set(api.paramValues(`/api/clans/${CLAN_ID}/overview/matches-stats`, 'matchType'))).toEqual(new Set(['official']))
  })

  test('profil de jeu : trois rôles et leur top 3, trois thèmes sans émoji ni anglicisme', async ({ page }) => {
    const profile = section(page, 'sec-profile')
    await expect(profile.getByRole('article', { name: /Medic/ })).toContainText('Joueur Charlie')
    await expect(profile.getByRole('article', { name: 'Gestion du cercle' })).toContainText('14,0 s')
    await expect(profile.getByRole('article', { name: 'Mobilité' })).toContainText('3,4 km par match')
    await expect(profile).not.toContainText(/👣|🚗|⚡|🩹|💊|🎯|First contact|Blue zone|evt\/m/u)
  })

  test('objets consommés : noms français, membres paginés au lieu d’une liste sans fin', async ({ page }) => {
    const items = section(page, 'sec-items')
    await expect(items.getByRole('list', { name: 'Objets les plus consommés' })).toContainText('Boisson énergisante')
    const members = items.getByRole('list', { name: 'Objets consommés par membre' }).getByRole('listitem')
    await expect(members).toHaveCount(8)
    await expect(items.getByText('Membres 1–8 sur 24')).toBeVisible()
    await items.getByRole('navigation', { name: 'Pages des membres' }).getByRole('button', { name: '2', exact: true }).click()
    await expect(items.getByText('Membres 9–16 sur 24')).toBeVisible()
    await expect(members.first()).toContainText('Joueur India')
  })

  test('objet sans icône officielle : pictogramme de sa famille et nom français, jamais une image cassée', async ({ api, page }) => {
    // Relevé sur le clan 324 le 2026-09-27 : le dépôt pubg/api-assets n'a ni bouclier pliable ni puce bleue.
    const stats = itemUseStats('week', true)
    api.on('GET', `/api/clans/${CLAN_ID}/telemetry/item-use`, {
      body: {
        data: {
          ...stats,
          items: [
            ...stats.items,
            { itemId: 'Item_BulletproofShield_C', subCategory: 'Gadget', count: 3, share: 2 },
            { itemId: 'Item_Bluechip_C', subCategory: 'Unknown', count: 2, share: 1 },
          ],
        },
      },
    })
    await page.reload()
    const list = section(page, 'sec-items').getByRole('list', { name: 'Objets les plus consommés' })
    await expect(list).toContainText('Bouclier pliable')
    await expect(list).toContainText('Puce bleue')
    await expect(list).not.toContainText('Item_Bluechip_C')
    await expect(list.getByTestId('item-icon-fallback')).toHaveCount(2)
    await expect.poll(() => list.locator('img').evaluateAll((imgs) => imgs.filter((img) => !(img as HTMLImageElement).naturalWidth).length)).toBe(0)
  })

  test('synergies fusionnées : duo, trio, squad avec leur barre de win rate', async ({ page }) => {
    const synergies = section(page, 'sec-synergies')
    await expect(synergies.getByRole('article')).toHaveCount(3)
    await expect(synergies.getByRole('article', { name: 'Synergies Duo' })).toContainText('28,6 %')
    await expect(synergies.getByRole('article', { name: 'Synergies Trio' })).toContainText('Pas encore assez de parties ensemble.')
    await expect(page.getByRole('heading', { name: 'Synergies de squad' })).toHaveCount(0)
  })

  test('coopération : cinq chiffres et trois classements de binômes', async ({ page }) => {
    const cooperation = section(page, 'sec-cooperation')
    await expect(cooperation.getByText('Réanimations', { exact: true })).toBeVisible()
    await expect(cooperation).toContainText('36')
    await expect(cooperation.getByRole('article', { name: 'Top sauvetages' })).toContainText('Joueur Charlie')
    await expect(cooperation.getByRole('article', { name: 'Top co-kills' })).toContainText('31')
  })

  test('ancres dans le bandeau, lien vers la carrière, aucun défilement horizontal', async ({ page }, testInfo) => {
    await expect(toolbar(page).getByRole('link', { name: 'Carrière PUBG du clan →' })).toHaveAttribute('href', `/clans/${CLAN_ID}/stats/career`)
    if (!isMobile(testInfo)) {
      await expect(toolbar(page).getByRole('link', { name: 'Objets', exact: true })).toHaveAttribute('href', '#sec-items')
    }
    await expectNoHorizontalScroll(page)
  })

  test('docké sur mobile : la période seule (sticky.md §2)', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'comportement propre au mobile')
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    await dock(page)
    await expect(toolbar(page)).toHaveAttribute('data-compact', 'true')
    await expect(toolbar(page).getByRole('navigation', { name: 'Sections du style de jeu' })).toHaveCount(0)
  })
})

test.describe('Carrière PUBG du clan', () => {
  test.beforeEach(async ({ api, page }) => {
    mockClanCareer(api)
    await page.goto(`/clans/${CLAN_ID}/stats/career`)
    await expect(page.getByRole('heading', { level: 1, name: 'Carrière PUBG du clan' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Totaux de carrière' })).toBeVisible()
  })

  test('sans période : la source et la fraîcheur à la place du filtre', async ({ page }) => {
    await expect(page.getByText('Depuis la création des comptes')).toBeVisible()
    await expect(periodFilter(page)).toHaveCount(0)
    await expect(toolbar(page)).toContainText('Mis à jour il y a 3 h · une fois par jour')
    await expect(toolbar(page)).toContainText('Source : API PUBG')
    await expect(page.getByText(/1 membre actif sans carrière PUBG synchronisée/)).toBeVisible()
  })

  test('quatre totaux, le temps de jeu signale les joueurs pas encore resynchronisés', async ({ page }) => {
    const totals = page.getByRole('region', { name: 'Totaux de carrière' })
    await expect(totals).toContainText('Temps de jeu')
    await expect(totals).toContainText('6 joueurs sur 8 synchronisés')
    await expect(totals).toContainText('Distance parcourue')
  })

  test('chaque carte dit ce qu’elle compte ; mur de la honte et moins = mieux', async ({ page }) => {
    await expect(page.getByRole('article', { name: 'Teamkills' })).toContainText('Mur de la honte')
    await expect(page.getByRole('article', { name: 'Teamkills' })).toContainText('Joueur Delta')
    await expect(page.getByRole('article', { name: 'Morts' })).toContainText('Moins = mieux')
    await expect(page.getByRole('article', { name: 'Kill le plus lointain' })).toContainText('712 m')
    await expect(page.getByRole('article', { name: 'Jours de jeu' })).toContainText('au moins')
    await expect(page.getByRole('article', { name: 'Temps de jeu' })).toContainText('2 joueurs en attente de synchro')
  })

  test('pas de docking sur mobile (page sans période), ancres une fois docké sur ordinateur', async ({ page }, testInfo) => {
    await page.waitForLoadState('networkidle')
    await expect(appHeader(page)).toBeVisible()
    if (isMobile(testInfo)) {
      await scrollToY(page, 900)
      await expect(toolbar(page)).toHaveAttribute('data-docked', 'false')
    } else {
      await dock(page)
      await expect(toolbar(page).getByRole('link', { name: 'Déplacements' })).toBeVisible()
    }
    await expectNoHorizontalScroll(page)
  })
})

test('« Objets consommés » : redirection HTTP vers sa section de « Style de jeu »', async ({ page }) => {
  const response = await page.request.get(`/clans/${CLAN_ID}/stats/items?period=month`, { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  const location = new URL(response.headers().location, 'http://localhost')
  expect(location.pathname).toBe(`/clans/${CLAN_ID}/stats`)
  expect(location.searchParams.get('period')).toBe('month')
  expect(location.hash).toBe('#sec-items')
})
