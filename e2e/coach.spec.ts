import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './support/api'
import { COACH_ANSWER_MESSAGE_ID, COACH_CONTEXT_LABEL, COACH_MEMORIES, COACH_QUESTION, coachQuota, mockCoachAdmin, mockCoachMember } from './support/coach'
import { CLAN_ID, DEBRIEF_MATCH_ID } from './support/data'
import { mockClanOverview, mockMatchDebrief } from './support/pages'
import { withSessionCookie } from './support/session'

/**
 * Coach IA (docs/features/coach-ia.md) : teaser du visiteur sans aucun appel, question en flux et vote d'un membre,
 * fils conservés, contexte du débriefing, états (pause, limite de l'heure), page plein écran, page SuperUser,
 * captures clair et sombre. Toutes les API sont simulées, le flux SSE compris ; aucun crédit consommé.
 */

const isMobile = (testInfo: TestInfo) => ['chromium-mobile', 'webkit-iphone'].includes(testInfo.project.name)
const DEBRIEF_PATH = `/clans/${CLAN_ID}/telemetry/matches/${DEBRIEF_MATCH_ID}/debrief`

const drawerOf = (page: Page) => page.getByTestId('coach-drawer')

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'défilement horizontal').toBe(0)
}

/** Déclencheur de la largeur courante : bouton de l'en-tête dès 640 px, bouton flottant en dessous (§8.1). */
const triggerOf = (page: Page, testInfo: TestInfo) => page.getByTestId(isMobile(testInfo) ? 'coach-fab' : 'coach-trigger')

/** Ouvre le tiroir par le déclencheur de la largeur courante. */
async function openDrawer(page: Page, testInfo: TestInfo) {
  await triggerOf(page, testInfo).click()
  await expect(drawerOf(page)).toBeVisible()
  return drawerOf(page)
}

test.describe('déclencheurs', () => {
  test('sous 640 px, bouton flottant en bas à droite, caché quand le panneau est ouvert ; bouton d’en-tête au-delà', async ({ api, page, baseURL }, testInfo) => {
    await withSessionCookie(page, baseURL!)
    mockCoachMember(api)
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    const fab = page.getByTestId('coach-fab')
    const trigger = page.getByTestId('coach-trigger')
    if (!isMobile(testInfo)) {
      await expect(trigger).toBeVisible()
      await expect(fab).toBeHidden()
      return
    }
    await expect(trigger).toBeHidden()
    await expect(fab).toBeVisible()
    await expect(fab).toHaveAccessibleName('Coach IA')
    // Bas droite, cible d'au moins 44 px, et fixé : il ne bouge pas quand la page défile.
    const box = (await fab.boundingBox())!
    const viewport = page.viewportSize()!
    expect(viewport.width - (box.x + box.width), 'marge droite').toBeGreaterThanOrEqual(12)
    expect(viewport.width - (box.x + box.width), 'marge droite').toBeLessThanOrEqual(24)
    expect(viewport.height - (box.y + box.height), 'marge basse').toBeGreaterThanOrEqual(12)
    expect(viewport.height - (box.y + box.height), 'marge basse').toBeLessThanOrEqual(40)
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    await page.evaluate(() => window.scrollTo(0, 600))
    expect((await fab.boundingBox())!.y).toBeCloseTo(box.y, 0)

    await fab.click()
    const drawer = drawerOf(page)
    await expect(drawer).toBeVisible()
    await expect(fab).toBeHidden()
    await expect(drawer).toContainText('Salut Joueur Alpha !')
    await drawer.getByTestId('coach-close').click()
    await expect(drawer).toBeHidden()
    await expect(fab).toBeVisible()
    await noHorizontalScroll(page)
  })
})

test.describe('visiteur', () => {
  test('teaser : réponses floutées, inscription et connexion, aucun appel au Coach', async ({ api, page }, testInfo) => {
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    const drawer = await openDrawer(page, testInfo)
    await expect(drawer.getByTestId('coach-teaser')).toBeVisible()
    await expect(drawer).toContainText('Réservé aux membres')
    await expect(drawer.getByRole('link', { name: 'Inscrire mon clan avec mon pseudo PUBG' })).toHaveAttribute('href', '/join')
    await expect(drawer.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login')
    await expect(drawer.getByRole('textbox', { name: 'Ta question au Coach IA' })).toBeDisabled()
    expect(api.served.filter((call) => call.url.pathname.includes('/coach'))).toEqual([])
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(triggerOf(page, testInfo)).toBeVisible()
    // WebKit ne donne pas le focus à un bouton cliqué (comportement Safari) : le retour du focus se vérifie sur Chromium,
    // ordinateur, tablette et mobile (où le bouton flottant, masqué à l'ouverture, est relevé avant le rendu — `opener`).
    if (testInfo.project.name !== 'webkit-iphone') await expect(triggerOf(page, testInfo)).toBeFocused()
  })
})

test.describe('membre', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await withSessionCookie(page, baseURL!)
  })

  test('question en flux, quota ajusté, vote « Utile », fil conservé à la fermeture', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'parcours du tiroir d’ordinateur')
    const calls = mockCoachMember(api)
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    const drawer = await openDrawer(page, testInfo)
    await expect(drawer).toContainText('Salut Joueur Alpha !')
    await expect(drawer).toContainText('[DEMO]')
    await expect(drawer.getByTestId('coach-quota')).toContainText('14 / 20')
    await expect(drawer.getByTestId('coach-context')).toContainText('Sans contexte')
    // Mémoire personnelle fermée (défaut) : pas de bouton « Ce que le Coach sait de toi ».
    await expect(drawer.getByTestId('coach-memory-toggle')).toHaveCount(0)

    await drawer.getByTestId('coach-input').fill(COACH_QUESTION)
    await drawer.getByTestId('coach-input').press('Enter')
    const thread = drawer.getByTestId('coach-thread')
    await expect(thread).toContainText('Isolement')
    await expect(thread).toContainText('145 m')
    await expect(thread).toContainText('Recommandation')
    expect(calls.chats).toEqual([{ conversationId: null, contextPath: `/clans/${CLAN_ID}/overview`, message: COACH_QUESTION }])
    await expect(drawer.getByTestId('coach-quota')).toContainText('13 / 20')
    await expect(drawer.getByTestId('coach-input')).toHaveValue('')

    await drawer.getByRole('button', { name: 'Utile' }).click()
    await expect(drawer.getByRole('button', { name: 'Utile' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls.feedback).toEqual([expect.objectContaining({ score: 1 })])

    // Fermer puis rouvrir : le fil reste, sans nouvel appel au modèle.
    await drawer.getByTestId('coach-close').click()
    await expect(drawer).toBeHidden()
    await page.getByTestId('coach-trigger').click()
    await expect(thread).toContainText('Isolement')
    expect(calls.chats).toHaveLength(1)

    // Liste des fils : le fil du jour, ouvert depuis la liste avec sa réponse enregistrée.
    await drawer.getByTestId('coach-threads-toggle').click()
    const threads = drawer.getByTestId('coach-threads')
    await expect(threads).toContainText('Aujourd’hui')
    await expect(threads).toContainText(COACH_CONTEXT_LABEL)
    await threads.getByRole('button', { name: new RegExp(COACH_QUESTION.replace('?', '\\?')) }).click()
    await expect(thread).toContainText('420')
    await expect(drawer.getByRole('button', { name: 'Utile' })).toHaveAttribute('aria-pressed', 'true')
    await noHorizontalScroll(page)
  })

  test('débriefing : le bouton ouvre le tiroir avec le contexte du match, une suggestion part avec lui', async ({ api, page }, testInfo) => {
    const calls = mockCoachMember(api, { contextLabel: COACH_CONTEXT_LABEL })
    mockMatchDebrief(api)
    await page.goto(DEBRIEF_PATH)
    await page.getByTestId('coach-context-button').click()
    const drawer = drawerOf(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.getByTestId('coach-context')).toContainText('Ce match')
    await drawer.getByRole('button', { name: 'Pourquoi on s’est fait sortir ?' }).click()
    await expect(drawer.getByTestId('coach-context')).toContainText(COACH_CONTEXT_LABEL)
    await expect(drawer.getByTestId('coach-thread')).toContainText('Isolement')
    expect(calls.chats[0]).toMatchObject({ contextPath: DEBRIEF_PATH, message: 'Pourquoi on s’est fait sortir ?' })
    await noHorizontalScroll(page)
    if (isMobile(testInfo)) {
      // Panneau montant : jamais plus haut que la fenêtre, et la saisie reste visible.
      const box = await drawer.boundingBox()
      const viewport = page.viewportSize()!
      expect(box!.height).toBeLessThanOrEqual(viewport.height)
      await expect(drawer.getByTestId('coach-input')).toBeInViewport()
    }
  })

  test('Coach en pause, puis limite de l’heure : saisie fermée, message et heure de retour', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'parcours du tiroir d’ordinateur')
    mockCoachMember(api, { quota: { allowed: false, reason: 'coach_paused' } })
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    const drawer = await openDrawer(page, testInfo)
    await expect(drawer.getByTestId('coach-refusal')).toContainText('Le Coach IA est en pause.')
    await expect(drawer).toContainText('En pause')
    await expect(drawer.getByTestId('coach-input')).toBeDisabled()
    await expect(drawer.getByTestId('coach-send')).toBeDisabled()

    api.on('GET', '/api/coach/quota', { body: coachQuota({ allowed: false, reason: 'hourly_limit', retryAt: '2026-10-24T20:14:00.000Z', remainingHour: 0 }) })
    await page.reload()
    await openDrawer(page, testInfo)
    await expect(drawer.getByTestId('coach-refusal')).toContainText('Prochaine question à 22:14')
    await expect(drawer.getByTestId('coach-quota')).toContainText('0 / 20')
  })

  test('mémoire personnelle ouverte : « Ce que le Coach sait de toi », oublier une ligne, tout oublier', async ({ api, page }, testInfo) => {
    const calls = mockCoachMember(api, { memory: COACH_MEMORIES })
    mockClanOverview(api)
    await page.goto(`/clans/${CLAN_ID}/overview`)
    const drawer = await openDrawer(page, testInfo)
    await drawer.getByTestId('coach-memory-toggle').click()
    const list = drawer.getByTestId('coach-memory')
    await expect(list).toContainText('Objectif')
    await expect(list).toContainText('« 30 % de headshots au Kar98k »')
    await expect(list).toContainText('mesuré à 22 (Kar98k)')
    await expect(list).toContainText('Préférence')
    await expect(list.locator('.coach-memory-row')).toHaveCount(2)
    await expect(list).toContainText('2 / 8')

    await list.getByRole('button', { name: 'Oublier : 30 % de headshots au Kar98k' }).click()
    await expect(list.locator('.coach-memory-row')).toHaveCount(1)
    expect(calls.forgotten).toEqual([1])

    await list.getByTestId('coach-memory-forget-all').click()
    await expect(list).toContainText('Le Coach ne retient rien pour l’instant.')
    expect(calls.forgotAll).toBe(1)

    // Retour au fil par le même bouton.
    await drawer.getByTestId('coach-memory-toggle').click()
    await expect(drawer.getByTestId('coach-thread')).toBeVisible()
    await noHorizontalScroll(page)
  })

  test('page plein écran : liste des fils à gauche, fil au centre, pas de bouton d’en-tête', async ({ api, page }) => {
    mockCoachMember(api)
    await page.goto(`/clans/${CLAN_ID}/coach`)
    await expect(page.getByTestId('coach-threads')).toContainText(COACH_QUESTION)
    await expect(page.getByTestId('coach-thread')).toContainText('Salut Joueur Alpha !')
    await expect(page.getByTestId('coach-trigger')).toHaveCount(0)
    await expect(page.getByTestId('coach-fab')).toHaveCount(0)
    await expect(page.getByTestId('coach-context')).toHaveCount(0)
    await noHorizontalScroll(page)
  })
})

test.describe('SuperUser', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await withSessionCookie(page, baseURL!)
  })

  test('réglages : interrupteur enregistré seul, modèle testé, brouillon enregistré', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'page d’administration, ordinateur')
    const admin = mockCoachAdmin(api)
    await page.goto('/settings/coach')
    await expect(page.getByTestId('coach-settings')).toBeVisible()
    await expect(page.getByTestId('coach-models').getByRole('radio')).toHaveCount(4)
    await expect(page.getByTestId('coach-model-gemini-3.5-flash-lite')).toHaveAttribute('aria-checked', 'true')

    await page.getByTestId('coach-model-gemini-3.5-flash-lite').getByRole('button', { name: 'Tester' }).click()
    await expect(page.getByTestId('coach-model-test-gemini-3.5-flash-lite')).toContainText('Test réussi · 2,2 s · appel d’outil OK')

    await page.getByTestId('coach-enabled').click()
    await expect.poll(() => admin.saves).toEqual([{ enabled: false }])
    await expect(page.getByTestId('coach-settings')).toContainText('Fermé (pause)')

    await page.getByTestId('coach-model-gemini-3.8-flash').click()
    await page.getByTestId('coach-field-hourlyLimit').fill('30')
    await expect(page.getByTestId('coach-save')).toBeEnabled()
    await page.getByTestId('coach-save').click()
    await expect(page.getByTestId('coach-settings')).toContainText('Réglages enregistrés (2 changements).')
    expect(admin.saves[1]).toEqual({ model: 'gemini-3.8-flash', hourlyLimit: '30' })

    // Règles apprises et mémoire personnelle (lots 10 et 11) : chaque interrupteur s'enregistre seul.
    await expect(page.getByTestId('coach-settings')).toContainText('Règles apprises gardées, hors du prompt')
    await page.getByTestId('coach-rules-enabled').click()
    await expect.poll(() => admin.saves.at(-1)).toEqual({ rulesEnabled: true })
    await expect(page.getByTestId('coach-settings')).toContainText('Règles apprises injectées dans le prompt')
    await page.getByTestId('coach-memory-enabled').click()
    await expect.poll(() => admin.saves.at(-1)).toEqual({ memoryEnabled: true })
    await expect(page.getByTestId('coach-settings')).toContainText('Mémoire personnelle ouverte aux membres')
    await noHorizontalScroll(page)
  })

  test('consommation et questions : jauge, comptes proches du budget, questions paginées, règles apprises, vote relu', async ({ api, page }, testInfo) => {
    test.skip(isMobile(testInfo), 'page d’administration, ordinateur')
    const admin = mockCoachAdmin(api)
    await page.goto('/settings/coach/usage')
    await expect(page.getByTestId('coach-usage-cost')).toContainText('7,40')
    await expect(page.getByTestId('coach-global-percent')).toContainText('15 % utilisé')
    await expect(page.getByTestId('coach-accounts-near-budget')).toContainText('Joueur Bravo')
    await noHorizontalScroll(page)

    await page.goto('/settings/coach/questions')
    await expect(page.getByTestId('coach-pending-review')).toContainText('1')
    const frequent = page.getByTestId('coach-frequent')
    await expect(frequent).toContainText('Question fréquente n° 1 ?')
    await expect(frequent).toContainText('2 formulations')
    await expect(frequent).not.toContainText('Question fréquente n° 11 ?')
    await page.getByRole('navigation', { name: 'Pages des questions fréquentes' }).getByRole('button', { name: '2' }).click()
    await expect(frequent).toContainText('Question fréquente n° 11 ?')

    // Précision du joueur réécrite par le SuperUser (2026-10-25) : en place, journalisée côté serveur.
    await expect(page.getByTestId('coach-note-42')).toContainText('La mise à terre est à 18:39, pas à 18:42.')
    await page.getByTestId('coach-note-edit-42').click()
    await page.getByTestId('coach-note-input-42').fill('Heure de la mise à terre fausse : 18:39 dans le replay, 18:42 dans la réponse.')
    await page.getByTestId('coach-note-save-42').click()
    await expect(page.getByTestId('coach-note-42')).toContainText('Heure de la mise à terre fausse')
    expect(admin.noteWrites).toEqual(['Heure de la mise à terre fausse : 18:39 dans le replay, 18:42 dans la réponse.'])

    // Règles apprises (lot 10) : « En faire une règle » rattache le vote, le texte reste à écrire ; ajout, interrupteur, suppression.
    const count = page.getByTestId('coach-rules-count')
    await expect(count).toContainText('1 / 20 actives')
    await expect(count).toContainText('hors du prompt')
    await page.getByTestId('coach-rule-from-42').click()
    await expect(page.getByTestId('coach-rules-from')).toContainText('vote n° 42')
    await expect(page.getByTestId('coach-rules-input')).toBeFocused()
    await expect(page.getByTestId('coach-rules-input')).toHaveValue('')
    const ruleText = 'La mise à terre précède l’élimination : ne confonds pas leurs deux heures.'
    await page.getByTestId('coach-rules-input').fill(ruleText)
    await page.getByTestId('coach-rules-add').click()
    await expect(page.getByTestId('coach-rule-2')).toContainText(ruleText)
    await expect(page.getByTestId('coach-rule-2')).toContainText('vote n° 42')
    expect(admin.ruleWrites[0]).toEqual({ method: 'POST', body: { text: ruleText, fromMessageId: 42 } })
    await expect(count).toContainText('2 / 20 actives')
    await page.getByTestId('coach-rule-enabled-1').click()
    await expect.poll(() => admin.ruleWrites.at(-1)).toEqual({ method: 'PATCH', id: 1, body: { enabled: false } })
    await expect(count).toContainText('1 / 20 actives')
    await page.getByRole('button', { name: 'Supprimer : Un Top 10 n’est pas une victoire.' }).click()
    await page.getByTestId('coach-rule-delete-1').click()
    await expect(page.getByTestId('coach-rule-1')).toHaveCount(0)
    expect(admin.ruleWrites.at(-1)).toEqual({ method: 'DELETE', id: 1 })

    await page.getByTestId(`coach-review-${42}`).getByRole('button', { name: 'Relu' }).click()
    await expect(page.getByTestId('coach-inaccurate')).toHaveCount(0)
    await expect(page.getByTestId('coach-pending-review')).toContainText('0')
    await noHorizontalScroll(page)
  })
})

// Captures de référence (docs/ops/tests-e2e.md) : tiroir après une réponse, panneau mobile depuis le débriefing.
for (const theme of ['light', 'dark'] as const) {
  test(`captures ${theme === 'light' ? 'claires' : 'sombres'} du Coach`, async ({ api, page, baseURL }, testInfo) => {
    await page.addInitScript((value) => window.localStorage.setItem('pubg_app_theme', value), theme)
    await page.context().addCookies([{ name: 'pubg_app_theme', value: theme, url: baseURL! }])
    await withSessionCookie(page, baseURL!)
    mockCoachMember(api, { contextLabel: COACH_CONTEXT_LABEL })
    mockMatchDebrief(api)
    await page.goto(DEBRIEF_PATH)
    await page.getByTestId('coach-context-button').click()
    const drawer = drawerOf(page)
    await drawer.getByRole('button', { name: 'Pourquoi on s’est fait sortir ?' }).click()
    await expect(drawer.getByTestId('coach-thread')).toContainText('Recommandation')
    await expect(drawer.getByRole('button', { name: 'Utile' })).toBeEnabled()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot(`coach-${isMobile(testInfo) ? 'panneau' : 'tiroir'}-${theme}.png`)
    void COACH_ANSWER_MESSAGE_ID
  })
}
