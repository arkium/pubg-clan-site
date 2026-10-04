import type { Page } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockClanDirectory, mockClanOverview } from './support/pages'

/**
 * Annuaire des clans (`/clans`) — docs/features/clans.md §Annuaire (maquette Claude Design « Clans »).
 * Visiteur qui revient (clan 1 mémorisé) : « Dernier clan consulté » épinglé, clan du moment, clans actifs triés par
 * activité, recherche, clans en sommeil repliés.
 */

const activeNames = (page: Page) => page.getByRole('region', { name: 'Clans actifs' }).locator('li b')

test.beforeEach(async ({ api, page }) => {
  mockClanDirectory(api)
  await page.goto('/clans')
  await expect(page.getByRole('heading', { level: 1, name: 'Les clans' })).toBeVisible()
})

test('bandeau et totaux sur une ligne', async ({ page }) => {
  await expect(page.getByText('4 clans suivis')).toBeVisible()
  await expect(page.getByText('11 joueurs ont joué ce soir')).toBeVisible()
  await expect(page.getByText('depuis le début du suivi', { exact: true })).toBeVisible()
})

test('à la une : dernier clan consulté et clan du moment', async ({ page }) => {
  const featured = page.getByRole('region', { name: 'À la une' })
  await expect(featured.getByText('Dernier clan consulté')).toBeVisible()
  await expect(featured).toContainText('Clan Démo')
  await expect(featured.getByRole('button', { name: 'Clan du moment : Clan Meute' })).toContainText(/en feu cette semaine/i)
})

test('clans actifs triés par activité, puis par nom ; recherche par tag', async ({ page }) => {
  // Joueurs de la soirée d'abord : Meute (8), Démo (3), puis Témoin et le clan technique ; l'endormi n'y est pas.
  await expect(activeNames(page)).toHaveText(['Clan Meute', 'Clan Démo', 'Clan Témoin', 'Ungrouped'])
  await page.getByRole('button', { name: 'Nom', exact: true }).filter({ visible: true }).click()
  await expect(activeNames(page)).toHaveText(['Clan Démo', 'Clan Meute', 'Clan Témoin', 'Ungrouped'])

  await page.getByRole('searchbox', { name: 'Rechercher un clan' }).fill('[temo]')
  await expect(activeNames(page)).toHaveText(['Clan Témoin'])
  await expect(page.getByRole('region', { name: 'À la une' })).toHaveCount(0)
})

test('style de jeu du clan : badge sur la carte, avec les trois scores ; aucun sans assez de parties', async ({ page }) => {
  const actives = page.getByRole('region', { name: 'Clans actifs' })
  const demo = actives.getByRole('listitem').filter({ hasText: 'Clan Démo' })
  await expect(demo.getByTestId('playstyle-badge')).toHaveAttribute('data-role', 'medic')
  await expect(demo.getByTestId('playstyle-badge')).toContainText(/medic/i)
  await expect(demo.getByTestId('playstyle-badge')).toHaveAttribute('title', /support 67 %/)
  await expect(actives.getByRole('listitem').filter({ hasText: 'Clan Meute' }).getByTestId('playstyle-badge')).toHaveAttribute('data-role', 'fragger')
  await expect(actives.getByRole('listitem').filter({ hasText: 'Clan Témoin' }).getByTestId('playstyle-badge')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'À la une' }).getByTestId('playstyle-badge').first()).toBeVisible()
})

test('clans en sommeil repliés, puis affichés', async ({ page }) => {
  const sleeping = page.getByRole('region', { name: 'Clans en sommeil' })
  await expect(sleeping).toContainText('1 clan · pas de partie depuis 14 jours')
  await expect(sleeping.getByText('Clan Endormi')).toHaveCount(0)
  await sleeping.getByRole('button', { name: /En sommeil/ }).click()
  await expect(sleeping.getByText('Clan Endormi')).toBeVisible()
})

test('ouvrir le clan épinglé mène à sa vue d’ensemble', async ({ api, page }) => {
  mockClanOverview(api)
  await page.getByRole('region', { name: 'À la une' }).getByRole('button', { name: /Clan Démo/ }).click()
  await expect(page).toHaveURL(new RegExp(`/clans/${CLAN_ID}/overview`))
})

test.describe('membre connecté, sans mode visiteur', () => {
  test.beforeEach(async ({ api }) => {
    // Membre du clan 1, sans droit de SuperUser : la page est visible, seul son clan s'ouvre.
    api
      .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
      // Avatar du joueur connecté, chargé par le header.
      .on('GET', '/api/members/1', { body: { avatarUrl: null } })
      .on('GET', '/api/auth/session', {
        body: {
          authenticated: true,
          user: { email: 'membre@example.com', isSuperUser: false },
          activeMemberId: 1,
          permissions: [],
          members: [{ memberId: 1, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
          isSuperUser: false,
        },
      })
  })

  test('voit l’annuaire, son clan épinglé, et n’ouvre que son clan', async ({ page }) => {
    await page.goto('/clans')
    await expect(page.getByRole('heading', { level: 1, name: 'Les clans' })).toBeVisible()
    await expect(page).toHaveURL(/\/clans$/)
    const featured = page.getByRole('region', { name: 'À la une' })
    await expect(featured.getByText('Mon clan', { exact: true })).toBeVisible()
    await expect(featured.getByRole('button', { name: /Clan Démo/ })).toBeVisible()
    // Clan du moment et autres clans : consultables, sans lien.
    await expect(featured.getByRole('button', { name: /Clan du moment/ })).toHaveCount(0)
    const list = page.getByRole('region', { name: 'Clans actifs' })
    await expect(list.getByRole('button')).toHaveCount(1)
    await expect(list.getByText('Clan Témoin')).toBeVisible()
  })
})
