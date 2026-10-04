import type { Locator, Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { ITEM, RESOURCES_PATH, mockResourcesAdmin, withSessionCookie, type ResourceAdminState } from './support/resources-admin'

/**
 * Vue SuperUser de la Carte des ressources — /carte-des-ressources?tab=validation|history (docs/features/carte-ressources.md
 * §5), selon la charte UI : pastille de l'onglet, lignes de la file (natures, regroupement, mini-cartes, commentaires),
 * Valider / Refuser (annulable par la notification) / Modifier (type et marqueur au clavier), sélection multiple en un
 * seul envoi, erreur sur une ligne, « À revérifier » (modale) et « Marquer vérifiée », file vide ; historique paginé,
 * « Annuler » avec confirmation légère ; aucun défilement horizontal. Toutes les API sont simulées : rien n'atteint la base.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const row = (page: Page, id: string) => page.locator(`[data-item-id="${id}"]`)
const badge = (page: Page) => page.getByTestId('queue-badge')
const toasts = (page: Page) => page.getByTestId('resource-toast')
const mapRow = (page: Page, key: string) => page.locator(`[data-testid="resource-map-row"][data-map="${key}"]`)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'défilement horizontal de la page').toBeLessThanOrEqual(0)
}

/** Couleur calculée d'un élément et valeur d'un jeton, au même format (« 251 146 60 »). */
async function colorAndToken(locator: Locator, token: string) {
  return locator.evaluate((element, name) => {
    const normalize = (value: string) => value.replace(/rgba?\(|\)/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    const style = getComputedStyle(element)
    return { color: normalize(style.color), token: normalize(style.getPropertyValue(name)) }
  }, token)
}

async function openValidation(page: Page) {
  await page.goto(`${RESOURCES_PATH}?tab=validation`)
  // Le shell remonte la page quand la session arrive (WebKit) : attendre qu'il soit stable avant d'agir.
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('queue-row')).toHaveCount(6)
}

/** Ferme les notifications (elles couvrent le bas de l'écran sur mobile). */
async function closeToasts(page: Page) {
  for (const button of await page.getByRole('button', { name: 'Fermer la notification' }).all()) await button.click()
  await expect(toasts(page)).toHaveCount(0)
}

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

test.describe('onglet Validation', () => {
  let state: ResourceAdminState

  test.beforeEach(async ({ api, page }) => {
    state = mockResourcesAdmin(api)
    await openValidation(page)
  })

  test('pastille = éléments en attente ; lignes : natures, regroupement, mini-cartes, auteurs et commentaires', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Validation/ })).toHaveAttribute('aria-selected', 'true')
    await expect(badge(page)).toHaveText('6')
    await expect(page.getByTestId('resource-queue-summary')).toHaveText('6 en attente · signalements identiques regroupés')
    await expect(page.getByRole('button', { name: /Valider la sélection/ })).toBeDisabled()

    // Nouvelle proposition : « Avant » neutre, « Après » à sa position ; auteur avec ses points validés, commentaire.
    const yasnaya = row(page, ITEM.yasnaya)
    await expect(yasnaya.getByTestId('queue-row-title')).toHaveText('Station-service')
    await expect(yasnaya).toContainText('Erangel · E-M')
    await expect(yasnaya.getByTestId('queue-row-nature')).toHaveText('Nouveau point')
    await expect(yasnaya.getByTestId('queue-row-group')).toHaveCount(0)
    await expect(yasnaya.getByTestId('queue-row-authors')).toHaveText('Kr4ken · 12 validés · 3 oct.')
    await expect(yasnaya.getByTestId('queue-row-comment')).toHaveText('« Petite station à l’entrée de Yasnaya »')
    await expect(yasnaya.getByTestId('minimap-before-empty')).toBeVisible()
    await expect(yasnaya.getByTestId('minimap-after')).toBeVisible()

    // « N'existe plus » regroupé : trois joueurs, deux commentaires, « Après » barré.
    const missing = row(page, ITEM.missing)
    await expect(missing.getByTestId('queue-row-nature')).toHaveText('N’existe plus')
    await expect(missing.getByTestId('queue-row-group')).toHaveText('3 joueurs')
    await expect(missing.getByTestId('queue-row-authors')).toHaveText('Nyx, Vexa et Lemon · 2 oct.')
    await expect(missing.getByTestId('queue-row-comment')).toHaveText(['« Plus de garage depuis la mise à jour »', '« Rasé, il reste la dalle »'])
    await expect(missing.getByTestId('minimap-before')).toBeVisible()
    await expect(missing.getByTestId('minimap-after-removed')).toBeVisible()

    // « Mal placé » : deux extraits centrés chacun sur sa position (fond de carte décalé en pourcentages).
    const misplaced = row(page, ITEM.misplaced)
    await expect(misplaced.getByTestId('queue-row-nature')).toHaveText('Mal placé')
    await expect(misplaced.getByTestId('minimap-before')).toHaveAttribute('data-background-position', '12.83% 39.78%')
    await expect(misplaced.getByTestId('minimap-after')).toHaveAttribute('data-background-position', '13.6% 40.3%')
    await expect(misplaced.getByTestId('minimap-before')).toHaveCSS('background-image', /\/maps\/pubg\/Desert_Main\.webp/)
    // En attente = orange de jeu, jamais le jaune de l'accent.
    const warn = await colorAndToken(misplaced.getByTestId('queue-row-nature'), '--game-warn')
    expect(warn.color).toBe(warn.token)
    const accent = await colorAndToken(misplaced.getByTestId('queue-row-nature'), '--theme-ui-accent')
    expect(warn.color).not.toBe(accent.token)

    // « Mauvais type » : type actuel → type demandé.
    const wrongKind = row(page, ITEM.wrongKind)
    await expect(wrongKind.getByTestId('queue-row-title')).toHaveText('Garage → Station-service')
    await expect(wrongKind.getByTestId('queue-row-nature')).toHaveText('Mauvais type')
    await expect(wrongKind.getByTestId('queue-row-authors')).toHaveText('Lemon · aucun validé · 1 oct.')
  })

  test('Valider une ligne : corps envoyé, ligne retirée, pastille et résumé mis à jour', async ({ page }) => {
    await row(page, ITEM.yasnaya).getByRole('button', { name: 'Valider' }).click()
    await expect(row(page, ITEM.yasnaya)).toHaveCount(0)
    expect(state.decisionBodies).toEqual([[{ itemId: ITEM.yasnaya, decision: 'validate' }]])
    await expect(badge(page)).toHaveText('5')
    await expect(page.getByTestId('resource-queue-summary')).toHaveText('5 en attente · signalements identiques regroupés')
    await expect(page.getByTestId('queue-row')).toHaveCount(5)
    await expect(toasts(page)).toContainText('Validé')
    await expect(toasts(page).getByRole('button', { name: 'Annuler' })).toBeVisible()
  })

  test('Refuser puis « Annuler » dans la notification : annulation de l’action renvoyée, la ligne revient', async ({ page }) => {
    await row(page, ITEM.missing).getByRole('button', { name: 'Refuser' }).click()
    await expect(row(page, ITEM.missing)).toHaveCount(0)
    expect(state.decisionBodies).toEqual([[{ itemId: ITEM.missing, decision: 'refuse' }]])
    await expect(badge(page)).toHaveText('5')

    const toast = toasts(page)
    await expect(toast).toContainText('Refusé')
    const undo = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/resources/admin/history/act-1/undo'))
    await toast.getByRole('button', { name: 'Annuler' }).click()
    await undo
    expect(state.undone).toEqual(['act-1'])
    await expect(toast).toContainText('Décision annulée')
    await expect(row(page, ITEM.missing)).toHaveCount(1)
    await expect(badge(page)).toHaveText('6')
  })

  test('Modifier : type en tuile, marqueur posé au pointeur puis déplacé au clavier → décision « edit » avec type et position', async ({ page }) => {
    const misplaced = row(page, ITEM.misplaced)
    const modify = misplaced.getByRole('button', { name: 'Modifier' })
    await modify.click()
    await expect(modify).toHaveAttribute('aria-expanded', 'true')
    const editor = misplaced.getByTestId('queue-editor')
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('radio', { name: 'Ponton' })).toBeChecked()
    // L'ancienne position reste visible tant que le marqueur n'est pas dessus.
    await expect(editor.getByTestId('position-picker-previous')).toBeVisible()

    await editor.locator('label').filter({ has: page.getByRole('radio', { name: 'Garage' }) }).click()
    await expect(editor.getByRole('radio', { name: 'Garage' })).toBeChecked()

    const marker = editor.getByTestId('position-picker-marker')
    await expect(marker).toHaveAttribute('data-x', '1260')
    await expect(marker).toHaveAttribute('data-y', '3340')

    // Pointeur : un clic sur l'extrait (1 km de côté, de 760 à 1 760 m en x) y pose le marqueur.
    const picker = editor.getByTestId('position-picker')
    const box = (await picker.boundingBox())!
    expect(box.width, 'mini-carte de l’éditeur').toBeGreaterThan(200)
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25)
    const clickedX = Number(await marker.getAttribute('data-x'))
    const clickedY = Number(await marker.getAttribute('data-y'))
    expect(Math.abs(clickedX - 1010)).toBeLessThanOrEqual(8)
    expect(Math.abs(clickedY - 3090)).toBeLessThanOrEqual(8)

    // Clavier : flèche = 10 m, Maj + flèche = 50 m.
    await marker.focus()
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(marker).toHaveAttribute('data-x', String(clickedX + 30))
    await expect(marker).toHaveAttribute('data-y', String(clickedY + 50))
    await expect(editor).toContainText(/déplacé de \d+ m/)

    await editor.getByRole('button', { name: 'Enregistrer et valider' }).click()
    await expect(misplaced).toHaveCount(0)
    expect(state.decisionBodies).toEqual([[{ itemId: ITEM.misplaced, decision: 'edit', kind: 'garage', x: clickedX + 30, y: clickedY + 50 }]])
    await expect(toasts(page)).toContainText('Modifié et validé')
    await expect(badge(page)).toHaveText('5')
  })

  test('sélection multiple : « Valider la sélection » envoie toutes les décisions en un seul POST', async ({ page }) => {
    const selectAll = page.getByRole('checkbox', { name: 'Tout sélectionner' })
    await selectAll.check()
    await expect(page.getByRole('checkbox', { name: /^Sélectionner :/ })).toHaveCount(6)
    for (const box of await page.getByRole('checkbox', { name: /^Sélectionner :/ }).all()) await expect(box).toBeChecked()
    await selectAll.uncheck()
    await expect(page.getByRole('button', { name: /Valider la sélection/ })).toBeDisabled()

    for (const id of [ITEM.yasnaya, ITEM.secret, ITEM.sanhok]) await row(page, id).getByRole('checkbox').check()
    // Sélection partielle : « tout sélectionner » à l'état indéterminé.
    expect(await selectAll.evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(true)
    const button = page.getByRole('button', { name: /Valider la sélection/ })
    await expect(button).toHaveText(/\(3\)/)
    await button.click()

    await expect(page.getByTestId('queue-row')).toHaveCount(3)
    expect(state.decisionBodies).toHaveLength(1)
    expect(state.decisionBodies[0]).toEqual([
      { itemId: ITEM.yasnaya, decision: 'validate' },
      { itemId: ITEM.secret, decision: 'validate' },
      { itemId: ITEM.sanhok, decision: 'validate' },
    ])
    await expect(badge(page)).toHaveText('3')
    await expect(toasts(page)).toContainText('3 validés')
    await expect(button).toBeDisabled()
  })

  test('erreur sur une ligne : affichée sur la ligne, qui reste dans la file ; les autres passent', async ({ page }) => {
    state.failing.add(ITEM.wrongKind)
    await row(page, ITEM.wrongKind).getByRole('checkbox').check()
    await row(page, ITEM.secret).getByRole('checkbox').check()
    await page.getByRole('button', { name: /Valider la sélection/ }).click()

    await expect(row(page, ITEM.secret)).toHaveCount(0)
    const failed = row(page, ITEM.wrongKind)
    await expect(failed.getByTestId('queue-row-error')).toHaveText('Ce point a changé depuis le signalement — recharge la file.')
    await expect(failed.getByRole('checkbox')).toBeChecked()
    await expect(badge(page)).toHaveText('5')
    await expect(toasts(page)).toContainText('Validé')

    // Nouvel essai réussi : l'erreur disparaît avec la ligne.
    state.failing.clear()
    await closeToasts(page)
    await failed.getByRole('button', { name: 'Valider' }).click()
    await expect(failed).toHaveCount(0)
    await expect(badge(page)).toHaveText('4')
  })

  test('par carte : « À revérifier » confirmé en modale, « Marquer vérifiée », carte sans point désactivée', async ({ page }) => {
    const panel = page.getByTestId('resource-maps-panel')
    await expect(panel).toContainText('Après une mise à jour PUBG, marque la carte')
    await expect(mapRow(page, 'Baltic_Main')).toContainText('9 points saisis · vérifiée le 28/09')
    await expect(mapRow(page, 'Desert_Main').getByTestId('resource-map-recheck')).toHaveText('À revérifier depuis le 1/10')
    await expect(mapRow(page, 'Tiger_Main')).toContainText('Aucun point saisi')
    await expect(mapRow(page, 'Tiger_Main').getByRole('button', { name: 'À revérifier après mise à jour PUBG' })).toBeDisabled()

    // Échap ferme la modale sans rien envoyer.
    await mapRow(page, 'DihorOtok_Main').getByRole('button', { name: 'À revérifier après mise à jour PUBG' }).click()
    await expect(page.getByTestId('resource-recheck-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('resource-recheck-dialog')).toHaveCount(0)

    await mapRow(page, 'Baltic_Main').getByRole('button', { name: 'À revérifier après mise à jour PUBG' }).click()
    const dialog = page.getByTestId('resource-recheck-dialog')
    await expect(dialog.getByRole('heading', { name: 'Marquer Erangel à revérifier ?' })).toBeVisible()
    await expect(dialog).toContainText('Ses 9 points saisis passeront « à confirmer »')
    await dialog.getByRole('button', { name: 'Marquer à revérifier' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(mapRow(page, 'Baltic_Main').getByTestId('resource-map-recheck')).toHaveText('À revérifier depuis le 4/10')

    await mapRow(page, 'Desert_Main').getByRole('button', { name: 'Marquer vérifiée' }).click()
    await expect(mapRow(page, 'Desert_Main').getByTestId('resource-map-recheck')).toHaveCount(0)
    await expect(mapRow(page, 'Desert_Main')).toContainText('vérifiée le 4/10')
    expect(state.mapActions).toEqual([
      { map: 'Baltic_Main', action: 'recheck' },
      { map: 'Desert_Main', action: 'verify' },
    ])
  })

  test('aucun défilement horizontal (éditeur ouvert compris)', async ({ page }, testInfo) => {
    await expectNoHorizontalScroll(page)
    await row(page, ITEM.misplaced).getByRole('button', { name: 'Modifier' }).click()
    await expect(page.getByTestId('queue-editor')).toBeVisible()
    await expectNoHorizontalScroll(page)
    if (isMobile(testInfo)) {
      // Sur mobile, la file et « Par carte » sont empilées.
      const queueBox = await page.getByTestId('resource-queue').boundingBox()
      const panelBox = await page.getByTestId('resource-maps-panel').boundingBox()
      expect(panelBox!.y).toBeGreaterThan(queueBox!.y + queueBox!.height - 1)
    }
  })
})

test('file vide : état vide de la charte, ni pastille ni sélection', async ({ api, page }) => {
  mockResourcesAdmin(api, { empty: true })
  await page.goto(`${RESOURCES_PATH}?tab=validation`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('resource-queue-empty')).toContainText('Rien à valider')
  await expect(page.getByTestId('resource-queue-empty')).toContainText('Les propositions et signalements des joueurs apparaîtront ici.')
  await expect(page.getByTestId('resource-queue-summary')).toHaveText('Aucun élément en attente')
  await expect(badge(page)).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Tout sélectionner' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Valider la sélection/ })).toBeDisabled()
  await expectNoHorizontalScroll(page)
})

test.describe('onglet Historique', () => {
  let state: ResourceAdminState

  test.beforeEach(async ({ api, page }) => {
    state = mockResourcesAdmin(api)
    await page.goto(`${RESOURCES_PATH}?tab=history`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('history-row')).toHaveCount(7)
  })

  test('décisions des 30 derniers jours : qui, quoi, détail, carte ; entrée annulée et entrée non annulable', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Historique/ })).toHaveAttribute('aria-selected', 'true')
    const history = page.getByTestId('resource-history')
    await expect(history.getByRole('heading', { name: 'Historique' })).toBeVisible()
    await expect(history).toContainText('Toutes les cartes · 30 derniers jours')
    await expect(page.getByTestId('history-page')).toHaveText('1 / 3')

    const first = page.locator('[data-entry-id="h-1"]')
    await expect(first).toContainText('a validé Station-service · F-L')
    await expect(first).toContainText('Proposée par Vexa')
    await expect(first).toContainText('Kr4ken')
    await expect(first.getByText('3 oct. · 21:42').filter({ visible: true })).toHaveCount(1)
    await expect(first.getByText('Erangel').filter({ visible: true })).toHaveCount(1)
    await expect(first.getByRole('button', { name: /^Annuler/ })).toBeVisible()

    await expect(page.locator('[data-entry-id="h-3"]').getByTestId('history-row-undone')).toHaveText('Annulée')
    await expect(page.locator('[data-entry-id="h-3"]').getByRole('button')).toHaveCount(0)
    await expect(page.locator('[data-entry-id="h-4"]').getByRole('button')).toHaveCount(0)
    // Page 1 seulement (le mode strict de React et le remontage du shell peuvent la lire plusieurs fois).
    expect([...new Set(state.historyPages)]).toEqual([1])
  })

  test('pagination : la page 2 est demandée, puis le retour à la page 1', async ({ api, page }) => {
    expect([...new Set(api.paramValues('/api/resources/admin/history', 'page'))]).toEqual(['1'])
    await page.getByRole('button', { name: 'Page suivante' }).click()
    await expect(page.getByTestId('history-page')).toHaveText('2 / 3')
    await expect(page.locator('[data-entry-id="h-8"]')).toBeVisible()
    await expect(page.locator('[data-entry-id="h-1"]')).toHaveCount(0)
    expect(api.paramValues('/api/resources/admin/history', 'page').at(-1)).toBe('2')
    await page.getByRole('button', { name: 'Page précédente' }).click()
    await expect(page.getByTestId('history-page')).toHaveText('1 / 3')
    await expect(page.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
  })

  test('« Annuler » : confirmation légère, POST d’annulation, l’entrée devient « Annulée »', async ({ page }) => {
    // « Garder la décision » referme la confirmation sans rien envoyer.
    const second = page.locator('[data-entry-id="h-2"]')
    await second.getByRole('button', { name: /^Annuler/ }).click()
    await second.getByRole('button', { name: 'Garder la décision' }).click()
    await expect(second.getByRole('button', { name: /^Annuler/ })).toBeVisible()

    const first = page.locator('[data-entry-id="h-1"]')
    await first.getByRole('button', { name: /^Annuler/ }).click()
    const undo = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/resources/admin/history/h-1/undo'))
    await first.getByRole('button', { name: /^Confirmer l’annulation/ }).click()
    await undo
    await expect(first.getByTestId('history-row-undone')).toHaveText('Annulée')
    await expect(first).toHaveAttribute('data-undone', 'true')
    expect(state.undone).toEqual(['h-1'])
  })

  test('aucun défilement horizontal, colonnes secondaires repliées sur mobile', async ({ page }, testInfo) => {
    await expectNoHorizontalScroll(page)
    const whenHeader = page.getByRole('columnheader', { name: 'Quand' })
    if (isMobile(testInfo)) await expect(whenHeader).toBeHidden()
    else await expect(whenHeader).toBeVisible()
  })
})
