import type { Prisma } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSquadLobbyDb } from './test-stubs/sqlite-lobby'

/**
 * Parties partagées par plusieurs clans suivis (docs/TODO/place-partie-partagee.md) : la Ligue et la page Cartes
 * comptent chaque partie pour chaque clan avec **sa** place, celle de ses membres actifs. Les vraies requêtes des deux
 * services tournent sur une base SQLite en mémoire (`createSquadLobbyDb`) : aucun accès à la base réelle.
 */

const A = 1
const B = 2

// `placement` de la ligne = place du clan qui l'a créée ; l'ancienne lecture ne voyait aucun Top 1 ici.
const lobby = createSquadLobbyDb({
  members: [
    { id: 11, clanId: A },
    { id: 12, clanId: A },
    { id: 21, clanId: B },
    { id: 22, clanId: B },
  ],
  matches: [
    { id: 'm1', placement: 12, createdAt: '2026-10-20T20:00:00.000Z' }, // créée par A (12e), gagnée par B
    { id: 'm2', placement: 3, createdAt: '2026-10-20T21:00:00.000Z' }, // créée par B (3e), gagnée par A
    { id: 'm3', placement: 8, createdAt: '2026-10-20T22:00:00.000Z' }, // A seul
    { id: 'm4', placement: 15, createdAt: '2026-10-20T23:00:00.000Z' }, // créée par A (15e), B 9e
  ],
  squadMembers: [
    { squadMatchId: 'm1', memberId: 11, placement: 12, kills: 1 },
    { squadMatchId: 'm1', memberId: 12, placement: 12, kills: 1 },
    { squadMatchId: 'm1', memberId: 21, placement: 1, kills: 6 },
    { squadMatchId: 'm1', memberId: 22, placement: 1, kills: 2 },
    { squadMatchId: 'm2', memberId: 21, placement: 3, kills: 3 },
    { squadMatchId: 'm2', memberId: 11, placement: 1, kills: 5 },
    { squadMatchId: 'm2', memberId: 12, placement: 1, kills: 4 },
    { squadMatchId: 'm3', memberId: 11, placement: 8, kills: 2 },
    { squadMatchId: 'm3', memberId: 12, placement: 8, kills: 0 },
    { squadMatchId: 'm4', memberId: 11, placement: 15, kills: 0 },
    { squadMatchId: 'm4', memberId: 21, placement: 9, kills: 1 },
  ],
})
afterAll(() => lobby.close())

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), clanFindUnique: vi.fn(), clanCount: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw, clan: { findUnique: mocks.clanFindUnique, count: mocks.clanCount } },
}))
vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: vi.fn(async () => ({ Baltic_Main: 'Erangel' })),
  mapDisplayName: (mapName: string, labels: Record<string, string>) => labels[mapName] ?? mapName,
}))

import { leagueTableBetween } from './clan-league'
import { loadLeagueRows } from './clan-league-service'
import { loadClanMapStats, resetClanMapsLeagueCache } from './clan-map-stats-service'

beforeEach(() => {
  resetClanMapsLeagueCache()
  mocks.queryRaw.mockReset().mockImplementation((query: Prisma.Sql) => lobby.queryRaw(query))
  mocks.clanFindUnique.mockReset().mockImplementation(async ({ where }: { where: { id: number } }) => ({ id: where.id, name: `Clan ${where.id}`, tag: `C${where.id}` }))
  mocks.clanCount.mockReset().mockResolvedValue(2)
})

describe('Ligue des clans — une partie partagée compte pour chaque clan avec sa place', () => {
  it('loadLeagueRows : une ligne par clan et par partie, la place de ses membres', async () => {
    const rows = await loadLeagueRows(null)
    const placeOf = new Map(rows.map((row) => [`${row.matchId}:${row.clanId}`, row.placement]))
    expect(Object.fromEntries(placeOf)).toEqual({ 'm1:1': 12, 'm1:2': 1, 'm2:1': 1, 'm2:2': 3, 'm3:1': 8, 'm4:1': 15, 'm4:2': 9 })
    // Kills du clan seul, pas de la ligne.
    expect(rows.find((row) => row.matchId === 'm1' && row.clanId === B)?.kills).toBe(8)
  })

  it('Top 1 et points de placement par clan : chaque clan a gagné la partie créée par l’autre', async () => {
    const rows = await loadLeagueRows(null)
    const clans = [A, B].map((clanId) => ({ clanId, name: `Clan ${clanId}`, tag: `C${clanId}`, imageUrl: null }))
    const { standings } = leagueTableBetween(rows, clans, null, null, 1)
    const byClan = new Map(standings.map((entry) => [entry.clanId, entry]))
    expect(byClan.get(A)).toMatchObject({ matches: 4, wins: 1, avgPlacementPoints: (0 + 10 + 1 + 0) / 4 })
    expect(byClan.get(B)).toMatchObject({ matches: 3, wins: 1, avgPlacementPoints: (10 + 5 + 0) / 3 })
  })
})

describe('Page Cartes — Top 1, Top 10 et place moyenne par clan', () => {
  it('le clan A : sa victoire dans la partie créée par B, ses places dans les parties qu’il a créées', async () => {
    const payload = await loadClanMapStats({ clanId: A, period: 'all', matchType: 'official' })
    expect(payload?.maps).toHaveLength(1)
    expect(payload!.maps[0]).toMatchObject({ mapName: 'Baltic_Main', matches: 4, wins: 1, top10Rate: 0.5, avgPlacement: 9 })
  })

  it('le clan B : la victoire dans la partie créée par A, pas la place de la ligne', async () => {
    const payload = await loadClanMapStats({ clanId: B, period: 'all', matchType: 'official' })
    expect(payload!.maps[0]).toMatchObject({ matches: 3, wins: 1, top10Rate: 1, avgPlacement: 13 / 3 })
  })

  it('la moyenne des clans suivis compte une ligne par clan et par partie, chacune avec sa place', async () => {
    await loadClanMapStats({ clanId: A, period: 'all', matchType: 'official' })
    const leagueCall = mocks.queryRaw.mock.calls.findIndex(([query]) => (query as Prisma.Sql).sql.includes('AVG(t.placement <= 10)'))
    const [average] = await mocks.queryRaw.mock.results[leagueCall].value
    // Lignes : A 12, 1, 8, 15 ; B 1, 3, 9.
    expect(average).toMatchObject({ mapName: 'Baltic_Main', top10Rate: 5 / 7, avgPlacement: 7 })
  })
})
