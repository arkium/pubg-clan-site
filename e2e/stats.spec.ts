import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { clanBodyZonesPayload } from './support/body-zones'
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

  test('« Aller plus loin » : les cartes, l’armurerie et la carrière du clan', async ({ page }) => {
    const links = page.getByRole('region', { name: 'Aller plus loin' }).getByRole('link')
    await expect(links).toHaveCount(3)
    await expect(links.nth(0)).toHaveAttribute('href', `/clans/${CLAN_ID}/stats/maps`)
    await expect(links.nth(0)).toContainText('Les cartes du clan')
    await expect(links.nth(1)).toHaveAttribute('href', `/clans/${CLAN_ID}/stats/weapons`)
    await expect(links.nth(2)).toHaveAttribute('href', `/clans/${CLAN_ID}/stats/career`)
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

// Zones d'impact du clan (docs/TODO/zones-d-impact.md, lot 4) : somme des membres actifs, chiffres clés, membres
// classés par taux de tête — sous l'échantillon en bas, sans rang.
test.describe('Style de jeu du clan — zones d’impact', () => {
  const expected = () => clanBodyZonesPayload('week').data

  test.beforeEach(async ({ api, page }) => {
    mockClanPlaystyle(api)
    await page.goto(`/clans/${CLAN_ID}/stats`)
    await expect(section(page, 'sec-zones').getByTestId('body-zones-section')).toBeVisible()
  })

  test('chiffres clés, deux panneaux, bande des 8 semaines, ancre « Impacts »', async ({ page }) => {
    const zones = section(page, 'sec-zones')
    const data = expected()
    await expect(zones.getByTestId('body-zones-figure-head')).toContainText(`${Math.round(data.dealt.headRate!)} %`)
    await expect(zones.getByTestId('body-zones-figure-upper')).toContainText(`${Math.round(data.taken.upperShare!)} %`)
    await expect(zones.getByTestId('body-zones-figure-lower')).toContainText(`${Math.round(data.taken.lowerShare!)} %`)
    await expect(zones.getByTestId('body-zones-dealt')).toContainText(`touches · ${Math.round(data.dealt.headRate!)} % à la tête`)
    await expect(zones.getByTestId('body-zones-weeks')).toContainText('S44')
    await expect(toolbar(page).getByRole('link', { name: 'Impacts' })).toHaveAttribute('href', '#sec-zones')
    await expectNoHorizontalScroll(page)
  })

  test('tableau : classés par taux de tête, évolution du rang, sous l’échantillon en bas ; tri par les en-têtes', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'tableau : ordinateur et tablette')
    const rows = section(page, 'sec-zones').getByTestId('body-zones-member-row')
    await expect(rows).toHaveCount(8)
    const names = async () => (await rows.locator('td:nth-child(2)').allTextContents()).map((name) => name.replace('Joueur ', ''))
    expect(await names()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'])
    await expect(rows.nth(0).getByRole('img', { name: 'Rang 1, médaille d’or' })).toBeVisible()
    expect(await rows.locator('td:last-child').allTextContents()).toEqual(['=', '▲1', '▼1', '=', 'nouv.', '▼1', '—', '—'])
    await expect(rows.nth(6).locator('td').nth(4)).toHaveText('—')
    await expect(rows.nth(1).getByRole('link', { name: 'Joueur Alpha' })).toHaveAttribute('href', '/members/1/playstyle')

    await section(page, 'sec-zones').getByRole('button', { name: 'Parties' }).click()
    expect((await names()).slice(0, 2)).toEqual(['Charlie', 'Bravo'])
    expect((await names()).slice(-2)).toEqual(['Golf', 'Hotel'])
  })

  test('tableau paginé par 10 (2026-10-30) : page 2, puis un nouveau tri repart de la première page', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'tableau : ordinateur et tablette (le mobile pagine sa propre liste)')
    const payload = clanBodyZonesPayload('week')
    const ranked = payload.data.members.filter((member) => member.rank !== null)
    // 16 membres : les 8 du jeu de données (6 classés, 2 sous l'échantillon) et 8 renforts classés à la suite.
    const extra = Array.from({ length: 8 }, (_, index) => ({
      ...ranked[index % ranked.length],
      memberId: 100 + index,
      displayName: `Renfort ${index + 1}`,
      rank: ranked.length + index + 1,
      previousRank: null,
      isNew: false,
    }))
    api.on('GET', `/api/clans/${CLAN_ID}/telemetry/body-zones`, { body: { ...payload, data: { ...payload.data, members: [...payload.data.members, ...extra] } } })
    await page.reload()

    const zones = section(page, 'sec-zones')
    const rows = zones.getByTestId('body-zones-member-row')
    const pager = zones.getByRole('navigation', { name: 'Pages du classement « Qui vise la tête ? »' })
    await expect(rows).toHaveCount(10)
    await expect(pager).toContainText('Membres 1–10 sur 16')

    await pager.getByRole('button', { name: '2', exact: true }).click()
    await expect(rows).toHaveCount(6)
    await expect(pager).toContainText('Membres 11–16 sur 16')
    // Les membres sous l'échantillon restent en fin de classement, donc sur la dernière page.
    await expect(rows.last()).toContainText('Joueur Hotel')

    await zones.getByRole('button', { name: 'Parties' }).click()
    await expect(rows).toHaveCount(10)
    await expect(pager).toContainText('Membres 1–10 sur 16')
  })

  test('« Tous » : pas de colonne Évolution', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'tableau : ordinateur et tablette')
    await periodFilter(page).getByRole('button', { name: 'Tous' }).click()
    await expect(section(page, 'sec-zones').getByText('Parties analysées depuis le 13 septembre 2026')).toBeVisible()
    await expect(section(page, 'sec-zones').getByRole('columnheader', { name: 'Évolution' })).toHaveCount(0)
    await expect(section(page, 'sec-zones').getByTestId('body-zones-weeks-trend')).toHaveCount(0)
  })

  test('mobile : liste de rangs et pilules « Trier par » ; les membres sous l’échantillon nommés à part', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'comportement propre au mobile')
    const zones = section(page, 'sec-zones')
    await expect(zones.getByTestId('body-zones-members').getByRole('button', { name: 'Tête %', exact: true })).toBeVisible()
    await expect(zones.getByTestId('body-zones-unranked')).toContainText('Joueur Golf (15 touches), Joueur Hotel (22 touches)')
    await expectNoHorizontalScroll(page)
  })
})
