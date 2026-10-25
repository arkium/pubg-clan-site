import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `GET /api/coach/limits` (aide du Coach, 2026-10-25) : les réglages chiffrés du SuperUser et les bornes de la mémoire,
 * sans session ni donnée personnelle, en cache public. Prisma simulé (CLAUDE.md, piège n° 9).
 */

const mocks = vi.hoisted(() => ({ appConfigFindMany: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { appConfig: { findMany: mocks.appConfigFindMany } } }))

import { GET } from '@/app/api/coach/limits/route'
import { resetCoachSettingsCache } from '@/lib/coach/coach-config'
import { coachHelpLimits } from '@/lib/coach/coach-help'

beforeEach(() => {
  resetCoachSettingsCache()
  mocks.appConfigFindMany.mockReset()
})

describe('GET /api/coach/limits', () => {
  it('renvoie les limites des réglages et les bornes de la mémoire, sans rien d’autre, en cache public', async () => {
    mocks.appConfigFindMany.mockResolvedValue([
      { key: 'coach_hourly_limit', value: '30' },
      { key: 'coach_budget_per_account_eur', value: '2,5' },
      { key: 'coach_memory_enabled', value: 'true' },
    ])
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('max-age=300')
    expect(await response.json()).toEqual({
      hourlyLimit: 30,
      minIntervalSeconds: 4,
      maxInputChars: 400,
      budgetPerAccountEur: 2.5,
      historyMessages: 10,
      memoryEnabled: true,
      memoryMax: 8,
      memoryRetentionDays: 90,
    })
  })

  it('une base injoignable rend les valeurs par défaut (réglages de repli), jamais une erreur', async () => {
    mocks.appConfigFindMany.mockRejectedValue(new Error('down'))
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ hourlyLimit: 20, budgetPerAccountEur: 2, memoryEnabled: false })
    silence.mockRestore()
  })
})

describe('limites chiffrées de l’aide', () => {
  it('met les nombres des réglages dans les phrases, et la ligne de mémoire seulement quand elle est ouverte', () => {
    const rows = coachHelpLimits({ hourlyLimit: 20, minIntervalSeconds: 4, maxInputChars: 400, budgetPerAccountEur: 2, historyMessages: 10, memoryEnabled: true, memoryMax: 8, memoryRetentionDays: 90 })
    expect(rows.find((row) => row.startsWith('20 questions par heure'))).toMatch(/2\s€ de budget par mois/)
    expect(rows.find((row) => row.startsWith('Une question fait au plus 400 caractères'))).toMatch(/4\ss d’écart.*10 derniers messages/)
    expect(rows.at(-1)).toMatch(/au plus 8 lignes sur toi, 90 jours/)
    const closed = coachHelpLimits({ hourlyLimit: 20, minIntervalSeconds: 0, maxInputChars: 400, budgetPerAccountEur: 2, historyMessages: 10, memoryEnabled: false, memoryMax: 8, memoryRetentionDays: 90 })
    expect(closed.some((row) => row.includes('lignes sur toi'))).toBe(false)
    expect(closed.find((row) => row.startsWith('Une question fait'))).not.toContain('d’écart')
    const generic = coachHelpLimits(null)
    expect(generic.some((row) => row.startsWith('Un nombre de questions par heure'))).toBe(true)
    for (const row of [...rows, ...generic]) expect(row).not.toMatch(/\b(vous|votre|vos)\b/i)
  })
})
