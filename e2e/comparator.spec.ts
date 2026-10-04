import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { COMPARATOR_CLANS, COMPARATOR_RESPONSE } from './support/comparator-data'
import { clanList } from './support/data'
import { periodFilter } from './support/layout'

/**
 * Comparateur de clans (`/clans/comparator`) — charte UI (docs/ui/index.html#comparateur, migrée le 04/10/2026) :
 * arène à trois slots P1 / P2 / P3, bandeau de période, radar et sections comparées. Les données sont des agrégats
 * réels anonymisés (e2e/support/comparator-data.ts).
 */

const COMPARATOR_API = '/api/clans/comparator'
// Ordre de l'arène volontairement différent de celui de l'API (par identifiant) : Charlie, Alpha, Bravo.
const ARENA = [COMPARATOR_CLANS[2], COMPARATOR_CLANS[0], COMPARATOR_CLANS[1]]

/** `clanIds` de l'URL : virgule brute ou encodée selon qui a écrit l'adresse. */
const clanIdsParam = (clans: ReadonlyArray<{ id: number }>) => new RegExp(`clanIds=${clans.map((clan) => clan.id).join('(?:,|%2C)')}(?:&|$)`)

const radar = (page: Page) => page.locator('section').filter({ has: page.getByRole('img', { name: 'Radar comparatif des clans' }) })

test.beforeEach(async ({ api, page }) => {
  api
    .on('GET', '/api/clans', {
      body: [
        ...clanList(),
        ...COMPARATOR_CLANS.map((clan) => ({ ...clan, platformShard: 'steam', membersCount: 12, matchesCount: 100, imageUrl: null })),
      ],
    })
    .on('GET', COMPARATOR_API, (url) => ({ body: { ...COMPARATOR_RESPONSE, period: url.searchParams.get('period') } }))
  await page.goto(`/clans/comparator?clanIds=${ARENA.map((clan) => clan.id).join(',')}&period=week`)
  await expect(page.getByRole('heading', { level: 1, name: 'Comparateur de clans' })).toBeVisible()
  await expect(radar(page)).toBeVisible()
})

test('arène P1 / P2 / P3 dans l’ordre de l’URL, légende du radar dans le même ordre', async ({ page }) => {
  const arena = page.getByRole('region', { name: 'Sélection des clans' }).getByRole('button', { name: /^Retirer / })
  await expect(arena).toHaveCount(3)
  for (const [index, clan] of ARENA.entries()) {
    await expect(arena.nth(index)).toHaveAccessibleName(`Retirer ${clan.name}`)
  }
  // L'API renvoie les clans par identifiant : le radar doit suivre l'arène, pas l'API (couleur P1 = premier slot).
  const legend = radar(page).getByRole('button')
  await expect(legend).toHaveCount(3)
  for (const [index, clan] of ARENA.entries()) {
    await expect(legend.nth(index)).toContainText(`P${index + 1}`)
    await expect(legend.nth(index)).toContainText(`[${clan.tag}]`)
  }
})

test('sections comparées : derby à trois paires, modes, pouls, ADN, heatmap', async ({ page }) => {
  for (const title of ['Head-to-Head', 'Performances par mode de jeu', 'Activité et rythme', 'Style de jeu tactique', 'Heatmap d’activité']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(title.replace('’', "['’]")) })).toBeVisible()
  }
})

test('la période recharge la comparaison', async ({ api, page }) => {
  expect(api.paramValues(COMPARATOR_API, 'period')).toContain('week')
  await periodFilter(page).getByRole('button', { name: 'Mois' }).click()
  await expect(page).toHaveURL(/[?&]period=month\b/)
  await expect.poll(() => api.paramValues(COMPARATOR_API, 'period').at(-1)).toBe('month')
  // L'ordre de l'arène survit au changement de période.
  await expect(page).toHaveURL(clanIdsParam(ARENA))
})

test('retirer un clan libère son slot', async ({ page }) => {
  await page.getByRole('button', { name: `Retirer ${ARENA[0].name}` }).click()
  await expect(page).toHaveURL(clanIdsParam(ARENA.slice(1)))
  await expect(page.getByRole('region', { name: 'Sélection des clans' }).getByRole('button', { name: /^Retirer / })).toHaveCount(2)
})

test('aucun défilement horizontal', async ({ page }) => {
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
