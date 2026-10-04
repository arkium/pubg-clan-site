import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ligue Inter-Clans, service (docs/TODO/score.md, « contrôle du filtre matchType ») : la requête ne lit que les parties
 * du type demandé — Ranked = `competitive` seul — et le cache est propre à chaque période et type. Prisma est simulé :
 * aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  clanFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw, clan: { findMany: mocks.clanFindMany } },
}))

import { getClanLeague, loadLeagueRows } from './clan-league-service'

/** Valeurs liées à une requête `Prisma.sql` (paramètres de la clause `IN`, dates…). */
const valuesOf = (call: unknown[]) => (call[0] as Prisma.Sql).values
const sqlOf = (call: unknown[]) => (call[0] as Prisma.Sql).sql

beforeEach(() => {
  mocks.queryRaw.mockReset()
  mocks.clanFindMany.mockReset()
  mocks.queryRaw.mockResolvedValue([])
  mocks.clanFindMany.mockResolvedValue([])
})

describe('loadLeagueRows — filtre de type de partie', () => {
  it('Ranked : `competitive` seul, jamais `official`', async () => {
    await loadLeagueRows(null, 'competitive')
    const call = mocks.queryRaw.mock.calls[0]
    expect(sqlOf(call)).toContain('sm.matchType IN (?)')
    expect(valuesOf(call)).toEqual(['competitive'])
  })

  it('Normal par défaut, Casual avec les lobbies de bots, Tournois / Custom', async () => {
    await loadLeagueRows(null)
    await loadLeagueRows(null, 'casual')
    await loadLeagueRows(null, 'custom')
    const [normal, casual, custom] = mocks.queryRaw.mock.calls
    expect(valuesOf(normal)).toEqual(['official'])
    expect(sqlOf(casual)).toContain('sm.matchType IN (?,?)')
    expect(valuesOf(casual)).toEqual(['casual', 'airoyale'])
    expect(valuesOf(custom)).toEqual(['custom'])
  })

  it('la date de début reste un paramètre de la requête', async () => {
    const since = new Date('2026-09-28T00:00:00Z')
    await loadLeagueRows(since, 'competitive')
    expect(valuesOf(mocks.queryRaw.mock.calls[0])).toEqual(['competitive', since])
  })
})

describe('getClanLeague — type de partie', () => {
  it('chaque requête (lignes, joueurs actifs) suit le type ; un cache par période et par type', async () => {
    const now = new Date('2026-10-04T12:00:00Z')
    const ranked = await getClanLeague('week', 'competitive', now)
    expect(ranked.matchType).toBe('competitive')
    expect(ranked.scoring.minMatches).toBe(5)
    const rankedCalls = mocks.queryRaw.mock.calls.length
    expect(mocks.queryRaw.mock.calls.every((call) => valuesOf(call).includes('competitive') && !valuesOf(call).includes('official'))).toBe(true)

    await getClanLeague('week', 'competitive', now)
    expect(mocks.queryRaw.mock.calls.length).toBe(rankedCalls) // servi par le cache

    const normal = await getClanLeague('week', 'official', now)
    expect(normal.matchType).toBe('official')
    expect(mocks.queryRaw.mock.calls.length).toBeGreaterThan(rankedCalls)
    expect(mocks.queryRaw.mock.calls.slice(rankedCalls).every((call) => valuesOf(call).includes('official'))).toBe(true)
  })
})
