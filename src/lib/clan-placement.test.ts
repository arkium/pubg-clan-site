import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { clanPlacementOf, clanPlacementTeam, countsForClanPlacement, type ClanPlacementMember } from './clan-placement'
import { CLAN_PLACEMENT_SQL, clanPlacementSubquery } from './clan-placement-sql'
import { createSquadLobbyDb, type LobbyMember, type LobbySquadMember } from './test-stubs/sqlite-lobby'

/**
 * Place d'un clan dans une partie partagée (docs/TODO/place-partie-partagee.md) : la même règle en mémoire
 * (`clanPlacementOf`) et en SQL (`CLAN_PLACEMENT_SQL`, exécuté pour de vrai sur une base SQLite en mémoire).
 */

const A = 1
const B = 2

// Clan A : 11 et 12 actifs, 13 suivi arrêté, 14 demande en attente ; clan B : 21 et 22.
const MEMBERS: LobbyMember[] = [
  { id: 11, clanId: A },
  { id: 12, clanId: A },
  { id: 13, clanId: A, isActive: false },
  { id: 14, clanId: A, isActive: false, joinStatus: 'pending' },
  { id: 21, clanId: B },
  { id: 22, clanId: B },
]

// `placement` de la ligne : la place du clan qui l'a créée (A), jamais celle des autres.
const MATCHES = [
  { id: 'shared', placement: 5, createdAt: '2026-10-20T20:00:00.000Z' },
  { id: 'aOnly', placement: 3, createdAt: '2026-10-20T21:00:00.000Z' },
  { id: 'unranked', placement: 7, createdAt: '2026-10-20T22:00:00.000Z' },
  { id: 'twoTeams', placement: 9, createdAt: '2026-10-20T23:00:00.000Z' },
]

const SQUAD_MEMBERS: LobbySquadMember[] = [
  // Partie créée par A (5e) et gagnée par B.
  { squadMatchId: 'shared', memberId: 11, placement: 5 },
  { squadMatchId: 'shared', memberId: 12, placement: 5 },
  { squadMatchId: 'shared', memberId: 21, placement: 1 },
  { squadMatchId: 'shared', memberId: 22, placement: 1 },
  // Un seul clan.
  { squadMatchId: 'aOnly', memberId: 11, placement: 3 },
  { squadMatchId: 'aOnly', memberId: 12, placement: 3 },
  // Place 0 ignorée ; les membres non actifs ne portent pas la place du clan.
  { squadMatchId: 'unranked', memberId: 11, placement: 0 },
  { squadMatchId: 'unranked', memberId: 12, placement: 7 },
  { squadMatchId: 'unranked', memberId: 13, placement: 2 },
  { squadMatchId: 'unranked', memberId: 14, placement: 1 },
  // Deux équipes du clan A dans la même partie : la meilleure place.
  { squadMatchId: 'twoTeams', memberId: 11, placement: 9 },
  { squadMatchId: 'twoTeams', memberId: 12, placement: 4 },
]

const memberById = new Map(MEMBERS.map((member) => [member.id, member]))

/** La partie telle que Prisma la rend avec `member: { select: CLAN_PLACEMENT_MEMBER_SELECT }`. */
function inMemoryMatch(matchId: string): { members: ClanPlacementMember[] } {
  return {
    members: SQUAD_MEMBERS.filter((entry) => entry.squadMatchId === matchId).map((entry) => {
      const member = memberById.get(entry.memberId)!
      return {
        placement: entry.placement,
        member: { clanId: member.clanId, isActive: member.isActive ?? true, joinStatus: member.joinStatus ?? 'active' },
      }
    }),
  }
}

const EXPECTED: Array<[match: string, clanId: number, placement: number | null]> = [
  ['shared', A, 5],
  ['shared', B, 1],
  ['aOnly', A, 3],
  ['aOnly', B, null],
  ['unranked', A, 7],
  ['twoTeams', A, 4],
]

describe('clanPlacementOf — en mémoire', () => {
  it.each(EXPECTED)('%s, clan %i : place %s', (matchId, clanId, placement) => {
    expect(clanPlacementOf(inMemoryMatch(matchId), clanId)).toBe(placement)
  })

  it('le clan B gagne une partie créée par le clan A, dont la ligne dit 5e', () => {
    expect(MATCHES.find((match) => match.id === 'shared')!.placement).toBe(5)
    expect(clanPlacementOf(inMemoryMatch('shared'), B)).toBe(1)
  })

  it('aucun membre classé : null, jamais 0', () => {
    expect(clanPlacementOf({ members: [{ placement: 0, member: { clanId: A, isActive: true, joinStatus: 'active' } }] }, A)).toBeNull()
    expect(clanPlacementOf({ members: [] }, A)).toBeNull()
  })

  it('`isActive` lu en 0 / 1 depuis le SQL brut', () => {
    expect(countsForClanPlacement({ clanId: A, isActive: 1, joinStatus: 'active' }, A)).toBe(true)
    expect(countsForClanPlacement({ clanId: A, isActive: 0, joinStatus: 'active' }, A)).toBe(false)
    expect(countsForClanPlacement({ clanId: B, isActive: true, joinStatus: 'active' }, A)).toBe(false)
    expect(countsForClanPlacement({ clanId: A, isActive: true, joinStatus: 'tracked' }, A)).toBe(false)
  })

  it('clanPlacementTeam : l’équipe du clan qui a obtenu sa place', () => {
    const active = { clanId: A, isActive: true, joinStatus: 'active' }
    const twoTeams = [
      { memberId: 11, placement: 9, member: active },
      { memberId: 12, placement: 4, member: active },
      { memberId: 13, placement: 4, member: { ...active, isActive: false } },
    ]
    expect(clanPlacementTeam(twoTeams, A).map((entry) => entry.memberId)).toEqual([12])
    expect(clanPlacementTeam(inMemoryMatch('aOnly').members, B)).toEqual([])
  })
})

describe('CLAN_PLACEMENT_SQL — exécuté sur SQLite', () => {
  const db = createSquadLobbyDb({ members: MEMBERS, matches: MATCHES, squadMembers: SQUAD_MEMBERS })
  afterAll(() => db.close())

  it('une ligne par clan et par partie, la place de ses membres actifs', async () => {
    const rows = await db.queryRaw(Prisma.sql`
      SELECT cm.clanId AS clanId, sm.id AS matchId, ${CLAN_PLACEMENT_SQL} AS placement
        FROM SquadMember sq
        INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
        INNER JOIN ClanMember cm ON cm.id = sq.memberId
       GROUP BY cm.clanId, sm.id
    `)
    const placementOf = new Map(rows.map((row) => [`${row.matchId}:${row.clanId}`, row.placement]))
    for (const [matchId, clanId, placement] of EXPECTED.filter(([, , expected]) => expected !== null)) {
      expect(placementOf.get(`${matchId}:${clanId}`), `${matchId}, clan ${clanId}`).toBe(placement)
    }
    expect(placementOf.has('aOnly:2')).toBe(false)
  })

  it('les agrégats ignorent une partie sans membre classé', async () => {
    const [row] = await db.queryRaw(Prisma.sql`
      SELECT COUNT(*) AS matches, SUM(t.placement = 1) AS wins, AVG(t.placement) AS avgPlacement
        FROM (
          SELECT sm.id, ${CLAN_PLACEMENT_SQL} AS placement
            FROM SquadMember sq
            INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
            INNER JOIN ClanMember cm ON cm.id = sq.memberId
           WHERE cm.clanId = ${B}
           GROUP BY sm.id
        ) t
    `)
    expect(row).toEqual({ matches: 1, wins: 1, avgPlacement: 1 })
  })

  it('clanPlacementSubquery : une ligne par partie, la place du clan demandé', async () => {
    const rows = await db.queryRaw(Prisma.sql`
      SELECT sm.id AS matchId, ${clanPlacementSubquery(A)} AS a, ${clanPlacementSubquery(B)} AS b FROM SquadMatch sm ORDER BY sm.createdAt
    `)
    expect(rows).toEqual([
      { matchId: 'shared', a: 5, b: 1 },
      { matchId: 'aOnly', a: 3, b: null },
      { matchId: 'unranked', a: 7, b: null },
      { matchId: 'twoTeams', a: 4, b: null },
    ])
  })
})
