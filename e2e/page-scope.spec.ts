import { expect, test } from './support/api'
import { CLAN_ID, MEMBER_ID, PLAYERS } from './support/data'
import { mockClanLeaderboard, mockDataCoverage, mockMemberItems } from './support/pages'

/**
 * Barre « D'où viennent ces chiffres ? » en bas des pages d'un joueur et d'un clan (docs/TODO/aide-des-pages.md) :
 * repliée mais dans le HTML, aucune lecture des dates avant son ouverture, puis les lignes suivent les filtres et les
 * dates de `GET /api/…/data-coverage` ; lien vers la ligne de la page dans la Méthodologie.
 */

test('classement du clan : repliée, dans le HTML, dates lues à l’ouverture seulement', async ({ api, page }) => {
  mockClanLeaderboard(api)
  mockDataCoverage(api)
  await page.goto(`/clans/${CLAN_ID}/leaderboard`)
  await expect(page.getByText(PLAYERS[0].displayName).filter({ visible: true }).first()).toBeVisible()

  const note = page.getByTestId('page-scope-note')
  await expect(note).toHaveCount(1)
  await expect(note).not.toHaveAttribute('open', '')
  // Texte général dans le HTML, sans aucune date tant que la barre est fermée.
  await expect(note.getByTestId('page-scope-matches')).toContainText('Type « Officiel »', { useInnerText: false })
  expect(api.served.some((call) => call.url.pathname.endsWith('/data-coverage'))).toBe(false)

  await note.getByText('D’où viennent ces chiffres ?').click()
  await expect(note.getByTestId('page-scope-period')).toContainText('Semaine du')
  await expect(note.getByTestId('page-scope-since')).toContainText('Parties des membres actifs ensemble depuis le 11 mai 2026 (812 parties).')
  await expect(note.getByTestId('page-scope-notes')).toContainText('sans le Solo')
  await expect(note.getByRole('link', { name: /Méthodologie/ })).toHaveAttribute('href', '/a-propos/methodologie#page-clan-leaderboard')
  expect(api.served.filter((call) => call.url.pathname === `/api/clans/${CLAN_ID}/data-coverage`)).toHaveLength(1)
})

test('objets d’un joueur : dates du joueur et parties analysées', async ({ api, page }) => {
  mockMemberItems(api)
  mockDataCoverage(api)
  await page.goto(`/members/${MEMBER_ID}/items`)
  await expect(page.getByRole('heading', { level: 1, name: 'Objets consommés de Joueur Alpha' })).toBeVisible()

  const note = page.getByTestId('page-scope-note')
  await note.getByText('D’où viennent ces chiffres ?').click()
  await expect(note.getByTestId('page-scope-source')).toContainText('Parties analysées : 736 sur 812 (91 %). 2 analyses en attente.')
  await expect(note.getByTestId('page-scope-since')).toContainText('Objets consommés depuis le 18 septembre 2026.')
  await expect(note.getByTestId('page-scope-period')).toContainText('Tout l’historique')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('Méthodologie : une ancre par page, liée depuis la barre', async ({ page }) => {
  await page.goto('/a-propos/methodologie#page-joueur-dashboard')
  await expect(page.getByRole('heading', { name: 'Pages d’un joueur, pages d’un clan' })).toBeVisible()
  await expect(page.locator('#page-joueur-dashboard')).toContainText('Frères d’armes : au moins 3 parties ensemble')
  await expect(page.locator('#page-clan-stats-maps')).toContainText('Filtre « Type de partie »')
})
