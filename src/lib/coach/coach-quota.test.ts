import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findFirst: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachUsage: {
      count: mocks.count,
      findFirst: mocks.findFirst,
      aggregate: mocks.aggregate,
      create: mocks.create,
      update: mocks.update,
    },
  },
}))

import { COACH_SETTING_DEFAULTS, type CoachSettings } from '@/lib/coach/coach-config'
import {
  coachQuotaPayload,
  completeCoachUsage,
  decideCoachQuota,
  parisMonthBounds,
  readCoachQuotaFacts,
  reserveCoachUsage,
  type CoachQuotaFacts,
} from '@/lib/coach/coach-quota'

const NOW = new Date('2026-10-24T20:00:00Z')
const PERIOD = { start: new Date('2026-09-30T22:00:00Z'), end: new Date('2026-10-31T23:00:00Z') }

const settings = (overrides: Partial<CoachSettings> = {}): CoachSettings => ({ ...COACH_SETTING_DEFAULTS, enabled: true, ...overrides })

const facts = (overrides: Partial<CoachQuotaFacts> = {}): CoachQuotaFacts => ({
  hourCount: 0,
  oldestInHourAt: null,
  lastQuestionAt: null,
  monthSpentMicroUsd: 0,
  globalSpentMicroUsd: 0,
  periodStart: PERIOD.start,
  periodEnd: PERIOD.end,
  ...overrides,
})

const member = { isSuperUser: false, hasApiKey: true, now: NOW }

describe('mois calendaire de Paris', () => {
  it('commence et finit à minuit de Paris, heure d’été comprise', () => {
    // Octobre 2026 : le 1er est en heure d'été (UTC+2), le 1er novembre en heure d'hiver (UTC+1).
    expect(parisMonthBounds(NOW)).toEqual(PERIOD)
    // 23:30 UTC le 31 décembre, c'est déjà le 1er janvier à Paris : janvier 2027.
    expect(parisMonthBounds(new Date('2026-12-31T23:30:00Z'))).toEqual({
      start: new Date('2026-12-31T23:00:00Z'),
      end: new Date('2027-01-31T23:00:00Z'),
    })
    // 22:30 UTC, c'est encore le 31 décembre à Paris : décembre 2026.
    expect(parisMonthBounds(new Date('2026-12-31T22:30:00Z'))).toEqual({
      start: new Date('2026-11-30T23:00:00Z'),
      end: new Date('2026-12-31T23:00:00Z'),
    })
  })
})

describe('décision de quota', () => {
  it('laisse passer un membre dans les limites et compte ce qui reste', () => {
    const decision = decideCoachQuota(facts({ hourCount: 6, monthSpentMicroUsd: 300_000, globalSpentMicroUsd: 600_000 }), settings(), member)
    expect(decision.allowed).toBe(true)
    expect(decision.state.remainingHour).toBe(14)
    // 2 € à 0,86 = 2 325 581 µ$ ; 300 000 µ$ → 13 %. Plafond global 50 € = 58 139 535 µ$ ; 600 000 µ$ → 1 %.
    expect(decision.state.monthBudgetMicroUsd).toBe(2_325_581)
    expect(decision.state.monthPercent).toBe(13)
    expect(decision.state.globalPercent).toBe(1)
  })

  it('refuse sans clé d’API, même le SuperUser', () => {
    expect(decideCoachQuota(facts(), settings(), { ...member, hasApiKey: false })).toMatchObject({ allowed: false, reason: 'coach_paused', retryAt: null })
    expect(decideCoachQuota(facts(), settings(), { ...member, isSuperUser: true, hasApiKey: false })).toMatchObject({ allowed: false, reason: 'coach_paused' })
  })

  it('met les membres en pause quand le Coach est fermé, pas le SuperUser', () => {
    expect(decideCoachQuota(facts(), settings({ enabled: false }), member)).toMatchObject({ allowed: false, reason: 'coach_paused' })
    const admin = decideCoachQuota(facts({ hourCount: 99, monthSpentMicroUsd: 9_000_000 }), settings({ enabled: false }), { ...member, isSuperUser: true })
    expect(admin).toMatchObject({ allowed: true, state: { unlimited: true, remainingHour: null, monthPercent: null } })
  })

  it('tient une fenêtre horaire réellement glissante', () => {
    const oldest = new Date('2026-10-24T19:05:00Z')
    const refused = decideCoachQuota(facts({ hourCount: 20, oldestInHourAt: oldest, lastQuestionAt: new Date('2026-10-24T19:50:00Z') }), settings(), member)
    expect(refused).toMatchObject({ allowed: false, reason: 'hourly_limit', retryAt: new Date('2026-10-24T20:05:00Z') })
    expect(refused.state.remainingHour).toBe(0)
    expect(decideCoachQuota(facts({ hourCount: 19 }), settings(), member).allowed).toBe(true)
  })

  it('freine les rafales côté serveur', () => {
    const last = new Date('2026-10-24T19:59:58Z')
    expect(decideCoachQuota(facts({ hourCount: 1, lastQuestionAt: last }), settings(), member)).toMatchObject({
      allowed: false,
      reason: 'too_fast',
      retryAt: new Date('2026-10-24T20:00:02Z'),
    })
    expect(decideCoachQuota(facts({ hourCount: 1, lastQuestionAt: new Date('2026-10-24T19:59:55Z') }), settings(), member).allowed).toBe(true)
    expect(decideCoachQuota(facts({ hourCount: 1, lastQuestionAt: last }), settings({ minIntervalSeconds: 0 }), member).allowed).toBe(true)
  })

  it('ferme le compte au budget du mois, et tout le monde au plafond global', () => {
    expect(decideCoachQuota(facts({ monthSpentMicroUsd: 2_325_581 }), settings(), member)).toMatchObject({
      allowed: false,
      reason: 'monthly_budget',
      retryAt: PERIOD.end,
    })
    expect(decideCoachQuota(facts({ globalSpentMicroUsd: 58_139_535 }), settings(), member)).toMatchObject({ allowed: false, reason: 'global_budget', retryAt: PERIOD.end })
    // Un budget à zéro ne laisse passer aucune question.
    expect(decideCoachQuota(facts(), settings({ budgetPerAccountEur: 0 }), member)).toMatchObject({ allowed: false, reason: 'monthly_budget' })
  })

  it('sérialise la décision pour le tiroir', () => {
    const payload = coachQuotaPayload(decideCoachQuota(facts({ hourCount: 3 }), settings(), member))
    expect(payload).toEqual({
      authenticated: true,
      allowed: true,
      reason: null,
      retryAt: null,
      unlimited: false,
      remainingHour: 17,
      hourlyLimit: 20,
      monthPercent: 0,
      globalPercent: 0,
      periodEnd: '2026-10-31T23:00:00.000Z',
      memoryEnabled: false,
    })
    // Mémoire personnelle ouverte (lot 11) : le panneau l'apprend par le quota, sans appel de plus.
    expect(coachQuotaPayload(decideCoachQuota(facts({ hourCount: 3 }), settings(), member), { memoryEnabled: true }).memoryEnabled).toBe(true)
  })
})

describe('lecture des faits et réservation', () => {
  beforeEach(() => {
    mocks.count.mockReset()
    mocks.findFirst.mockReset()
    mocks.aggregate.mockReset()
    mocks.create.mockReset()
    mocks.update.mockReset()
  })

  it('compte par compte, sur la dernière heure et le mois de Paris, sans les erreurs', async () => {
    mocks.count.mockResolvedValue(4)
    mocks.findFirst.mockResolvedValueOnce({ createdAt: new Date('2026-10-24T19:10:00Z') }).mockResolvedValueOnce({ createdAt: new Date('2026-10-24T19:58:00Z') })
    mocks.aggregate.mockResolvedValueOnce({ _sum: { costMicroUsd: 1234 } }).mockResolvedValueOnce({ _sum: { costMicroUsd: null } })

    const result = await readCoachQuotaFacts(7, NOW)

    expect(result).toEqual({
      hourCount: 4,
      oldestInHourAt: new Date('2026-10-24T19:10:00Z'),
      lastQuestionAt: new Date('2026-10-24T19:58:00Z'),
      monthSpentMicroUsd: 1234,
      globalSpentMicroUsd: 0,
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
    })
    const countWhere = mocks.count.mock.calls[0][0].where
    expect(countWhere).toEqual({ userId: 7, status: { in: ['pending', 'ok', 'aborted', 'refused'] }, createdAt: { gte: new Date('2026-10-24T19:00:00Z') } })
    expect(mocks.aggregate.mock.calls[0][0].where).toEqual({ userId: 7, createdAt: { gte: PERIOD.start, lt: PERIOD.end } })
    expect(mocks.aggregate.mock.calls[1][0].where).toEqual({ createdAt: { gte: PERIOD.start, lt: PERIOD.end } })
  })

  it('réserve en « pending » puis complète la ligne', async () => {
    mocks.create.mockResolvedValue({ id: 99 })
    expect(await reserveCoachUsage({ userId: 7, clanId: 3, conversationId: null, model: 'gemini-3.5-flash-lite' })).toBe(99)
    expect(mocks.create.mock.calls[0][0].data).toEqual({ userId: 7, clanId: 3, conversationId: null, model: 'gemini-3.5-flash-lite', status: 'pending' })

    await completeCoachUsage(99, { status: 'ok', tokensIn: 1400, tokensOut: 150, costMicroUsd: 795 })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 99 }, data: { status: 'ok', tokensIn: 1400, tokensOut: 150, costMicroUsd: 795 } })
  })
})
