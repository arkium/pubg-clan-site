import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { appHeader, dock, scrollToY, toolbar } from './support/layout'
import { mockClanOverview } from './support/pages'
import { withSessionCookie } from './support/session'
import {
  ACTIVE_TOURNAMENT_ID,
  ADMIN_PATH,
  DRAFT_TOURNAMENT_ID,
  mockTournamentAdmin,
  signInAsOrganizer,
  signInWithoutRights,
  type TournamentAdminCalls,
} from './support/tournament-admin'

/**
 * Administration des tournois d'un clan — /clans/[clanId]/settings/tournaments (docs/features/tournois.md, « Page
 * d'administration »), selon la charte UI : liste des tournois du clan, création et modification (corps envoyés
 * vérifiés), suppression par la modale, synchronisation PUBG, diffusion Discord (envoi simulé), guide, refus sans
 * droit de gestion, aucun défilement horizontal. Toutes les API sont simulées : rien n'atteint la base ni Discord.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const card = (page: Page, title: string) => page.getByRole('article', { name: title })
const editor = (page: Page) => page.getByTestId('tournament-editor')
const discordPath = `/api/clans/${CLAN_ID}/tournaments/${ACTIVE_TOURNAMENT_ID}/discord`

/** Choisit une tuile radio en cliquant sa tuile (le bouton radio natif est masqué, la tuile est son intitulé). */
async function chooseTile(page: Page, name: string | RegExp) {
  const radio = page.getByRole('radio', { name })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'défilement horizontal de la page').toBeLessThanOrEqual(0)
}

async function openArchives(page: Page) {
  const toggle = page.getByRole('button', { name: /Brouillons et tournois terminés/ })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test.describe('organisateur (manage_settings)', () => {
  let calls: TournamentAdminCalls

  test.beforeEach(async ({ api, page }) => {
    signInAsOrganizer(api)
    calls = await mockTournamentAdmin(api, page)
    await page.goto(ADMIN_PATH)
    // Le shell remonte la page quand la session arrive (WebKit) : une saisie faite avant serait perdue.
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1, name: 'Gestion des tournois' })).toBeVisible()
  })

  test('liste du clan : actifs en cartes, brouillons et terminés repliés, mode et format de chaque tournoi', async ({ page }) => {
    const active = page.getByRole('region', { name: 'Tournois actifs' })
    await expect(active).toContainText('1 tournoi')
    const autumn = card(page, 'Coupe d’automne')
    await expect(autumn).toContainText('Actif')
    await expect(autumn).toContainText('Inter-clans')
    await expect(autumn).toContainText('Escouades mixtes au prorata')
    await expect(autumn).toContainText('Squad (partie perso)')
    await expect(autumn).toContainText('Erangel')
    await expect(autumn.getByRole('link', { name: 'Voir le classement' })).toHaveAttribute('href', `/tournaments/${ACTIVE_TOURNAMENT_ID}`)

    // Archives repliées, puis dépliées : brouillon (valeurs héritées affichées normalisées) et tournoi terminé.
    await expect(card(page, 'Coupe d’hiver')).toHaveCount(0)
    await openArchives(page)
    await expect(card(page, 'Coupe d’hiver')).toContainText('Brouillon')
    await expect(card(page, 'Coupe d’hiver')).toContainText('Équipes libres')
    await expect(card(page, 'Solo Showdown')).toContainText('Terminé')

    // Onglets sans émoji, état actif sur « Tournois ».
    await expect(toolbar(page)).not.toContainText(/🏆|✏️|💡/u)
    await expect(toolbar(page).getByRole('button', { name: 'Tournois', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expectNoHorizontalScroll(page)
  })

  test('recherche et statut filtrent la liste ; sans résultat, état vide', async ({ page }) => {
    await openArchives(page)
    await toolbar(page).getByRole('button', { name: 'Brouillons', exact: true }).click()
    await expect(page.getByTestId('tournament-admin-card')).toHaveCount(1)
    await expect(card(page, 'Coupe d’hiver')).toBeVisible()

    await toolbar(page).getByRole('button', { name: 'Tous', exact: true }).click()
    await toolbar(page).getByRole('searchbox').fill('miramar')
    await expect(page.getByTestId('tournament-admin-card')).toHaveCount(1)
    await expect(card(page, 'Solo Showdown')).toBeVisible()

    await toolbar(page).getByRole('searchbox').fill('introuvable')
    await expect(page.getByTestId('tournament-admin-empty')).toContainText('Aucun tournoi ne correspond')
    await toolbar(page).getByRole('button', { name: 'Effacer la recherche' }).click()
    await expect(page.getByTestId('tournament-admin-card').first()).toBeVisible()
  })

  test('création : erreurs sous les champs, puis corps du POST et tournoi ajouté à la liste', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouveau tournoi' }).click()
    await expect(editor(page).getByRole('heading', { level: 2, name: 'Nouveau tournoi' })).toBeVisible()
    await expect(toolbar(page).getByRole('button', { name: 'Créer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // Aucun <select> natif dans le formulaire (charte : tuiles ou menu).
    await expect(editor(page).locator('select')).toHaveCount(0)

    // Titre manquant : message sous le champ, champ marqué, rien n'est envoyé.
    await editor(page).getByRole('button', { name: 'Créer le tournoi' }).click()
    await expect(page.getByText('Le titre du tournoi est obligatoire.')).toBeVisible()
    await expect(page.getByLabel('Titre', { exact: true })).toHaveAttribute('aria-invalid', 'true')

    await page.getByLabel('Titre', { exact: true }).fill('Coupe de printemps')
    await page.getByLabel('Description').fill('Trois soirées en duo.')
    await page.getByLabel('Début', { exact: true }).fill('2026-11-10')
    await page.getByLabel('Fin', { exact: true }).fill('2026-11-01')
    await editor(page).getByRole('button', { name: 'Créer le tournoi' }).click()
    await expect(page.getByText('La date de fin doit être après la date de début.')).toBeVisible()
    await page.getByLabel('Fin', { exact: true }).fill('2026-11-14')
    // Soirées de 21 h à 3 h du matin (heure de Paris) : l'aperçu de la vitrine affiche les heures.
    await page.getByLabel('Heure de début (Paris)').fill('21:00')
    await page.getByLabel('Heure de fin (Paris)').fill('03:00')
    const preview = page.getByTestId('tournament-vitrine-preview')
    await expect(preview).toContainText('En direct : 10 nov. 21:00 → 14 nov. 03:00 (heure de Paris).')
    await expect(preview).toContainText('Brouillon : rien n’apparaît sur la vitrine')
    await expect(preview.getByTestId('home-tournament-card')).toContainText('Coupe de printemps')
    await expect(preview.getByTestId('home-tournament-card')).toContainText('Organisé par [DEMO] Clan Démo')

    // Le titre s'affiche sur la vitrine publique : un lien est signalé dans l'aperçu, puis refusé sous le champ.
    await page.getByLabel('Titre', { exact: true }).fill('Coupe sur monclan.fr')
    await expect(preview).toContainText('Ce titre sera refusé à l’enregistrement')
    await editor(page).getByRole('button', { name: 'Créer le tournoi' }).click()
    await expect(page.getByText('Le titre ne peut contenir ni lien ni adresse de site', { exact: false }).first()).toBeVisible()
    expect(calls.creates).toHaveLength(0)
    await page.getByLabel('Titre', { exact: true }).fill('Coupe de printemps')

    await editor(page).getByRole('button', { name: 'Actif', exact: true }).click()
    await expect(preview).not.toContainText('Brouillon')
    // Escouades mixtes : proposé en inter-clans seulement.
    await expect(page.getByRole('radiogroup', { name: 'Escouades mixtes' })).toBeVisible()
    await chooseTile(page, /^Solo \(chacun pour soi\)/)
    await expect(page.getByRole('radiogroup', { name: 'Escouades mixtes' })).toHaveCount(0)
    await chooseTile(page, 'Duo (partie perso)')
    await page.getByRole('button', { name: 'Carte : Toutes les cartes' }).click()
    await page.getByRole('menuitemradio', { name: 'Miramar' }).click()
    await expect(page.getByRole('button', { name: 'Carte : Miramar' })).toBeVisible()
    await page.getByLabel('Top 1', { exact: true }).fill('20')
    await page.getByLabel('Points par kill').fill('2')
    await page.getByLabel('Meilleures manches retenues').fill('3')
    await page.getByLabel('Webhook dédié à ce tournoi').fill('https://discord.com/api/webhooks/42/printemps')
    await expectNoHorizontalScroll(page)

    await editor(page).getByRole('button', { name: 'Créer le tournoi' }).click()
    await expect(page.getByTestId('tournament-admin-success')).toContainText('Tournoi créé avec succès.')
    expect(calls.creates).toHaveLength(1)
    expect(calls.creates[0]).toEqual({
      title: 'Coupe de printemps',
      description: 'Trois soirées en duo.',
      startDate: '2026-11-10',
      endDate: '2026-11-14',
      startTime: '21:00',
      endTime: '03:00',
      gameMode: 'normal-duo',
      mapName: 'Desert_Main',
      status: 'active',
      rules: {
        mode: 'solo_ffa',
        mixedSquadRule: 'full_share',
        placementPoints: { '1': 20, '2': 12, '3': 10, '4': 8, '5': 6, '6': 4, '7': 2, '8': 1, '9': 1, '10': 1 },
        killPoints: 2,
        winBonus: 5,
        bestOfRounds: 3,
      },
      discordWebhookUrl: 'https://discord.com/api/webhooks/42/printemps',
    })
    await expect(card(page, 'Coupe de printemps')).toContainText('Solo')
    await expect(page.getByRole('region', { name: 'Tournois actifs' })).toContainText('2 tournois')
  })

  test('erreur du serveur à l’enregistrement : affichée sous le formulaire', async ({ api, page }) => {
    api.on('POST', `/api/clans/${CLAN_ID}/tournaments`, { status: 400, body: { error: 'Title is required' } })
    await page.getByRole('button', { name: 'Nouveau tournoi' }).click()
    await page.getByLabel('Titre', { exact: true }).fill('Coupe refusée')
    await editor(page).getByRole('button', { name: 'Créer le tournoi' }).click()
    await expect(editor(page).getByRole('alert')).toContainText('Title is required')
  })

  test('modification : formulaire pré-rempli (valeurs héritées normalisées), corps du PATCH', async ({ page }) => {
    await openArchives(page)
    await card(page, 'Coupe d’hiver').getByRole('button', { name: 'Modifier', exact: true }).click()
    await expect(editor(page).getByRole('heading', { level: 2, name: 'Modifier : Coupe d’hiver' })).toBeVisible()
    await expect(toolbar(page).getByRole('button', { name: 'Modifier', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // « squad » et « Erangel » (avant le 2026-09-18) ramenés aux valeurs des matchs.
    await expect(page.getByRole('radio', { name: 'Squad (partie perso)' })).toBeChecked()
    await expect(page.getByRole('button', { name: 'Carte : Erangel' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /^Équipes libres/ })).toBeChecked()
    await expect(page.getByLabel('Meilleures manches retenues')).toHaveValue('3')
    await expect(page.getByLabel('Webhook dédié à ce tournoi')).toHaveValue('https://discord.com/api/webhooks/123/abc')
    await expect(editor(page).getByRole('button', { name: 'Brouillon', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await page.getByLabel('Titre', { exact: true }).fill('Coupe d’hiver 2026')
    await chooseTile(page, /^Inter-clans/)
    await chooseTile(page, /^Au prorata/)
    await editor(page).getByRole('button', { name: 'Enregistrer les modifications' }).click()

    await expect(page.getByTestId('tournament-admin-success')).toContainText('Tournoi mis à jour.')
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].id).toBe(DRAFT_TOURNAMENT_ID)
    expect(calls.updates[0].body).toMatchObject({
      title: 'Coupe d’hiver 2026',
      status: 'draft',
      gameMode: 'normal-squad',
      mapName: 'Baltic_Main',
      rules: { mode: 'inter_clan', mixedSquadRule: 'prorata', bestOfRounds: 3 },
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    })
    expect(calls.creates).toHaveLength(0)
  })

  test('suppression : modale de confirmation, DELETE envoyé, données de jeu annoncées préservées', async ({ page }) => {
    await card(page, 'Coupe d’automne').getByRole('button', { name: 'Supprimer', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Supprimer « Coupe d’automne » ?' })
    await expect(dialog).toContainText('Vos données de jeu sont préservées.')
    await expectNoHorizontalScroll(page)
    // Échap ferme sans rien supprimer.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(calls.deletes).toEqual([])

    await card(page, 'Coupe d’automne').getByRole('button', { name: 'Supprimer', exact: true }).click()
    await dialog.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await expect(dialog).toHaveCount(0)
    expect(calls.deletes).toEqual([ACTIVE_TOURNAMENT_ID])
    await expect(page.getByTestId('tournament-admin-success')).toContainText(
      'Tournoi « Coupe d’automne » supprimé. Les matchs et les statistiques sont intacts.'
    )
    await expect(card(page, 'Coupe d’automne')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Tournois actifs' })).toHaveCount(0)
  })

  test('synchronisation PUBG : appel du tournoi et toast du résultat, puis « rien de nouveau, recliquez »', async ({ page }) => {
    const syncButton = card(page, 'Coupe d’automne').getByRole('button', { name: 'Synchroniser PUBG' })
    await syncButton.click()
    const toast = page.getByTestId('tournament-admin-toast')
    await expect(toast).toContainText('1 nouvelle manche ajoutée — 3 manches au total.')
    await expect(toast).toContainText('le replay de la manche suit dans quelques secondes')
    expect(calls.syncs).toEqual([ACTIVE_TOURNAMENT_ID])
    await toast.getByRole('button', { name: 'Fermer la notification' }).click()
    await expect(toast).toHaveCount(0)

    // Second clic, rien de publié depuis : le message dit d'attendre et de recliquer, sans risque.
    await syncButton.click()
    await expect(toast).toContainText('Aucune nouvelle manche — 3 manches déjà au classement.')
    await expect(toast).toContainText('recliquer est sans risque')
    expect(calls.syncs).toEqual([ACTIVE_TOURNAMENT_ID, ACTIVE_TOURNAMENT_ID])
  })

  test('diffusion Discord : dernière manche par défaut, aperçu, manche déjà diffusée, envoi simulé', async ({ api, page }) => {
    await card(page, 'Coupe d’automne').getByRole('button', { name: 'Diffuser sur Discord' }).click()
    const dialog = page.getByRole('dialog', { name: 'Diffuser une manche sur Discord' })
    await expect(dialog.getByRole('button', { name: /^Manche à diffuser : Manche #3/ })).toBeVisible()
    await expect(dialog.getByTestId('discord-embed-preview')).toContainText('Résultats Manche #3')
    await expect(dialog.getByTestId('discord-embed-preview')).toContainText('Scores de la manche')
    await expect(dialog.locator('select')).toHaveCount(0)
    await expectNoHorizontalScroll(page)

    await dialog.getByRole('button', { name: /^Manche à diffuser/ }).click()
    await dialog.getByRole('menuitemradio', { name: /Manche #2/ }).click()
    await expect(dialog).toContainText('Cette manche a déjà été diffusée')
    await expect(dialog.getByTestId('discord-embed-preview')).toContainText('Résultats Manche #2')
    // Valeurs distinctes : en développement, React rejoue les effets (StrictMode) et double certains appels.
    expect([...new Set(api.paramValues(discordPath, 'matchId'))]).toEqual([null, 'match-3', 'match-2'])

    await dialog.getByRole('button', { name: 'Confirmer et rediffuser' }).click()
    await expect(dialog).toHaveCount(0)
    expect(calls.broadcasts).toEqual([{ id: ACTIVE_TOURNAMENT_ID, body: { matchId: 'match-2' } }])
    await expect(page.getByTestId('tournament-admin-toast')).toContainText('Manche #2 publiée sur Discord.')
  })

  test('guide : sept fiches, en onglet', async ({ page }) => {
    await toolbar(page).getByRole('button', { name: 'Guide', exact: true }).click()
    const guide = page.getByTestId('tournament-guide')
    await expect(guide.getByRole('heading', { level: 2, name: 'Comment fonctionne un tournoi ?' })).toBeVisible()
    await expect(guide.locator('ol > li')).toHaveCount(7)
    await expect(guide).toContainText('La règle d’or de l’organisateur')
    await expectNoHorizontalScroll(page)
  })

  test('bandeau : docké sur ordinateur (statut en menu), jamais sur mobile', async ({ page }, testInfo) => {
    // Fenêtre basse : trois tournois suffisent à faire défiler la page au-delà du seuil de docking.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 520 })
    await expect(appHeader(page)).toBeVisible()
    await openArchives(page)
    if (isMobile(testInfo)) {
      // Page sans période : rien de docké sous 640 px (sticky.md §2).
      await scrollToY(page, 900)
      await expect(toolbar(page)).toHaveAttribute('data-docked', 'false')
      return
    }
    await dock(page)
    await expect(toolbar(page).getByRole('searchbox')).toBeVisible()
    await expect(toolbar(page).getByRole('button', { name: 'Statut : Tous' })).toBeVisible()
  })
})

test('sans droit de gestion : renvoi vers la vue d’ensemble du clan, aucun tournoi chargé', async ({ api, page }) => {
  signInWithoutRights(api)
  mockClanOverview(api)
  await page.goto(ADMIN_PATH)
  await page.waitForURL(`**/clans/${CLAN_ID}/overview`)
  await expect(page.getByRole('heading', { level: 1, name: 'Gestion des tournois' })).toHaveCount(0)
  expect(api.served.some((call) => call.url.pathname === `/api/clans/${CLAN_ID}/tournaments`)).toBe(false)
})
