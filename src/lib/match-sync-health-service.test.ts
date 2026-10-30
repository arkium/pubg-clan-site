import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fraîcheur des parties — état dans `AppConfig.match_sync_health` (docs/TODO/fraicheur-des-parties.md). Prisma est
 * simulé par un `AppConfig` en mémoire : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  cronFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  fireAdminAlert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    cronSchedule: { findUnique: mocks.cronFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/lib/pubg-rate-limit-config-service', () => ({ getPubgApiRateLimitRpm: async () => 10 }))
vi.mock('@/lib/admin-alerts/send', () => ({ fireAdminAlert: mocks.fireAdminAlert }))

import { emptyMatchSyncHealthState, parseMatchSyncHealthState, type MatchSyncHealthState } from '@/lib/match-sync-health'
import {
  countPubgCalls,
  getMatchSyncHealthSummary,
  getMatchSyncIntervalMinutes,
  MATCH_SYNC_HEALTH_KEY,
  recordMatchSyncSkip,
  startMatchSyncPass,
} from '@/lib/match-sync-health-service'

const NOW = new Date('2026-10-30T20:00:00Z')
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000)
const stored = () => parseMatchSyncHealthState(mocks.store.get(MATCH_SYNC_HEALTH_KEY) ?? '') as MatchSyncHealthState
const callRow = (statusCode: number | null, success: boolean, limited: boolean, lastHour: boolean, calls: number) => ({
  statusCode,
  success: success ? 1 : 0,
  limited: BigInt(limited ? 1 : 0),
  lastHour: BigInt(lastHour ? 1 : 0),
  calls: BigInt(calls),
})
const clanResult = (delays: number[], importedMatches = delays.length) => ({ importedMatches, newMatchDelaysMinutes: delays, catchUpMatches: 0 })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mocks.store.clear()
  for (const mock of [mocks.upsert, mocks.findUnique, mocks.cronFindUnique, mocks.queryRaw, mocks.fireAdminAlert]) mock.mockReset()
  mocks.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    mocks.store.has(where.key) ? { value: mocks.store.get(where.key) } : null
  )
  mocks.upsert.mockImplementation(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
    mocks.store.set(where.key, update.value)
    return {}
  })
  mocks.cronFindUnique.mockResolvedValue({ expression: '*/30 * * * *' })
  mocks.queryRaw.mockResolvedValue([callRow(200, true, true, true, 540), callRow(200, true, false, false, 4_000)])
})
afterEach(() => {
  vi.useRealTimers()
})

describe('un tour de synchronisation', () => {
  it('une lecture au début, une écriture à la fin : délais, durée, clans, appels PUBG', async () => {
    const pass = await startMatchSyncPass(at(13))
    pass.addClan(clanResult([12, 15]))
    pass.addClan(clanResult([20]))
    pass.addClan(null)
    const summary = await pass.finish(NOW)

    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    expect(stored().passes).toEqual([
      { startedAt: at(13).toISOString(), finishedAt: NOW.toISOString(), clans: 3, failedClans: 1, importedMatches: 3, delays: [12, 15, 20], catchUps: 0 },
    ])
    expect(stored().calls).toMatchObject({ limitedLastHour: 540, ceilingPerHour: 600 })
    expect(summary).toMatchObject({ measured: true, delay: { count: 3, median: 15 }, lastPass: { durationMinutes: 13, failedClans: 1 } })
  })

  it('les parties en attente passent d’un tour au suivant, et sortent à l’import', async () => {
    const first = await startMatchSyncPass(at(13))
    first.tracker.failed({ matchId: 'm404', clanId: 25, memberId: 7, status: 404 })
    await first.finish(NOW)
    expect(stored().pending).toEqual([expect.objectContaining({ matchId: 'm404', memberId: 7, attempts: 1, lastStatus: 404 })])

    const second = await startMatchSyncPass(NOW)
    expect(second.tracker.retryIds(7)).toEqual(['m404'])
    second.tracker.imported(7, 'm404')
    await second.finish(new Date(NOW.getTime() + 13 * 60_000))
    expect(stored().pending).toEqual([])
  })

  it('reprend un tour sauté noté pendant le tour', async () => {
    const pass = await startMatchSyncPass(at(40))
    await recordMatchSyncSkip(at(10))
    expect(stored().skipped).toEqual([at(10).toISOString()])
    await pass.finish(NOW)
    expect(stored().skipped).toEqual([at(10).toISOString()])
    expect(stored().passes).toHaveLength(1)
  })

  it('repart de zéro sur un état illisible, et l’écrase', async () => {
    mocks.store.set(MATCH_SYNC_HEALTH_KEY, '{pas du json')
    const pass = await startMatchSyncPass(at(13))
    await pass.finish(NOW)
    expect(stored().passes).toHaveLength(1)
  })

  it('ne fait jamais échouer la synchronisation : une écriture en échec rend null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.upsert.mockRejectedValue(new Error('base injoignable'))
    const pass = await startMatchSyncPass(at(13))
    await expect(pass.finish(NOW)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith('[match-sync-health] Tour non enregistré :', expect.any(Error))
    warn.mockRestore()
  })

  it('alerte une fois à l’entrée dans un état dégradé, pas au tour suivant, puis sans mention au retour', async () => {
    const degraded = [callRow(401, false, true, true, 1)]
    mocks.queryRaw.mockResolvedValue(degraded)
    await (await startMatchSyncPass(at(13))).finish(NOW)
    expect(mocks.fireAdminAlert).toHaveBeenCalledTimes(1)
    expect(mocks.fireAdminAlert.mock.calls[0][0]).toBe('match_sync_degraded')
    expect(mocks.fireAdminAlert.mock.calls[0][1]()).toMatchObject({ title: expect.stringContaining('en difficulté') })

    // Tours suivants de 13 min, toutes les 30 min.
    const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
    await (await startMatchSyncPass(later(17))).finish(later(30))
    expect(mocks.fireAdminAlert).toHaveBeenCalledTimes(1)

    mocks.queryRaw.mockResolvedValue([])
    await (await startMatchSyncPass(later(47))).finish(later(60))
    expect(mocks.fireAdminAlert).toHaveBeenCalledTimes(2)
    expect(mocks.fireAdminAlert.mock.calls[1][2]).toEqual({ withoutMention: true })
  })
})

describe('appels PUBG et horaire', () => {
  it('classe les échecs : 429, à traiter, passagers de la dernière heure ; les 404 ne comptent pas', async () => {
    mocks.queryRaw.mockResolvedValue([
      callRow(200, true, true, true, 500),
      callRow(200, true, true, false, 3_000),
      callRow(429, false, true, false, 2),
      callRow(403, false, true, false, 1),
      callRow(502, false, false, true, 3),
      callRow(null, false, false, true, 1),
      callRow(504, false, false, false, 7),
      callRow(404, false, false, true, 12),
    ])
    expect(await countPubgCalls(NOW)).toEqual({
      at: NOW.toISOString(),
      limitedLastHour: 500,
      ceilingPerHour: 600,
      http429Last24h: 2,
      actionLast24h: 1,
      transientLastHour: 4,
    })
  })

  it('intervalle de la synchronisation : réglage en base, sinon défaut du code', async () => {
    expect(await getMatchSyncIntervalMinutes()).toBe(30)
    mocks.cronFindUnique.mockResolvedValue({ expression: '0 * * * *' })
    expect(await getMatchSyncIntervalMinutes()).toBe(60)
    mocks.cronFindUnique.mockResolvedValue(null)
    expect(await getMatchSyncIntervalMinutes()).toBe(30)
  })

  it('résumé de page : rien que AppConfig et l’horaire ; état illisible = null', async () => {
    expect(await getMatchSyncHealthSummary(NOW)).toMatchObject({ measured: false, status: 'ok' })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
    mocks.store.set(MATCH_SYNC_HEALTH_KEY, JSON.stringify({ ...emptyMatchSyncHealthState(), version: 9 }))
    expect(await getMatchSyncHealthSummary(NOW)).toBeNull()
  })
})

// `cron-jobs.ts` importe toute la plateforme : son branchement se contrôle sur le texte.
describe('branchement dans la synchronisation planifiée', () => {
  const source = readFileSync(path.resolve(__dirname, 'cron-jobs.ts'), 'utf8')
  const body = source.slice(source.indexOf('async function runDailyClanSync'), source.indexOf('export async function sendNotificationsReminders'))

  it('un tour sauté est noté, un tour ouvre la mesure, compte chaque clan (échecs compris) et la ferme', () => {
    expect(body).toMatch(/clanSyncInProgress\) \{[\s\S]*?await recordMatchSyncSkip\(\)[\s\S]*?return/)
    expect(body).toContain('const health = await startMatchSyncPass(startedAt)')
    expect(body).toContain('syncClanWithRetry(clan.id, clan.name, health.tracker)')
    expect(body).toContain('if (!countedForHealth) health.addClan(null)')
    expect(body).toContain('await health.finish(finishedAt)')
  })
})
