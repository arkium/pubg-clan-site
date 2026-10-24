import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Alertes du Coach IA vers le salon d'administration (docs/TODO/chatbot-ia.md §9) : décisions pures, puis envoi avec
 * mémoire dans `AppConfig` — jamais deux fois le même niveau, jamais une exception vers l'appelant.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  send: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { appConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert }, coachUsage: { count: mocks.count } },
}))
vi.mock('@/lib/admin-alerts/send', () => ({ sendAdminAlert: mocks.send }))
vi.mock('@/lib/coach/coach-config', () => ({ getCoachSettings: mocks.getSettings }))

import {
  COACH_ERROR_ALERT,
  decideCoachBudgetAlert,
  decideCoachErrorsAlert,
  decideCoachModelNotice,
  notifyCoachBudgetIfNeeded,
  notifyCoachModelNoticeIfNeeded,
  notifyCoachProviderErrorsIfNeeded,
} from '@/lib/coach/coach-alerts'
import { getCoachModel } from '@/lib/coach/coach-models'

const NOW = new Date('2026-10-24T18:00:00.000Z')
const PERIOD = { start: new Date('2026-09-30T22:00:00.000Z'), end: new Date('2026-10-31T23:00:00.000Z') }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUnique.mockResolvedValue(null)
  mocks.upsert.mockResolvedValue(undefined)
  mocks.send.mockResolvedValue({ sent: true, status: 204 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('décisions', () => {
  it('plafond : 80 puis 100, jamais deux fois ni en arrière, jamais sans plafond', () => {
    const budget = 1_000_000
    expect(decideCoachBudgetAlert({ percent: 79, budgetMicroUsd: budget, announced: null })).toBeNull()
    expect(decideCoachBudgetAlert({ percent: 80, budgetMicroUsd: budget, announced: null })).toBe(80)
    expect(decideCoachBudgetAlert({ percent: 92, budgetMicroUsd: budget, announced: 80 })).toBeNull()
    expect(decideCoachBudgetAlert({ percent: 100, budgetMicroUsd: budget, announced: 80 })).toBe(100)
    expect(decideCoachBudgetAlert({ percent: 130, budgetMicroUsd: budget, announced: 100 })).toBeNull()
    expect(decideCoachBudgetAlert({ percent: 100, budgetMicroUsd: budget, announced: null })).toBe(100)
    expect(decideCoachBudgetAlert({ percent: 100, budgetMicroUsd: 0, announced: null })).toBeNull()
  })

  it('erreurs : au seuil, et seulement une fois le silence écoulé', () => {
    expect(decideCoachErrorsAlert({ errorsInWindow: COACH_ERROR_ALERT.threshold - 1, quietUntil: null, now: NOW })).toBe(false)
    expect(decideCoachErrorsAlert({ errorsInWindow: COACH_ERROR_ALERT.threshold, quietUntil: null, now: NOW })).toBe(true)
    expect(decideCoachErrorsAlert({ errorsInWindow: 9, quietUntil: new Date(NOW.getTime() + 1000), now: NOW })).toBe(false)
    expect(decideCoachErrorsAlert({ errorsInWindow: 9, quietUntil: new Date(NOW.getTime() - 1000), now: NOW })).toBe(true)
  })

  it('modèle : arrêt ou prix dans les trente jours, rien avant ni après', () => {
    const lite31 = getCoachModel('gemini-3.1-flash-lite')!
    expect(decideCoachModelNotice(lite31, NOW)).toBeNull()
    expect(decideCoachModelNotice(lite31, new Date('2027-04-10T08:00:00.000Z'))).toEqual({ kind: 'shutdown', date: '2027-05-07' })

    const flash38 = getCoachModel('gemini-3.8-flash')!
    expect(decideCoachModelNotice(flash38, new Date('2026-11-20T08:00:00.000Z'))).toBeNull()
    expect(decideCoachModelNotice(flash38, new Date('2026-12-05T08:00:00.000Z'))).toEqual({ kind: 'price', date: '2027-01-01' })
    expect(decideCoachModelNotice(flash38, new Date('2027-01-02T08:00:00.000Z'))).toBeNull()
  })
})

describe('notifyCoachBudgetIfNeeded', () => {
  const input = { globalBudgetMicroUsd: 50_000_000, periodStart: PERIOD.start, periodEnd: PERIOD.end, usdEurRate: 0.86 }

  it('annonce 80 % une fois, en le notant dans AppConfig pour le mois', async () => {
    await notifyCoachBudgetIfNeeded({ ...input, globalSpentMicroUsd: 42_000_000 })
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'coach_alert_budget_2026-09' }, update: { value: '80' } }))
    expect(mocks.send).toHaveBeenCalledWith('coach_budget', expect.objectContaining({ title: expect.stringContaining('80 %') }))

    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ value: '80' })
    await notifyCoachBudgetIfNeeded({ ...input, globalSpentMicroUsd: 45_000_000 })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('annonce le plafond atteint après le 80 %, et jamais le 80 % une fois le plafond passé', async () => {
    mocks.findUnique.mockResolvedValue({ value: '80' })
    await notifyCoachBudgetIfNeeded({ ...input, globalSpentMicroUsd: 50_000_000 })
    expect(mocks.send).toHaveBeenCalledWith('coach_budget', expect.objectContaining({ title: expect.stringContaining('pause') }))

    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ value: '100' })
    await notifyCoachBudgetIfNeeded({ ...input, globalSpentMicroUsd: 60_000_000 })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('ne lève jamais : une base en panne se note dans le journal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.findUnique.mockRejectedValue(new Error('base indisponible'))
    await expect(notifyCoachBudgetIfNeeded({ ...input, globalSpentMicroUsd: 49_000_000 })).resolves.toBeUndefined()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})

describe('notifyCoachProviderErrorsIfNeeded', () => {
  it('alerte au seuil, pose le silence, puis se tait tant qu’il court', async () => {
    mocks.count.mockResolvedValue(5)
    await notifyCoachProviderErrorsIfNeeded(NOW, 'unauthorized — API key not valid')
    expect(mocks.count).toHaveBeenCalledWith({ where: { status: 'error', createdAt: { gte: new Date(NOW.getTime() - COACH_ERROR_ALERT.windowMinutes * 60 * 1000) } } })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'coach_alert_errors_quiet_until' }, update: { value: new Date(NOW.getTime() + COACH_ERROR_ALERT.quietHours * 60 * 60 * 1000).toISOString() } })
    )
    expect(mocks.send).toHaveBeenCalledWith('coach_provider_errors', expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ value: 'unauthorized — API key not valid' })]) }))

    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ value: new Date(NOW.getTime() + 60_000).toISOString() })
    mocks.count.mockResolvedValue(12)
    await notifyCoachProviderErrorsIfNeeded(NOW)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('sous le seuil : rien', async () => {
    mocks.count.mockResolvedValue(2)
    await notifyCoachProviderErrorsIfNeeded(NOW)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})

describe('notifyCoachModelNoticeIfNeeded', () => {
  it('prévient une fois par échéance du modèle actif', async () => {
    mocks.getSettings.mockResolvedValue({ model: 'gemini-3.1-flash-lite' })
    const april = new Date('2027-04-20T07:00:00.000Z')
    await notifyCoachModelNoticeIfNeeded(april)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'coach_alert_model_gemini-3.1-flash-lite_shutdown_2027-05-07' } }))
    expect(mocks.send).toHaveBeenCalledWith('coach_model_notice', expect.objectContaining({ title: expect.stringContaining('arrêt annoncé') }))

    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ value: '1' })
    await notifyCoachModelNoticeIfNeeded(april)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('rien quand le modèle actif n’a aucune échéance proche', async () => {
    mocks.getSettings.mockResolvedValue({ model: 'gemini-3.5-flash-lite' })
    await notifyCoachModelNoticeIfNeeded(NOW)
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
