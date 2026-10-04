import type { Locator, Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import {
  DOCK_ID,
  ERANGEL,
  FUEL_ID,
  MINE_ID,
  MIRAMAR,
  NEW_POINT_ID,
  VIKENDI,
  mockResources,
  type ResourceMockOptions,
} from './support/resources'
import { mockMemberSession } from './support/session'
import type { ApiMock } from './support/api'

/**
 * Carte des ressources (docs/features/carte-ressources.md ; maquette « Carte des ressources : carte, fiche, signaler et
 * proposer »). Toutes les routes sont simulées (e2e/support/resources.ts) : la page ne dépend que du contrat
 * src/lib/resources/resource-api.ts.
 */

const PATH = '/carte-des-ressources'
const LOGIN = '/login?redirect=/carte-des-ressources'

const map = (page: Page) => page.getByTestId('resource-map')
const viewport = (page: Page) => map(page).locator('[data-drop-zone-map-viewport]')
const points = (page: Page) => page.getByTestId('resource-point')
const spots = (page: Page) => page.getByTestId('resource-spot')
const sheet = (page: Page) => page.getByTestId('resource-sheet')
const flow = (page: Page) => page.getByTestId('resource-flow')
const layers = (page: Page) => page.getByTestId('resource-layers')
const layerCount = (page: Page, layer: string) => page.getByTestId(`layer-${layer}`).getByTestId('layer-count')
/** La puce d'état est rendue deux fois (ligne du haut sur bureau, sous la carte sur mobile) : la visible. */
const mapState = (page: Page) => page.locator('[data-testid="map-state"]:visible')
const pointButton = (page: Page, id: string) => page.locator(`[data-testid="resource-point"][data-point-id="${id}"]`)

async function openPage(page: Page, path = PATH) {
  await page.goto(path)
  // Le shell remonte la page quand la session arrive : un clic fait avant serait perdu.
  await page.waitForLoadState('networkidle')
  await expect(map(page)).toHaveAttribute('aria-busy', 'false')
  // Drop zones lues : aucune lecture en vol quand le test navigue ailleurs (WebKit signale la requête coupée).
  await expect(page.getByTestId('resource-explorer')).not.toHaveAttribute('data-drop-zones', 'loading')
}

function signedIn(api: ApiMock, options: ResourceMockOptions = {}) {
  mockMemberSession(api, { superUser: options.superUser })
  return mockResources(api, { signedIn: true, ...options })
}

/** Clic sur la carte, en proportion de sa largeur et de sa hauteur (zoom 1×). */
async function clickMap(page: Page, xRatio: number, yRatio: number) {
  const box = await viewport(page).boundingBox()
  if (!box) throw new Error('carte invisible')
  await viewport(page).click({ position: { x: box.width * xRatio, y: box.height * yRatio } })
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollers: [...document.querySelectorAll('.app-main-flush *')]
      .filter((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className.toString().slice(0, 80)),
  }))
}

/** Appels successifs sans les doublons consécutifs (double montage du mode strict, remontage par le shell). */
function distinct(values: Array<string | null>) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1])
}

const isDesktopNav = (testInfo: TestInfo) => testInfo.project.name === 'chromium-desktop'

async function expectLoginLink(locator: Locator) {
  await expect(locator).toHaveAttribute('href', LOGIN)
}

test.describe('page, carrousel et couches', () => {
  test('bandeau, Erangel par défaut, état « Vérifiée », couches, compteurs et légende', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)

    await expect(page.getByRole('heading', { level: 1, name: 'Carte des ressources' })).toBeVisible()
    await expect(page.getByText('Véhicules repérés dans nos parties, et points utiles placés par les joueurs.')).toBeVisible()
    await expect(page.getByTestId('active-map')).toHaveText('Erangel')
    expect(distinct(api.paramValues('/api/resources', 'map'))).toEqual([ERANGEL])
    await expect(mapState(page)).toHaveText('Vérifiée le 28/09/2026')
    await expect(page.getByTestId('resource-recheck')).toHaveCount(0)

    // Couches : familles observées et types saisis, avec leur nombre ; « Voitures ou motos » absente (aucun emplacement).
    for (const [layer, count] of [['car', '2'], ['moto', '1'], ['boat', '1'], ['glider', '1'], ['fuel', '1'], ['garage', '1'], ['dock', '1'], ['secret_room', '0']]) {
      await expect(layerCount(page, layer)).toHaveText(count)
    }
    await expect(page.getByTestId('layer-land')).toHaveCount(0)
    await expect(layers(page).getByText('Observés dans les parties')).toBeVisible()
    await expect(layers(page).getByText('Saisis par les joueurs')).toBeVisible()
    await expect(spots(page)).toHaveCount(5)
    await expect(points(page)).toHaveCount(3)

    // Taille selon la fréquence, au sein de la famille : voiture à 62 % > voiture à 12 % ; le seul planeur (8 %), le plus
    // fréquent de sa famille, est aussi gros que la voiture la plus fréquente.
    const sizeOf = async (name: string) => Number(await page.getByRole('button', { name }).getAttribute('data-size'))
    const bigCar = await sizeOf('Voiture, grille D-L, observé dans 62 % des parties')
    const smallCar = await sizeOf('Voiture, grille F-K, observé dans 12 % des parties')
    expect(bigCar).toBeGreaterThan(smallCar)
    expect(await sizeOf('Planeur, grille B-O, observé dans 8 % des parties')).toBe(bigCar)

    // Décocher une couche retire ses marqueurs ; son nombre reste affiché.
    await page.getByTestId('layer-car').click()
    await expect(page.getByTestId('layer-car').getByRole('checkbox')).not.toBeChecked()
    await expect(spots(page)).toHaveCount(3)
    await expect(layerCount(page, 'car')).toHaveText('2')
    await page.getByTestId('layer-dock').click()
    await expect(points(page)).toHaveCount(2)
    await page.getByTestId('layer-car').click()
    await expect(spots(page)).toHaveCount(5)

    const legend = page.getByTestId('resource-legend')
    for (const label of ['Observé : plus c’est gros, plus c’est fréquent', 'Saisi et validé', 'En attente, visible par toi', 'À confirmer']) {
      await expect(legend.getByText(label)).toBeVisible()
    }
    // Zoom standard des cartes.
    await expect(map(page).getByRole('button', { name: 'Augmenter le zoom' })).toBeVisible()
  })

  test('carrousel : flèches, pastilles et ?map= ; l’ancienne carte reste, estompée, pendant le chargement', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)

    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      (url) => url.pathname === '/api/resources' && url.searchParams.get('map') === MIRAMAR,
      async (route) => {
        await gate
        await route.fallback()
      }
    )
    await page.getByRole('button', { name: 'Carte suivante' }).click()
    await expect(page).toHaveURL(/\?map=Desert_Main$/)
    await expect(page.getByTestId('active-map')).toHaveText('Miramar')
    // Pas de repli : l'ancienne carte et ses marqueurs restent, estompés.
    await expect(map(page)).toHaveAttribute('aria-busy', 'true')
    await expect(map(page)).toHaveAttribute('data-map', ERANGEL)
    await expect(points(page)).toHaveCount(3)
    release()
    await expect(map(page)).toHaveAttribute('data-map', MIRAMAR)
    await expect(map(page)).toHaveAttribute('aria-busy', 'false')
    await expect(points(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Vikendi', exact: true }).click()
    await expect(page).toHaveURL(/\?map=DihorOtok_Main$/)
    await expect(map(page)).toHaveAttribute('data-map', VIKENDI)
    await page.getByRole('button', { name: 'Carte précédente' }).click()
    await expect(page).toHaveURL(/\?map=Tiger_Main$/)
    await expect(page.getByTestId('active-map')).toHaveText('Taego')
    expect(distinct(api.paramValues('/api/resources', 'map'))).toEqual([ERANGEL, MIRAMAR, VIKENDI, 'Tiger_Main'])

    // Lien direct vers une carte, et carte inconnue ramenée à Erangel.
    await openPage(page, `${PATH}?map=Savage_Main`)
    await expect(page.getByTestId('active-map')).toHaveText('Sanhok')
    await expect(map(page)).toHaveAttribute('data-map', 'Savage_Main')
    await openPage(page, `${PATH}?map=Range_Main`)
    await expect(map(page)).toHaveAttribute('data-map', ERANGEL)
  })

  test('carte vide (Vikendi) : encart « Aucun point saisi » et premier point proposé', async ({ api, page }) => {
    signedIn(api)
    await openPage(page, `${PATH}?map=${VIKENDI}`)
    const empty = page.getByTestId('resource-empty')
    await expect(empty).toContainText('Aucun point saisi sur Vikendi')
    await expect(empty).toContainText('Stations-service, garages, pontons : tu connais un bon spot ? Place le premier, un superuser le validera.')
    // Les emplacements observés restent ; la couche « Voitures ou motos » apparaît (elle a un emplacement).
    await expect(spots(page)).toHaveCount(2)
    await expect(layerCount(page, 'land')).toHaveText('1')
    await expect(mapState(page)).toHaveCount(0)

    await empty.getByRole('button', { name: 'Proposer le premier point' }).click()
    await expect(page.getByTestId('resource-empty')).toHaveCount(0)
    await expect(flow(page)).toHaveAttribute('data-step', '1')
    await expect(page.getByTestId('resource-place-hint')).toHaveText('Clique sur la carte pour placer le point')
  })

  test('autour de nos drop zones : seuls les marqueurs à 800 m restent, nombres et cercles suivent', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)
    await expect(page.getByTestId('near-help')).toHaveText('Pochinki, School, Georgopol · 800 m')
    expect(distinct(api.paramValues('/api/resources/drop-zones', 'clanId'))).toEqual(['1'])
    const toggle = page.getByRole('switch', { name: 'Autour de nos drop zones' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('resource-near-circle')).toHaveCount(3)
    await expect(spots(page)).toHaveCount(2)
    await expect(points(page)).toHaveCount(2)
    for (const [layer, count] of [['car', '1'], ['moto', '1'], ['boat', '0'], ['glider', '0'], ['fuel', '1'], ['garage', '1'], ['dock', '0']]) {
      await expect(layerCount(page, layer)).toHaveText(count)
    }
    await expect(pointButton(page, DOCK_ID)).toHaveCount(0)

    // Carte sans drop du clan : interrupteur désactivé, explication, filtre coupé.
    await page.getByRole('button', { name: 'Vikendi', exact: true }).click()
    await expect(map(page)).toHaveAttribute('data-map', VIKENDI)
    await expect(page.getByTestId('near-help')).toHaveText('Aucun drop du clan sur Vikendi pour l’instant.')
    await expect(toggle).toBeDisabled()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(spots(page)).toHaveCount(2)
  })

  test('sans clan sélectionné : interrupteur désactivé, aucune lecture des drop zones', async ({ api, page }) => {
    mockResources(api)
    await page.addInitScript(() => window.localStorage.removeItem('selectedClanId'))
    await openPage(page)
    await expect(page.getByTestId('near-help')).toHaveText('Choisis un clan pour filtrer autour de ses drop zones.')
    await expect(page.getByRole('switch', { name: 'Autour de nos drop zones' })).toBeDisabled()
    expect(api.paramValues('/api/resources/drop-zones', 'map')).toEqual([])
  })
})

test.describe('fiches', () => {
  test('point validé (visiteur) : auteur, validation, confirmations ; « Toujours là » et « Signaler » mènent à la connexion', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)
    await page.getByRole('button', { name: 'Station-service, grille C-K', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Station-service, grille C-K', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await expect(sheet(page)).toHaveAttribute('data-state', 'validated')
    await expect(sheet(page).getByRole('heading', { name: 'Station-service' })).toBeVisible()
    await expect(sheet(page)).toContainText('Erangel · grille C-K')
    await expect(sheet(page).getByTestId('sheet-chip')).toHaveText('Saisi et validé')
    await expect(sheet(page)).toContainText('Ajouté par Vexa')
    await expect(sheet(page)).toContainText('21 points validés')
    await expect(sheet(page)).toContainText('Validé par Arkium')
    await expect(sheet(page).getByTestId('sheet-confirmation')).toHaveText('Confirmé 29 sept. · 4 confirmations')
    await expectLoginLink(sheet(page).getByRole('link', { name: 'Toujours là' }))
    await expectLoginLink(sheet(page).getByRole('link', { name: 'Signaler un problème' }))
    await expect(sheet(page)).toContainText('Connecte-toi pour confirmer ou signaler un point.')
    await expect(layers(page)).toHaveCount(0)

    await sheet(page).getByRole('button', { name: 'Fermer la fiche' }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect(layers(page)).toBeVisible()
  })

  test('emplacement observé : fréquence, barre, observations — jamais « Signaler »', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)
    await page.getByRole('button', { name: 'Voiture, grille D-L, observé dans 62 % des parties' }).click()
    await expect(sheet(page)).toHaveAttribute('data-state', 'observed')
    await expect(sheet(page).getByRole('heading', { name: 'Voiture' })).toBeVisible()
    await expect(sheet(page)).toContainText('Erangel · grille D-L')
    await expect(sheet(page).getByTestId('sheet-chip')).toHaveText('Observé dans les parties analysées')
    await expect(sheet(page).getByTestId('sheet-share')).toHaveText('62 % des parties : trouvé ici')
    await expect(sheet(page)).toContainText('48 observations sur 78 parties analysées. Mis à jour chaque nuit.')
    await expect(sheet(page).getByRole('button', { name: 'Signaler un problème' })).toHaveCount(0)
    await expect(sheet(page).getByRole('link', { name: 'Signaler un problème' })).toHaveCount(0)
  })

  test('carte à revérifier : bandeau, puce, point « à confirmer » ; « Toujours là » met tout à jour', async ({ api, page }) => {
    const resources = signedIn(api, { recheck: true })
    await openPage(page)
    await expect(mapState(page)).toHaveText('À revérifier depuis le 1/10')
    await expect(page.getByTestId('resource-recheck')).toHaveText(
      'Mise à jour PUBG du 1/10 : 9 points saisis à confirmer. Si tu passes devant, ouvre le point et clique « Toujours là ».'
    )
    await expect(pointButton(page, FUEL_ID)).toHaveAttribute('data-state', 'to_confirm')

    await page.getByRole('button', { name: 'Station-service, grille C-K, à confirmer' }).click()
    await expect(sheet(page)).toHaveAttribute('data-state', 'to_confirm')
    await expect(sheet(page).getByTestId('sheet-chip')).toHaveText('À confirmer depuis la mise à jour PUBG')
    await expect(sheet(page).getByTestId('sheet-confirmation')).toHaveText('Confirmé : pas encore depuis la mise à jour')
    const confirm = sheet(page).getByRole('button', { name: 'Toujours là' })
    await expect(confirm).toHaveClass(/app-btn--primary/)
    await confirm.click()

    await expect.poll(() => resources.confirms).toEqual([FUEL_ID])
    await expect(sheet(page)).toHaveAttribute('data-state', 'validated')
    await expect(sheet(page).getByTestId('sheet-chip')).toHaveText('Saisi et validé')
    await expect(sheet(page).getByRole('button', { name: 'Confirmé' })).toBeDisabled()
    await expect(sheet(page).getByTestId('sheet-confirmation')).toHaveText('Confirmé 4 oct. · 5 confirmations')
    await expect(pointButton(page, FUEL_ID)).toHaveAttribute('data-state', 'validated')
    await expect(page.getByTestId('resource-recheck')).toContainText(': 8 points saisis à confirmer.')
  })

  test('sa proposition en attente : pointillés, fiche, annulation confirmée en modale', async ({ api, page }) => {
    const resources = signedIn(api)
    await openPage(page)
    await expect(points(page)).toHaveCount(4)
    await expect(pointButton(page, MINE_ID)).toHaveAttribute('data-state', 'pending')
    await expect(pointButton(page, MINE_ID)).toHaveClass(/border-dashed/)

    await page.getByRole('button', { name: 'Salle secrète, grille E-L, ta proposition en attente' }).click()
    await expect(sheet(page)).toHaveAttribute('data-state', 'pending')
    await expect(sheet(page).getByTestId('sheet-chip')).toHaveText('En attente de validation')
    await expect(sheet(page)).toContainText('Ta proposition du 3 oct. Visible seulement par toi et les superusers jusqu’à sa validation.')
    await expect(sheet(page)).toContainText('« Clé dans la maison bleue »')

    await sheet(page).getByRole('button', { name: 'Annuler ma proposition' }).click()
    const modal = page.getByRole('dialog', { name: 'Annuler ta proposition ?' })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Garder' }).click()
    await expect(modal).toHaveCount(0)
    expect(resources.cancels).toEqual([])

    await sheet(page).getByRole('button', { name: 'Annuler ma proposition' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler la proposition' }).click()
    await expect.poll(() => resources.cancels).toEqual([MINE_ID])
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(pointButton(page, MINE_ID)).toHaveCount(0)
    await expect(page.getByTestId('resource-notice')).toHaveText('Ta proposition est annulée.')
    await expect(layers(page)).toBeVisible()
  })
})

test.describe('signaler un problème', () => {
  async function openReport(page: Page) {
    await page.getByRole('button', { name: 'Station-service, grille C-K', exact: true }).click()
    await sheet(page).getByRole('button', { name: 'Signaler un problème' }).click()
    await expect(flow(page)).toHaveAttribute('data-step', '1')
    await expect(flow(page).getByRole('heading', { name: 'Signaler un problème' })).toBeVisible()
    await expect(flow(page)).toContainText('Station-service · Erangel · grille C-K')
    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 1 / 3')
    await expect(flow(page).getByRole('button', { name: 'Continuer' })).toBeDisabled()
  }

  test('« N’existe plus » : du motif directement à l’envoi, corps vérifié, remerciement', async ({ api, page }) => {
    const resources = signedIn(api)
    await openPage(page)
    await openReport(page)
    const reasons = flow(page).getByRole('radiogroup', { name: 'Motif du signalement' })
    await expect(reasons.getByRole('radio')).toHaveCount(3)
    await reasons.getByText('N’existe plus').click()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 3 / 3')
    const comment = flow(page).getByRole('textbox', { name: 'Commentaire (facultatif)' })
    await expect(comment).toHaveAttribute('placeholder', 'ex. Détruite depuis la mise à jour')
    // Retour : l'étape 2 n'existe pas pour ce motif.
    await flow(page).getByRole('button', { name: 'Retour' }).click()
    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 1 / 3')
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await comment.fill('  Détruite depuis la mise à jour  ')
    await flow(page).getByRole('button', { name: 'Envoyer' }).click()

    await expect.poll(() => resources.reports).toEqual([{ pointId: FUEL_ID, body: { kind: 'missing', comment: 'Détruite depuis la mise à jour' } }])
    await expect(flow(page)).toHaveAttribute('data-step', 'done')
    await expect(flow(page)).toContainText('Merci, ton signalement attend la validation')
    await expect(flow(page)).toContainText('Un superuser le vérifie. Si d’autres joueurs signalent la même chose, ça ira plus vite.')
    await expect(flow(page).getByTestId('validated-count')).toHaveText('Tu as 12 points validés')
    await flow(page).getByRole('button', { name: 'Retour à la carte' }).click()
    await expect(layers(page)).toBeVisible()

    // Un second signalement n'est pas proposé.
    await page.getByRole('button', { name: 'Station-service, grille C-K', exact: true }).click()
    await expect(sheet(page).getByRole('button', { name: 'Signalement envoyé' })).toBeDisabled()
  })

  test('« Mal placé » : nouvelle position posée sur la carte', async ({ api, page }) => {
    const resources = signedIn(api)
    await openPage(page)
    await openReport(page)
    await flow(page).getByText('Mal placé').click()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 2 / 3')
    await expect(flow(page)).toContainText('Nouvelle position')
    await expect(flow(page).getByTestId('placement-status')).toHaveText('Pas encore placé')
    await expect(flow(page).getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await expect(page.getByTestId('resource-place-hint')).toBeVisible()
    await expect(map(page)).toHaveAttribute('data-placing', 'true')

    await clickMap(page, 0.5, 0.25)
    await expect(flow(page).getByTestId('placement-status')).toHaveText('Placé en grille E-K')
    await expect(page.getByTestId('resource-draft')).toBeVisible()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByTestId('resource-place-hint')).toHaveCount(0)
    await flow(page).getByRole('button', { name: 'Envoyer' }).click()

    await expect.poll(() => resources.reports.length).toBe(1)
    const { pointId, body } = resources.reports[0]
    expect(pointId).toBe(FUEL_ID)
    expect(body.kind).toBe('misplaced')
    expect(Math.abs((body.x ?? 0) - 4096)).toBeLessThan(40)
    expect(Math.abs((body.y ?? 0) - 2048)).toBeLessThan(40)
    expect(body).not.toHaveProperty('comment')
    expect(body).not.toHaveProperty('proposedKind')
    await expect(flow(page)).toHaveAttribute('data-step', 'done')
  })

  test('« Mauvais type » : nouveau type parmi les quatre, type actuel exclu', async ({ api, page }) => {
    const resources = signedIn(api)
    await openPage(page)
    await openReport(page)
    await flow(page).getByText('Mauvais type').click()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await expect(flow(page)).toContainText('Nouveau type')
    const kinds = flow(page).getByRole('radiogroup', { name: 'Type du point' })
    await expect(kinds.getByRole('radio')).toHaveCount(4)
    await expect(kinds.getByRole('radio').first()).toBeDisabled()
    await expect(kinds).toContainText('Type actuel')
    await kinds.getByText('Garage').click()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await flow(page).getByRole('button', { name: 'Retour' }).click()
    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 2 / 3')
    await flow(page).getByRole('button', { name: 'Continuer' }).click()
    await flow(page).getByRole('button', { name: 'Envoyer' }).click()
    await expect.poll(() => resources.reports).toEqual([{ pointId: FUEL_ID, body: { kind: 'wrong_kind', proposedKind: 'garage' } }])
  })

  test('« Annuler » à la première étape ramène à la fiche du point', async ({ api, page }) => {
    signedIn(api)
    await openPage(page)
    await openReport(page)
    await flow(page).getByRole('button', { name: 'Annuler' }).click()
    await expect(flow(page)).toHaveCount(0)
    await expect(sheet(page)).toHaveAttribute('data-state', 'validated')
  })
})

test.describe('proposer un point', () => {
  test('placer → type → envoyer : corps vérifié, le point apparaît en pointillés', async ({ api, page }) => {
    const resources = signedIn(api)
    await openPage(page)
    await page.getByRole('button', { name: 'Proposer un point' }).click()
    await expect(flow(page)).toHaveAttribute('data-step', '1')
    await expect(flow(page).getByRole('heading', { name: 'Proposer un point' })).toBeVisible()
    await expect(flow(page)).toContainText('Clique sur la carte à l’endroit du point. Zoome pour être précis.')
    await expect(page.getByTestId('resource-place-hint')).toHaveText('Clique sur la carte pour placer le point')
    await expect(flow(page).getByRole('button', { name: 'Continuer' })).toBeDisabled()
    // Pendant le placement, les marqueurs laissent passer le clic.
    await expect(pointButton(page, FUEL_ID)).toHaveClass(/pointer-events-none/)

    await clickMap(page, 0.3, 0.6)
    await expect(flow(page).getByTestId('placement-status')).toHaveText('Placé en grille C-M')
    await expect(page.getByTestId('resource-draft')).toBeVisible()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()

    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 2 / 3')
    const kinds = flow(page).getByRole('radiogroup', { name: 'Type du point' })
    await expect(kinds.getByRole('radio')).toHaveCount(4)
    await expect(flow(page).getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await kinds.getByText('Salle secrète').click()
    await flow(page).getByRole('button', { name: 'Continuer' }).click()

    await expect(flow(page).getByTestId('flow-step')).toHaveText('Étape 3 / 3')
    await flow(page).getByRole('textbox', { name: 'Commentaire (facultatif)' }).fill('Clé au premier étage')
    await flow(page).getByRole('button', { name: 'Envoyer' }).click()

    await expect.poll(() => resources.proposals.length).toBe(1)
    const body = resources.proposals[0]
    expect(body).toMatchObject({ map: ERANGEL, kind: 'secret_room', comment: 'Clé au premier étage' })
    expect(Math.abs(body.x - 0.3 * 8192)).toBeLessThan(40)
    expect(Math.abs(body.y - 0.6 * 8192)).toBeLessThan(40)

    await expect(flow(page)).toHaveAttribute('data-step', 'done')
    await expect(flow(page)).toContainText('Merci, ta proposition attend la validation')
    await expect(flow(page)).toContainText('Un superuser la vérifie. En attendant, le point apparaît en pointillés, pour toi seulement.')
    await expect(flow(page).getByTestId('validated-count')).toHaveText('Tu as 3 points validés')
    const created = pointButton(page, NEW_POINT_ID)
    await expect(created).toHaveAttribute('data-state', 'pending')
    await expect(created).toHaveClass(/border-dashed/)
    await expect(page.getByTestId('resource-draft')).toHaveCount(0)
    await flow(page).getByRole('button', { name: 'Retour à la carte' }).click()
    await expect(layerCount(page, 'secret_room')).toHaveText('2')
  })

  test('visiteur : « Proposer un point » invite à se connecter', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)
    await expectLoginLink(page.getByRole('link', { name: 'Proposer un point' }))
    await openPage(page, `${PATH}?map=${VIKENDI}`)
    await expectLoginLink(page.getByTestId('resource-empty').getByRole('link', { name: 'Proposer le premier point' }))
  })
})

test.describe('vue SuperUser et menu', () => {
  test('SuperUser : onglets Carte | Validation | Historique, pastille, onglet dans l’URL', async ({ api, page }) => {
    signedIn(api, { superUser: true, queueCount: 5 })
    await openPage(page, `${PATH}?map=${MIRAMAR}`)
    const tabs = page.getByRole('tablist', { name: 'Carte des ressources' })
    await expect(tabs.getByRole('tab')).toHaveText(['Carte', /^Validation\s*5$/, 'Historique'])
    await expect(page.getByTestId('queue-badge')).toHaveText('5')
    await expect(page.getByTestId('superuser-mention')).toHaveText('Vue superuser')
    await expect(page.getByRole('tab', { name: 'Carte' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('tab', { name: /Validation/ }).click()
    await expect(page).toHaveURL(/\?map=Desert_Main&tab=validation$/)
    await expect(page.getByRole('tab', { name: /Validation/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#resources-panel-validation')).toBeVisible()
    await expect(page.getByTestId('resource-explorer')).toBeHidden()

    await page.getByRole('tab', { name: 'Historique' }).click()
    await expect(page).toHaveURL(/\?map=Desert_Main&tab=history$/)
    await expect(page.locator('#resources-panel-history')).toBeVisible()
    await page.getByRole('tab', { name: 'Carte' }).click()
    await expect(page).toHaveURL(/\?map=Desert_Main$/)
    await expect(page.getByTestId('resource-explorer')).toBeVisible()
    await expect(map(page)).toHaveAttribute('data-map', MIRAMAR)

    await openPage(page, `${PATH}?tab=history`)
    await expect(page.getByRole('tab', { name: 'Historique' })).toHaveAttribute('aria-selected', 'true')
  })

  test('joueur non SuperUser : pas d’onglets, même avec ?tab=validation', async ({ api, page }) => {
    signedIn(api)
    await openPage(page, `${PATH}?tab=validation`)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByTestId('superuser-mention')).toHaveCount(0)
    await expect(page.getByTestId('resource-explorer')).toBeVisible()
  })

  test('lien « Carte des ressources » juste sous « Mortier », actif sur la page', async ({ api, page }, testInfo) => {
    mockResources(api)
    await openPage(page)
    let nav = page.locator('aside').first().locator('nav')
    if (!isDesktopNav(testInfo)) {
      await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
      nav = page.locator('#mobile-clan-nav nav')
    }
    const names = await nav.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('title')))
    expect(names.indexOf('Carte des ressources')).toBe(names.indexOf('Mortier') + 1)
    const link = nav.getByRole('link', { name: 'Carte des ressources' })
    await expect(link).toHaveAttribute('href', '/carte-des-ressources')
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(link.locator('svg')).toHaveCount(1)
  })
})

test('erreur 500 : message, carte sans marqueur, « Réessayer » recharge', async ({ api, page }) => {
  const resources = mockResources(api, { failing: true })
  await page.goto(PATH)
  await page.waitForLoadState('networkidle')
  const alert = page.getByTestId('resource-error')
  await expect(alert).toHaveText(/La carte des ressources n’a pas pu être chargée/)
  await expect(map(page)).toHaveAttribute('data-map', ERANGEL)
  await expect(points(page)).toHaveCount(0)
  await expect(spots(page)).toHaveCount(0)
  await expect(page.getByTestId('resource-empty')).toHaveCount(0)

  resources.failing = false
  await alert.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByTestId('resource-error')).toHaveCount(0)
  await expect(points(page)).toHaveCount(3)
})

test('aucun défilement horizontal : repos, fiche, parcours et remerciement', async ({ api, page }) => {
  signedIn(api, { recheck: true })
  await openPage(page)
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await page.getByRole('button', { name: 'Station-service, grille C-K, à confirmer' }).click()
  await expect(sheet(page)).toBeVisible()
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await sheet(page).getByRole('button', { name: 'Signaler un problème' }).click()
  await flow(page).getByText('Mauvais type').click()
  await flow(page).getByRole('button', { name: 'Continuer' }).click()
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
  await flow(page).getByText('Garage').click()
  await flow(page).getByRole('button', { name: 'Continuer' }).click()
  await flow(page).getByRole('button', { name: 'Envoyer' }).click()
  await expect(flow(page)).toHaveAttribute('data-step', 'done')
  expect(await horizontalOverflow(page)).toEqual({ page: 0, scrollers: [] })
})

test.describe('zoom de la carte', () => {
  const zoomLabel = (page: Page) => map(page).getByRole('button', { name: 'Afficher la carte entière' })

  test('jusqu’à ×8 aux boutons, puis « + » désactivé ; « 1× » revient à la carte entière', async ({ api, page }) => {
    mockResources(api)
    await openPage(page)
    const zoomIn = map(page).getByRole('button', { name: 'Augmenter le zoom' })
    for (let step = 0; step < 14; step += 1) await zoomIn.click()
    await expect(zoomLabel(page)).toContainText('8×')
    await expect(zoomIn).toBeDisabled()
    await zoomLabel(page).click()
    await expect(zoomLabel(page)).toContainText('1×')
  })

  test('pincer à deux doigts zoome autour des doigts, se cale sur un palier, sans poser de point', async ({ api, page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'geste à deux doigts : protocole tactile de Chromium (écran tactile du profil mobile)')
    mockResources(api, { signedIn: true })
    await openPage(page)
    const box = (await viewport(page).boundingBox())!
    const cx = Math.round(box.x + box.width / 2)
    const cy = Math.round(box.y + box.height / 2)
    const cdp = await page.context().newCDPSession(page)
    const fingers = (spread: number) => [
      { x: cx - spread / 2, y: cy, id: 1 },
      { x: cx + spread / 2, y: cy, id: 2 },
    ]
    async function pinch(from: number, to: number) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) })
      const steps = 6
      for (let index = 1; index <= steps; index += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(from + ((to - from) * index) / steps) })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }

    // Écart ×3 : 40 → 120 px.
    await pinch(40, 120)
    await expect(zoomLabel(page)).toContainText('3×')
    // Rapprocher les doigts : retour à la carte entière.
    await pinch(150, 50)
    await expect(zoomLabel(page)).toContainText('1×')
    // Aucun point posé, aucune fiche ouverte par le geste.
    await expect(flow(page)).toHaveCount(0)
    await expect(sheet(page)).toHaveCount(0)
  })
})
