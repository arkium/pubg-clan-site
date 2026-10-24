import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes du Coach IA (docs/TODO/chatbot-ia.md §7) : question en flux, fils, vote. Prisma, la session, le contexte
 * de page, les outils et le fournisseur sont simulés — aucun accès à la base, aucun appel au modèle (CLAUDE.md,
 * piège n° 9 : les tests de route vivent dans src/lib et importent les handlers depuis src/app).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getToken: vi.fn(),
  clanFindUnique: vi.fn(),
  memberFindUnique: vi.fn(),
  memberFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindMany: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn(),
  conversationDeleteMany: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  messageUpdateMany: vi.fn(),
  usageCount: vi.fn(),
  usageFindFirst: vi.fn(),
  usageAggregate: vi.fn(),
  usageCreate: vi.fn(),
  usageUpdate: vi.fn(),
  appConfigFindMany: vi.fn(),
  transaction: vi.fn(),
  resolveContext: vi.fn(),
  streamAnswer: vi.fn(),
  runTool: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSession, getSessionTokenFromRequest: mocks.getToken }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique },
    clanMember: { findUnique: mocks.memberFindUnique, findFirst: mocks.memberFindFirst },
    coachConversation: {
      findFirst: mocks.conversationFindFirst,
      findMany: mocks.conversationFindMany,
      create: mocks.conversationCreate,
      update: mocks.conversationUpdate,
      updateMany: mocks.conversationUpdateMany,
      deleteMany: mocks.conversationDeleteMany,
    },
    coachMessage: { create: mocks.messageCreate, findMany: mocks.messageFindMany, updateMany: mocks.messageUpdateMany },
    coachUsage: { count: mocks.usageCount, findFirst: mocks.usageFindFirst, aggregate: mocks.usageAggregate, create: mocks.usageCreate, update: mocks.usageUpdate },
    appConfig: { findMany: mocks.appConfigFindMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/coach/coach-context-service', () => ({ resolveCoachContext: mocks.resolveContext }))
vi.mock('@/lib/coach/coach-tools', () => ({
  createCoachTools: () => ({ declarations: [{ name: 'getMatchDebrief', description: 'x', parameters: { type: 'object', properties: {} } }], run: mocks.runTool }),
}))
vi.mock('@/lib/coach/coach-provider-gemini', () => ({ createGeminiProvider: () => ({ streamAnswer: mocks.streamAnswer }) }))

import { POST as chatRoute } from '@/app/api/clans/[clanId]/coach/chat/route'
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from '@/app/api/coach/conversations/[id]/route'
import { GET as listRoute } from '@/app/api/coach/conversations/route'
import { POST as feedbackRoute } from '@/app/api/coach/messages/[id]/feedback/route'
import { resetCoachSettingsCache } from '@/lib/coach/coach-config'

const previousKey = process.env.GEMINI_API_KEY

const session = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  userId: 10,
  email: 'joueur@example.com',
  activeMemberId: 100,
  isSuperUser: false,
  ...overrides,
})

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

const chat = (body: unknown, clanId = '292') => chatRoute(json(`/api/clans/${clanId}/coach/chat`, 'POST', body), { params: Promise.resolve({ clanId }) })

async function readSse(response: Response) {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n')
      return { event: eventLine.replace('event: ', ''), data: JSON.parse(dataLine.replace('data: ', '')) }
    })
}

beforeEach(() => {
  resetCoachSettingsCache()
  for (const mock of Object.values(mocks)) mock.mockReset()
  process.env.GEMINI_API_KEY = 'cle-fictive'
  mocks.getToken.mockReturnValue('jeton')
  mocks.appConfigFindMany.mockResolvedValue([{ key: 'coach_enabled', value: 'true' }])
  mocks.memberFindUnique.mockResolvedValue({ clanId: 292, isActive: true })
  mocks.memberFindFirst.mockResolvedValue({ id: 100, displayName: 'NovakTV' })
  mocks.clanFindUnique.mockResolvedValue({ tag: '47R', name: 'Les 47 Ronin' })
  mocks.usageCount.mockResolvedValue(3)
  mocks.usageFindFirst.mockResolvedValue(null)
  mocks.usageAggregate.mockResolvedValue({ _sum: { costMicroUsd: 0 } })
  mocks.usageCreate.mockResolvedValue({ id: 500 })
  mocks.usageUpdate.mockResolvedValue({})
  mocks.resolveContext.mockResolvedValue({ kind: 'none' })
  mocks.conversationCreate.mockResolvedValue({ id: 42 })
  mocks.conversationUpdate.mockResolvedValue({})
  mocks.messageFindMany.mockResolvedValue([])
  let nextMessageId = 1000
  mocks.messageCreate.mockImplementation(async () => ({ id: nextMessageId++ }))
  mocks.transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
})

afterAll(() => {
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = previousKey
})

describe('POST /api/clans/[clanId]/coach/chat — accès et refus avant tout flux', () => {
  it('répond 401 sans session, 403 à un membre d’un autre clan, 400 à une adresse invalide', async () => {
    mocks.getSession.mockResolvedValue(null)
    expect((await chat({ message: 'Salut' })).status).toBe(401)

    mocks.getSession.mockResolvedValue(session())
    mocks.memberFindUnique.mockResolvedValue({ clanId: 999, isActive: true })
    expect((await chat({ message: 'Salut' })).status).toBe(403)

    expect((await chat({ message: 'Salut' }, 'abc')).status).toBe(400)
    expect(mocks.usageCreate).not.toHaveBeenCalled()
  })

  it('refuse un corps invalide avant de toucher au quota', async () => {
    mocks.getSession.mockResolvedValue(session())
    const empty = await chat({ message: '   ' })
    expect(empty.status).toBe(400)
    expect(await empty.json()).toMatchObject({ error: 'invalid_body' })
    expect((await chat({ message: 'x'.repeat(401) })).status).toBe(400)
    expect((await chat({ message: 'ok', conversationId: 'quarante-deux' })).status).toBe(400)
    expect(mocks.usageCount).not.toHaveBeenCalled()
  })

  it('répond 503 au membre quand le Coach est fermé et 429 au-delà de la limite horaire', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.appConfigFindMany.mockResolvedValue([])
    const paused = await chat({ message: 'Pourquoi on a perdu ?' })
    expect(paused.status).toBe(503)
    expect(await paused.json()).toEqual({ error: 'coach_paused' })

    resetCoachSettingsCache()
    mocks.appConfigFindMany.mockResolvedValue([{ key: 'coach_enabled', value: 'true' }])
    mocks.usageCount.mockResolvedValue(20)
    mocks.usageFindFirst.mockResolvedValueOnce({ createdAt: new Date(Date.now() - 50 * 60_000) }).mockResolvedValueOnce({ createdAt: new Date(Date.now() - 60_000) })
    const limited = await chat({ message: 'Pourquoi on a perdu ?' })
    expect(limited.status).toBe(429)
    expect(await limited.json()).toMatchObject({ error: 'hourly_limit', retryAt: expect.any(String) })
    expect(mocks.conversationCreate).not.toHaveBeenCalled()
    expect(mocks.usageCreate).not.toHaveBeenCalled()
  })

  it('répond 404 pour un fil qui n’est pas au compte', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.conversationFindFirst.mockResolvedValue(null)
    const response = await chat({ message: 'Et ensuite ?', conversationId: 77 })
    expect(response.status).toBe(404)
    expect(mocks.conversationFindFirst.mock.calls[0][0].where).toEqual({ id: 77, userId: 10 })
  })
})

describe('POST /api/clans/[clanId]/coach/chat — flux', () => {
  it('ouvre un fil, réserve l’usage, relaie le flux et enregistre la réponse avec son coût', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.resolveContext.mockResolvedValue({
      kind: 'match', matchId: 'cmatch1', mapName: 'Baltic_Main', mapLabel: 'Erangel', createdAt: new Date('2026-10-22T19:47:00Z'), placement: 3, squadKills: 18, telemetryAnalyzed: true,
    })
    mocks.streamAnswer.mockImplementation(async (request: { onDelta?: (t: string) => void; onToolCall?: (c: unknown) => void; system: string; history: unknown[] }) => {
      request.onToolCall?.({ name: 'getMatchDebrief', args: { matchId: 'cmatch1' } })
      request.onDelta?.('Phase 5 ')
      request.onDelta?.('· 18:42')
      return { text: 'Phase 5 · 18:42', toolCalls: [{ name: 'getMatchDebrief', args: { matchId: 'cmatch1' } }], tokensIn: 1400, tokensOut: 150, rounds: 2, finishReason: 'STOP' }
    })

    const response = await chat({ message: 'Pourquoi on s’est fait sortir ?', contextPath: '/clans/292/telemetry/matches/cmatch1/debrief' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(response.headers.get('cache-control')).toContain('no-transform')
    const events = await readSse(response)
    expect(events.map((event) => event.event)).toEqual(['meta', 'tool', 'delta', 'delta', 'done'])
    expect(events[0].data).toEqual({ conversationId: 42, questionId: 1000, context: { label: 'Erangel · 22 oct. 21:47 · Top 3', suggestions: expect.any(Array) } })
    expect(events[1].data).toEqual({ name: 'getMatchDebrief', label: 'Je relis le match…' })
    expect(events[4].data).toMatchObject({ messageId: 1001, unverified: false, remainingHour: 16, monthPercent: 0, finishReason: 'STOP' })

    expect(mocks.conversationCreate.mock.calls[0][0].data).toEqual({ userId: 10, memberId: 100, clanId: 292, title: 'Pourquoi on s’est fait sortir ?', contextLabel: 'Erangel · 22 oct. 21:47 · Top 3' })
    expect(mocks.usageCreate.mock.calls[0][0].data).toEqual({ userId: 10, clanId: 292, conversationId: 42, model: 'gemini-3.5-flash-lite', status: 'pending' })
    expect(mocks.messageCreate.mock.calls[0][0].data).toEqual({ conversationId: 42, role: 'user', content: 'Pourquoi on s’est fait sortir ?', contextPath: '/clans/292/telemetry/matches/cmatch1/debrief' })
    expect(mocks.messageCreate.mock.calls[1][0].data).toEqual({ conversationId: 42, role: 'assistant', content: 'Phase 5 · 18:42', toolCalls: [{ name: 'getMatchDebrief', args: { matchId: 'cmatch1' } }], unverified: false })
    // 1 400 × 0,30 + 150 × 2,50 = 795 µ$.
    expect(mocks.usageUpdate).toHaveBeenCalledWith({ where: { id: 500 }, data: { status: 'ok', tokensIn: 1400, tokensOut: 150, costMicroUsd: 795 } })
    const streamRequest = mocks.streamAnswer.mock.calls[0][0]
    expect(streamRequest.system).toContain('NovakTV')
    expect(streamRequest.system).toContain('[47R]')
    expect(streamRequest.system).toContain('getMatchDebrief avec matchId « cmatch1 »')
  })

  it('marque « non vérifié » une réponse chiffrée sans appel d’outil et ignore un contexte étranger', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.streamAnswer.mockResolvedValue({ text: 'Tu as fait 420 dégâts.', toolCalls: [], tokensIn: 700, tokensOut: 40, rounds: 1, finishReason: 'STOP' })
    const events = await readSse(await chat({ message: 'Combien de dégâts ?', contextPath: '/clans/999/matches' }))
    expect(events.at(-1)?.data).toMatchObject({ unverified: true })
    expect(mocks.messageCreate.mock.calls[0][0].data.contextPath).toBeNull()
    expect(mocks.messageCreate.mock.calls[1][0].data).toMatchObject({ unverified: true, toolCalls: undefined })
  })

  it('reprend l’historique du fil, borné, dans l’ordre', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.conversationFindFirst.mockResolvedValue({ id: 42 })
    mocks.messageFindMany.mockResolvedValue([
      { role: 'assistant', content: 'Réponse 2' },
      { role: 'user', content: 'Question 2' },
    ])
    mocks.streamAnswer.mockResolvedValue({ text: 'OK', toolCalls: [], tokensIn: 10, tokensOut: 2, rounds: 1, finishReason: 'STOP' })
    await readSse(await chat({ message: 'Question 3', conversationId: 42 }))
    expect(mocks.messageFindMany.mock.calls[0][0]).toMatchObject({ where: { conversationId: 42, id: { lt: 1000 } }, take: 10 })
    expect(mocks.streamAnswer.mock.calls[0][0].history).toEqual([
      { role: 'user', content: 'Question 2' },
      { role: 'assistant', content: 'Réponse 2' },
    ])
    expect(mocks.conversationCreate).not.toHaveBeenCalled()
  })

  it('transforme une erreur du fournisseur en événement, sans décompter la question', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getSession.mockResolvedValue(session())
    const { CoachProviderError } = await import('@/lib/coach/coach-provider')
    mocks.streamAnswer.mockRejectedValue(new CoachProviderError('rate_limited', 'Trop de requêtes', 429))
    const events = await readSse(await chat({ message: 'Pourquoi ?' }))
    expect(events.map((event) => event.event)).toEqual(['meta', 'error'])
    expect(events[1].data.code).toBe('rate_limited')
    expect(mocks.usageUpdate).toHaveBeenCalledWith({ where: { id: 500 }, data: { status: 'error', tokensIn: 0, tokensOut: 0, costMicroUsd: 0 } })
    expect(mocks.messageCreate).toHaveBeenCalledTimes(1)
    silence.mockRestore()
  })

  it('garde ce qui a été dit quand le client interrompt, et compte la question', async () => {
    mocks.getSession.mockResolvedValue(session())
    const { CoachProviderError } = await import('@/lib/coach/coach-provider')
    mocks.streamAnswer.mockImplementation(async (request: { onDelta?: (t: string) => void }) => {
      request.onDelta?.('Début de réponse')
      throw new CoachProviderError('aborted', 'Interrompu')
    })
    const events = await readSse(await chat({ message: 'Pourquoi ?' }))
    expect(events.map((event) => event.event)).toEqual(['meta', 'delta', 'error', 'done'])
    expect(mocks.messageCreate.mock.calls[1][0].data).toMatchObject({ role: 'assistant', content: 'Début de réponse' })
    expect(mocks.usageUpdate).toHaveBeenCalledWith({ where: { id: 500 }, data: { status: 'aborted', tokensIn: 0, tokensOut: 0, costMicroUsd: 0 } })
  })

  it('laisse le SuperUser interroger un clan sans membre actif, même Coach fermé', async () => {
    mocks.getSession.mockResolvedValue(session({ isSuperUser: true, activeMemberId: null }))
    mocks.appConfigFindMany.mockResolvedValue([])
    mocks.streamAnswer.mockResolvedValue({ text: 'OK', toolCalls: [], tokensIn: 10, tokensOut: 2, rounds: 1, finishReason: 'STOP' })
    const response = await chat({ message: 'État du clan ?' })
    expect(response.status).toBe(200)
    await readSse(response)
    expect(mocks.conversationCreate.mock.calls[0][0].data).toMatchObject({ userId: 10, memberId: null, clanId: 292 })
    expect(mocks.streamAnswer.mock.calls[0][0].system).toContain('SuperUser')
  })
})

describe('fils et votes', () => {
  it('liste les fils du compte, jamais ceux d’un autre', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.conversationFindMany.mockResolvedValue([{ id: 42, title: 'Wipe en phase 5', contextLabel: 'Erangel · 22 oct. 21:47 · Top 3', clanId: 292, createdAt: new Date('2026-10-22T19:58:00Z'), updatedAt: new Date('2026-10-22T20:10:00Z') }])
    const response = await listRoute(json('/api/coach/conversations', 'GET'))
    expect(await response.json()).toEqual({
      authenticated: true,
      conversations: [{ id: 42, title: 'Wipe en phase 5', contextLabel: 'Erangel · 22 oct. 21:47 · Top 3', clanId: 292, createdAt: '2026-10-22T19:58:00.000Z', updatedAt: '2026-10-22T20:10:00.000Z' }],
    })
    expect(mocks.conversationFindMany.mock.calls[0][0]).toMatchObject({ where: { userId: 10 }, take: 50 })

    mocks.getSession.mockResolvedValue(null)
    mocks.getToken.mockReturnValue(null)
    const visitor = await listRoute(json('/api/coach/conversations', 'GET'))
    expect(visitor.status).toBe(200)
    expect(await visitor.json()).toEqual({ authenticated: false, conversations: [] })
  })

  it('lit un fil avec ses messages, 404 s’il n’est pas au compte, lecture ouverte au SuperUser', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.conversationFindFirst.mockResolvedValue({
      id: 42, title: 'Wipe', contextLabel: null, clanId: 292, createdAt: new Date('2026-10-22T19:58:00Z'), updatedAt: new Date('2026-10-22T20:10:00Z'),
      messages: [
        { id: 1, role: 'user', content: 'Pourquoi ?', toolCalls: null, unverified: false, feedbackScore: null, createdAt: new Date('2026-10-22T19:58:00Z') },
        { id: 2, role: 'assistant', content: 'Parce que.', toolCalls: [{ name: 'getMatchDebrief', args: {} }], unverified: false, feedbackScore: 1, createdAt: new Date('2026-10-22T19:58:05Z') },
      ],
    })
    const response = await getRoute(json('/api/coach/conversations/42', 'GET'), { params: Promise.resolve({ id: '42' }) })
    const body = await response.json()
    expect(body.messages[1]).toEqual({ id: 2, role: 'assistant', content: 'Parce que.', tools: ['getMatchDebrief'], unverified: false, feedbackScore: 1, createdAt: '2026-10-22T19:58:05.000Z' })
    expect(mocks.conversationFindFirst.mock.calls[0][0].where).toEqual({ id: 42, userId: 10 })

    mocks.conversationFindFirst.mockResolvedValue(null)
    expect((await getRoute(json('/api/coach/conversations/43', 'GET'), { params: Promise.resolve({ id: '43' }) })).status).toBe(404)

    mocks.getSession.mockResolvedValue(session({ userId: 1, isSuperUser: true }))
    await getRoute(json('/api/coach/conversations/42', 'GET'), { params: Promise.resolve({ id: '42' }) })
    expect(mocks.conversationFindFirst.mock.calls.at(-1)?.[0].where).toEqual({ id: 42 })

    mocks.getSession.mockResolvedValue(null)
    expect((await getRoute(json('/api/coach/conversations/42', 'GET'), { params: Promise.resolve({ id: '42' }) })).status).toBe(401)
  })

  it('renomme et supprime seulement ses fils', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.conversationUpdateMany.mockResolvedValue({ count: 1 })
    const renamed = await patchRoute(json('/api/coach/conversations/42', 'PATCH', { title: '  Soirée du 22  ' }), { params: Promise.resolve({ id: '42' }) })
    expect(renamed.status).toBe(200)
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({ where: { id: 42, userId: 10 }, data: { title: 'Soirée du 22' } })
    expect((await patchRoute(json('/api/coach/conversations/42', 'PATCH', { title: '' }), { params: Promise.resolve({ id: '42' }) })).status).toBe(400)

    mocks.conversationDeleteMany.mockResolvedValue({ count: 0 })
    const deleted = await deleteRoute(json('/api/coach/conversations/43', 'DELETE'), { params: Promise.resolve({ id: '43' }) })
    expect(deleted.status).toBe(404)
    expect(mocks.conversationDeleteMany).toHaveBeenCalledWith({ where: { id: 43, userId: 10 } })
  })

  it('enregistre un vote sur une réponse du compte, avec sa précision', async () => {
    mocks.getSession.mockResolvedValue(session())
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 })
    const response = await feedbackRoute(json('/api/coach/messages/2/feedback', 'POST', { score: -1, note: 'La mise à terre est à 18:39.' }), { params: Promise.resolve({ id: '2' }) })
    expect(response.status).toBe(200)
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: { id: 2, role: 'assistant', conversation: { userId: 10 } },
      data: { feedbackScore: -1, feedbackNote: 'La mise à terre est à 18:39.', reviewedAt: null },
    })
    expect((await feedbackRoute(json('/api/coach/messages/2/feedback', 'POST', { score: 5 }), { params: Promise.resolve({ id: '2' }) })).status).toBe(400)
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 })
    expect((await feedbackRoute(json('/api/coach/messages/9/feedback', 'POST', { score: 1 }), { params: Promise.resolve({ id: '9' }) })).status).toBe(404)
  })
})
