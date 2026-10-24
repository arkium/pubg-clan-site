import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes de la page SuperUser /settings/coach (docs/TODO/chatbot-ia.md §9) : réglages, test de modèle, consommation,
 * questions, « Relu ». Garde, session, Prisma, journal et fournisseur simulés — aucun accès à la base, aucun appel au
 * modèle (CLAUDE.md, piège n° 9 : les tests de route vivent dans src/lib et importent les handlers depuis src/app).
 */

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getSession: vi.fn(),
  appConfigFindMany: vi.fn(),
  appConfigUpsert: vi.fn(),
  transaction: vi.fn(),
  usageFindMany: vi.fn(),
  usageCount: vi.fn(),
  usageCreate: vi.fn(),
  usageUpdate: vi.fn(),
  userFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  messageCount: vi.fn(),
  messageUpdateMany: vi.fn(),
  streamAnswer: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession, getSessionTokenFromRequest: vi.fn() }))
vi.mock('@/lib/admin-action-log', () => ({ withAdminActionLog: (_template: string, handler: unknown) => handler }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findMany: mocks.appConfigFindMany, upsert: mocks.appConfigUpsert },
    coachUsage: { findMany: mocks.usageFindMany, count: mocks.usageCount, create: mocks.usageCreate, update: mocks.usageUpdate },
    coachMessage: { findMany: mocks.messageFindMany, count: mocks.messageCount, updateMany: mocks.messageUpdateMany },
    userAccount: { findMany: mocks.userFindMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/coach/coach-provider-gemini', () => ({ createGeminiProvider: () => ({ streamAnswer: mocks.streamAnswer }) }))

import { POST as reviewedRoute } from '@/app/api/settings/coach/questions/[id]/reviewed/route'
import { GET as questionsRoute } from '@/app/api/settings/coach/questions/route'
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/coach/route'
import { POST as testModelRoute } from '@/app/api/settings/coach/test-model/route'
import { GET as usageRoute } from '@/app/api/settings/coach/usage/route'
import { COACH_SETTING_DEFAULTS, resetCoachSettingsCache } from '@/lib/coach/coach-config'
import { CoachProviderError } from '@/lib/coach/coach-provider'

const previousKey = process.env.GEMINI_API_KEY

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  resetCoachSettingsCache()
  delete process.env.GEMINI_API_KEY
  mocks.requirePlatformAdmin.mockResolvedValue(null)
  mocks.getSession.mockResolvedValue({ sessionId: 's1', userId: 1, email: 'su@example.com', activeMemberId: null, isSuperUser: true })
  mocks.appConfigFindMany.mockResolvedValue([])
  mocks.transaction.mockResolvedValue([])
  mocks.usageCreate.mockResolvedValue({ id: 77 })
  mocks.usageUpdate.mockResolvedValue({})
  mocks.usageFindMany.mockResolvedValue([])
  mocks.usageCount.mockResolvedValue(0)
  mocks.userFindMany.mockResolvedValue([])
  mocks.messageFindMany.mockResolvedValue([])
  mocks.messageCount.mockResolvedValue(0)
})

afterAll(() => {
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = previousKey
})

describe('garde', () => {
  it('toutes les routes répondent ce que la garde Plateforme répond', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'Réservé au SuperUser' }, { status: 403 }))
    expect((await getSettings(json('/api/settings/coach', 'GET'))).status).toBe(403)
    expect((await putSettings(json('/api/settings/coach', 'PUT', { settings: {} }))).status).toBe(403)
    expect((await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gemini-3.5-flash-lite' }))).status).toBe(403)
    expect((await usageRoute(json('/api/settings/coach/usage', 'GET'))).status).toBe(403)
    expect((await questionsRoute(json('/api/settings/coach/questions', 'GET'))).status).toBe(403)
    expect((await reviewedRoute(json('/api/settings/coach/questions/3/reviewed', 'POST'), params('3'))).status).toBe(403)
    expect(mocks.appConfigFindMany).not.toHaveBeenCalled()
  })
})

describe('GET / PUT /api/settings/coach', () => {
  it('renvoie les réglages, la présence de la clé (jamais sa valeur), défauts et bornes', async () => {
    const response = await getSettings(json('/api/settings/coach', 'GET'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings).toEqual(COACH_SETTING_DEFAULTS)
    expect(body.apiKeyPresent).toBe(false)
    expect(body.defaults).toEqual(COACH_SETTING_DEFAULTS)
    expect(body.bounds.hourlyLimit).toEqual({ min: 1, max: 200, decimals: 0 })
    expect(JSON.stringify(body)).not.toContain('GEMINI')
  })

  it('refuse un corps sans réglages, un modèle hors catalogue, un patch sans clé connue', async () => {
    expect((await putSettings(json('/api/settings/coach', 'PUT', {}))).status).toBe(400)

    const unknownModel = await putSettings(json('/api/settings/coach', 'PUT', { settings: { model: 'gpt-9' } }))
    expect(unknownModel.status).toBe(400)
    expect((await unknownModel.json()).errors).toEqual(['model : modèle inconnu du catalogue.'])

    expect((await putSettings(json('/api/settings/coach', 'PUT', { settings: { inconnu: 1 } }))).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('enregistre un patch nettoyé (nombres bornés) et renvoie les réglages relus', async () => {
    mocks.appConfigFindMany.mockResolvedValue([
      { key: 'coach_model', value: 'gemini-3.8-flash' },
      { key: 'coach_hourly_limit', value: '200' },
    ])
    const response = await putSettings(json('/api/settings/coach', 'PUT', { settings: { model: 'gemini-3.8-flash', hourlyLimit: 500, enabled: true } }))
    expect(response.status).toBe(200)
    expect(mocks.appConfigUpsert).toHaveBeenCalledTimes(3)
    expect(mocks.appConfigUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'coach_hourly_limit' }, update: { value: '200' } }))
    expect(mocks.appConfigUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'coach_enabled' }, update: { value: 'true' } }))
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    const body = await response.json()
    expect(body.settings).toMatchObject({ model: 'gemini-3.8-flash', hourlyLimit: 200 })
  })
})

describe('POST /api/settings/coach/test-model', () => {
  const echoTool = async (request: { runTool: (call: { name: string; args: Record<string, unknown> }) => Promise<unknown> }) => {
    const result = (await request.runTool({ name: 'getTestCode', args: {} })) as { code: string }
    return { text: `Le code est ${result.code}.`, toolCalls: [{ name: 'getTestCode', args: {} }], tokensIn: 120, tokensOut: 12, rounds: 2, finishReason: 'STOP' }
  }

  it('refuse un modèle hors catalogue', async () => {
    expect((await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gpt-9' }))).status).toBe(400)
    expect((await testModelRoute(json('/api/settings/coach/test-model', 'POST', {}))).status).toBe(400)
  })

  it('sans clé : résultat en échec, sans réserver de question', async () => {
    const response = await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gemini-3.5-flash-lite' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: false, code: 'no_api_key' })
    expect(mocks.usageCreate).not.toHaveBeenCalled()
  })

  it('réussite : outil appelé, code repris, question facturée au SuperUser', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    mocks.streamAnswer.mockImplementation(echoTool)
    const response = await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gemini-3.5-flash-lite' }))
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, model: 'gemini-3.5-flash-lite', toolCalled: true, codeReturned: true, invented: false, tokensIn: 120, tokensOut: 12 })
    expect(body.costEur).toBeGreaterThan(0)
    expect(mocks.usageCreate).toHaveBeenCalledWith({ data: { userId: 1, clanId: null, conversationId: null, model: 'gemini-3.5-flash-lite', status: 'pending' }, select: { id: true } })
    expect(mocks.usageUpdate).toHaveBeenCalledWith({ where: { id: 77 }, data: expect.objectContaining({ status: 'ok', tokensIn: 120, tokensOut: 12 }) })
    expect(JSON.stringify(body)).not.toContain('test-key')
  })

  it('chiffres sans appel d’outil : signalés comme inventés', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    mocks.streamAnswer.mockResolvedValue({ text: 'Le code est 1234.', toolCalls: [], tokensIn: 50, tokensOut: 8, rounds: 1, finishReason: 'STOP' })
    const body = await (await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gemini-3.1-flash-lite' }))).json()
    expect(body).toMatchObject({ ok: true, toolCalled: false, invented: true })
  })

  it('échec du fournisseur : cause et statut, question notée en erreur', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    mocks.streamAnswer.mockRejectedValue(new CoachProviderError('unauthorized', 'API key not valid', 403))
    const response = await testModelRoute(json('/api/settings/coach/test-model', 'POST', { model: 'gemini-3.8-flash' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unauthorized', message: '403 — API key not valid' })
    expect(mocks.usageUpdate).toHaveBeenCalledWith({ where: { id: 77 }, data: { status: 'error', tokensIn: 0, tokensOut: 0, costMicroUsd: 0 } })
  })
})

describe('GET /api/settings/coach/usage', () => {
  it('construit le rapport du mois à partir des lignes et des comptes', async () => {
    mocks.usageFindMany.mockResolvedValue([
      { userId: 10, model: 'gemini-3.5-flash-lite', status: 'ok', tokensIn: 5000, tokensOut: 300, costMicroUsd: 2_250, createdAt: new Date() },
      { userId: 10, model: 'gemini-3.5-flash-lite', status: 'error', tokensIn: 0, tokensOut: 0, costMicroUsd: 0, createdAt: new Date() },
    ])
    mocks.usageCount.mockResolvedValue(1)
    mocks.userFindMany.mockResolvedValue([{ id: 10, email: 'j@example.com', displayName: null, identities: [{ member: { pubgPlayerName: 'Menez69' } }] }])
    const body = await (await usageRoute(json('/api/settings/coach/usage', 'GET'))).json()
    expect(body.totals).toMatchObject({ questions: 1, accounts: 1, errors: 1, aborted: 0 })
    expect(body.errorsLast24h).toBe(1)
    expect(body.byModel[0]).toMatchObject({ model: 'gemini-3.5-flash-lite', questions: 1 })
    expect(body.accountsNearBudget).toEqual([])
    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [10] } } }))
  })
})

describe('GET /api/settings/coach/questions', () => {
  it('regroupe les questions, compte les votes et joint sa question à chaque réponse « Inexact »', async () => {
    mocks.messageFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.role === 'user' && where.createdAt) return [{ content: 'Quelle est ma meilleure arme ?' }, { content: 'quelle est ma meilleure arme' }]
      if (where.feedbackScore === -1) {
        return [
          {
            id: 42,
            conversationId: 5,
            content: 'Phase 5 · 18:42…',
            toolCalls: [{ name: 'getMatchDebrief', args: {} }],
            feedbackNote: 'La mise à terre est à 18:39.',
            unverified: false,
            createdAt: new Date('2026-10-22T19:58:00.000Z'),
            conversation: { contextLabel: 'Erangel · 22 oct. 21:47 · Top 3', clan: { tag: '47R' } },
          },
        ]
      }
      return [{ id: 41, conversationId: 5, content: 'Pourquoi on s’est fait sortir en zone 5 ?' }]
    })
    mocks.messageCount.mockResolvedValueOnce(7).mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    const body = await (await questionsRoute(json('/api/settings/coach/questions', 'GET'))).json()
    expect(body.days).toBe(30)
    expect(body.frequent).toEqual([{ text: 'Quelle est ma meilleure arme ?', count: 2 }])
    expect(body.votes).toEqual({ helpful: 7, inaccurate: 2, pendingReview: 1 })
    expect(body.inaccurate).toEqual([
      {
        messageId: 42,
        conversationId: 5,
        createdAt: '2026-10-22T19:58:00.000Z',
        clanTag: '47R',
        contextLabel: 'Erangel · 22 oct. 21:47 · Top 3',
        question: 'Pourquoi on s’est fait sortir en zone 5 ?',
        note: 'La mise à terre est à 18:39.',
        answer: 'Phase 5 · 18:42…',
        tools: ['getMatchDebrief'],
        unverified: false,
      },
    ])
    // Jamais le compte : ni identifiant d'utilisateur ni adresse dans la réponse.
    expect(JSON.stringify(body)).not.toMatch(/userId|@/)
  })
})

describe('POST /api/settings/coach/questions/[id]/reviewed', () => {
  it('refuse un identifiant invalide, répond 404 sans vote à relire, 200 sinon', async () => {
    expect((await reviewedRoute(json('/api/settings/coach/questions/abc/reviewed', 'POST'), params('abc'))).status).toBe(400)

    mocks.messageUpdateMany.mockResolvedValue({ count: 0 })
    expect((await reviewedRoute(json('/api/settings/coach/questions/9/reviewed', 'POST'), params('9'))).status).toBe(404)

    mocks.messageUpdateMany.mockResolvedValue({ count: 1 })
    const response = await reviewedRoute(json('/api/settings/coach/questions/9/reviewed', 'POST'), params('9'))
    expect(response.status).toBe(200)
    expect(mocks.messageUpdateMany).toHaveBeenLastCalledWith({ where: { id: 9, feedbackScore: -1, reviewedAt: null }, data: { reviewedAt: expect.any(Date) } })
  })
})
