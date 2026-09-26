import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockClanOverview } from './support/pages'

/**
 * Vue d'ensemble « vitrine » — docs/features/clans.md (maquette Claude Design « Vue ensemble clan »).
 * Vitrine et palmarès, briefing de la semaine, chiffres clés avec lien, duo et synergies, navigation par intention ;
 * les blocs déplacés (roster, villes, pression au drop, awards) ne sont plus sur la page.
 */

test.beforeEach(async ({ api, page }) => {
  mockClanOverview(api)
  await page.goto(`/clans/${CLAN_ID}/overview`)
  await expect(page.getByRole('heading', { level: 1, name: 'Clan Démo' })).toBeVisible()
})

test('vitrine : niveau, membres et palmarès', async ({ page }) => {
  const hero = page.getByLabel('Fiche du clan')
  await expect(hero.getByLabel('Niveau 17')).toBeVisible()
  // Clan sans image propre : celle du sélecteur de clan ; pas de raccourci de réglage pour un visiteur.
  await expect(hero.locator('img').first()).toHaveAttribute('src', '/clans/default_clan.jpg')
  await expect(hero.getByRole('link', { name: 'Ajouter l’image du clan' })).toHaveCount(0)
  await expect(hero).toContainText('55 membres PUBG')
  await expect(hero).toContainText('97')
  await expect(hero).toContainText('chicken dinners ce mois')
  await expect(hero).toContainText('#13')
  await expect(hero).toContainText('Ligue des clans · sur 29')
  // Aucun tournoi gagné : la quatrième case montre les parties du mois.
  await expect(hero).toContainText('parties ce mois')
})

test('briefing : trois faits illustrés, chacun avec son lien', async ({ page }) => {
  const briefing = page.getByRole('region', { name: 'Briefing de la semaine' })
  await expect(briefing.getByRole('link')).toHaveCount(3)
  await expect(briefing.getByRole('link', { name: /Top 1 sur Erangel/ })).toHaveAttribute('href', `/clans/${CLAN_ID}/telemetry/matches/win-1/debrief`)
  await expect(briefing.getByRole('link', { name: /431 m au Kar98k, tête/ })).toHaveAttribute('href', /tab=replay/)
  await expect(briefing.getByRole('link', { name: /3 soirées de suite avec un top 1/ })).toHaveAttribute('href', `/clans/${CLAN_ID}/matches`)
})

test('chiffres clés avec « aller plus loin », duo et synergies', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Top fraggers →' })).toHaveAttribute('href', `/clans/${CLAN_ID}/leaderboard`)
  await expect(page.getByRole('link', { name: 'Stats armes →' })).toHaveAttribute('href', `/clans/${CLAN_ID}/stats/weapons`)

  const duoAndSynergies = page.getByRole('region', { name: 'Duo et synergies' })
  // Paire au meilleur taux de top 1 avec au moins 5 parties ; la paire à 66,7 % sur 3 parties est écartée.
  await expect(duoAndSynergies).toContainText('Duo de la semaine')
  await expect(duoAndSynergies.getByRole('link', { name: /Joueur Alpha/ }).first()).toHaveAttribute('href', '/members/1/dashboard')
  await expect(duoAndSynergies).toContainText('réanimations croisées')
  await expect(duoAndSynergies).toContainText('28,6 % de top 1 ensemble')

  await duoAndSynergies.getByText('Toutes les synergies →').click()
  await expect(duoAndSynergies.getByText('Replier le détail')).toBeVisible()
})

test('navigation par intention, avec indices', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Jouer ensemble' })).toContainText('25 cette semaine')
  const compete = page.getByRole('navigation', { name: 'Se mesurer' })
  await expect(compete.getByRole('link', { name: /Ligue des clans/ })).toContainText('#13 sur 29')
  await expect(compete.getByRole('link', { name: /Classement/ })).toContainText('Joueur Alpha en tête')
  await expect(page.getByRole('navigation', { name: 'Progresser' }).getByRole('link', { name: /Drop zones/ })).toContainText('et villes')
})

test('les blocs déplacés ne sont plus sur la page', async ({ page }) => {
  await expect(page.getByText('Roster des performances')).toHaveCount(0)
  await expect(page.getByText('Awards du mode')).toHaveCount(0)
  await expect(page.getByText(/Pression au drop/i)).toHaveCount(0)
})
