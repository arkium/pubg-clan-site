import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Service du classement et du comparateur des joueurs (docs/features/joueurs.md). Prisma est simulé (aucun accès à la
 * base, CLAUDE.md piège n° 9) : les trois lectures groupées sont reconnues à leur table, les lignes portent la période
 * (`isCurrent` 1) ou la précédente (0).
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  memberFindMany: vi.fn(),
  memberCount: vi.fn(),
  clanCount: vi.fn(),
  clanFindMany: vi.fn(),
  telemetryFindMany: vi.fn(),
  weaponFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    clanMember: { findMany: mocks.memberFindMany, count: mocks.memberCount },
    clan: { count: mocks.clanCount, findMany: mocks.clanFindMany },
    memberTelemetryStats: { findMany: mocks.telemetryFindMany },
    memberWeaponStats: { findMany: mocks.weaponFindMany },
  },
}))
const WEAPON_LABELS: Record<string, string> = { WeapUMP_C: 'UMP45', WeapAK47_C: 'AKM', WeapKar98k_C: 'Kar98k', WeapHK416_C: 'M416', ProjGrenade_C: 'Frag Grenade' }
vi.mock('@/lib/weapon-label-service', () => ({ getWeaponLabels: vi.fn(async () => ({})), weaponDisplayName: (name: string) => WEAPON_LABELS[name] ?? name }))
vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: vi.fn(async () => ({ Baltic_Main: 'Erangel' })),
  mapDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? name,
}))

import { clearPlayersRankingCache, getPlayersComparison, getPlayersRanking } from './players-ranking-service'

const NOW = new Date(2026, 9, 12, 12, 0, 0)

type MatchRow = { memberId: number; isCurrent: number; matches: number; damage: number; kills: number; knocks?: number; revives?: number; assists?: number; survival?: number }

const matchRow = (row: MatchRow) => ({
  memberId: row.memberId,
  isCurrent: row.isCurrent,
  matches: BigInt(row.matches),
  wins: 0,
  damage: row.damage,
  kills: row.kills,
  knocks: row.knocks ?? row.kills,
  revives: row.revives ?? 0,
  assists: row.assists ?? 0,
  headshotKills: Math.round(row.kills / 4),
  survivalSeconds: row.survival ?? row.matches * 900,
  lastMatchAt: new Date(2026, 9, 11, 22, 30),
})

/** Période : A, B, C classés, D en qualification ; période précédente : B devant A, C absent. */
const MATCH_ROWS = [
  matchRow({ memberId: 1, isCurrent: 1, matches: 20, damage: 8000, kills: 40, revives: 4 }),
  matchRow({ memberId: 2, isCurrent: 1, matches: 12, damage: 6000, kills: 30, revives: 12 }),
  matchRow({ memberId: 3, isCurrent: 1, matches: 10, damage: 2000, kills: 8, revives: 1 }),
  matchRow({ memberId: 4, isCurrent: 1, matches: 4, damage: 2000, kills: 10 }),
  matchRow({ memberId: 1, isCurrent: 0, matches: 15, damage: 3000, kills: 15 }),
  matchRow({ memberId: 2, isCurrent: 0, matches: 15, damage: 6000, kills: 30 }),
]
const KILL_ROWS = [
  { memberId: 1, isCurrent: 1, measuredKills: BigInt(40), distanceCm: 40 * 6000 },
  { memberId: 2, isCurrent: 1, measuredKills: BigInt(30), distanceCm: 30 * 12000 },
]
const ZONE_ROWS = [
  { memberId: 1, isCurrent: 1, closures: BigInt(20), inside: 18 },
  { memberId: 2, isCurrent: 1, closures: BigInt(12), inside: 6 },
]

const IDENTITIES = [
  { id: 1, displayName: 'Kr4ken', pubgAccountId: 'account.kraken', clan: { id: 10, name: 'Clan Démo', tag: 'DEMO' } },
  { id: 2, displayName: 'Vexa', pubgAccountId: 'account.vexa', clan: { id: 10, name: 'Clan Démo', tag: 'DEMO' } },
  { id: 3, displayName: 'Nyx_FR', pubgAccountId: null, clan: { id: 20, name: 'Les-Ratz', tag: 'RATZ' } },
  { id: 4, displayName: 'Lemon', pubgAccountId: null, clan: { id: 10, name: 'Clan Démo', tag: 'DEMO' } },
]

let duelRows: unknown[] = []

function route(query: Prisma.Sql) {
  if (query.sql.includes('FROM SquadMember')) return MATCH_ROWS
  if (query.sql.includes('COUNT(ke.distance)')) return KILL_ROWS
  if (query.sql.includes('FROM ZoneClosurePosition')) return ZONE_ROWS
  if (query.sql.includes('ke.victimAccountId')) return duelRows
  throw new Error(`requête inattendue : ${query.sql}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPlayersRankingCache()
  duelRows = []
  mocks.queryRaw.mockImplementation(async (query: Prisma.Sql) => route(query))
  mocks.memberFindMany.mockImplementation(async ({ where }: { where: { id: { in: number[] } } }) => IDENTITIES.filter((member) => where.id.in.includes(member.id)))
  mocks.memberCount.mockResolvedValue(510)
  mocks.clanCount.mockResolvedValue(33)
  mocks.clanFindMany.mockResolvedValue([{ id: 10, name: 'Clan Démo', tag: 'DEMO' }])
  mocks.telemetryFindMany.mockResolvedValue([])
  mocks.weaponFindMany.mockResolvedValue([])
})

const sqlOf = (table: string) => (mocks.queryRaw.mock.calls.map(([query]) => query as Prisma.Sql).find((query) => query.sql.includes(table)) ?? null)

describe('getPlayersRanking', () => {
  it('classés à 10 parties, joueur sous le seuil en qualification, rôles sur 100 et rangs de la période précédente', async () => {
    const ranking = await getPlayersRanking('month', 'all', NOW)
    expect(ranking.ranked.map((entry) => entry.name).sort()).toEqual(['Kr4ken', 'Nyx_FR', 'Vexa'])
    expect(ranking.qualifying.map((entry) => `${entry.name}:${entry.matches}`)).toEqual(['Lemon:4'])
    expect(ranking.totals).toEqual({ players: 510, clans: 33 })
    expect(ranking.clans).toEqual([
      { clanId: 10, name: 'Clan Démo', tag: 'DEMO' },
      { clanId: 20, name: 'Les-Ratz', tag: 'RATZ' },
    ])
    const kraken = ranking.ranked.find((entry) => entry.memberId === 1)!
    expect(kraken).toMatchObject({ avgDamage: 400, avgKills: 2, avgKillDistance: 60, zoneInsideRate: 0.9, clanTag: 'DEMO' })
    // Kr4ken est 2e des trois classés aux dégâts, aux kills et aux knocks : centile 50 partout.
    expect(kraken.roles.fragger).toBe(50)
    // Mois précédent : Vexa 1re aux dégâts (400), Kr4ken 2e (200) ; Nyx_FR n'était pas classé (« nouv. »).
    expect(kraken.previousRanks?.[0]).toBe(2)
    expect(ranking.ranked.find((entry) => entry.memberId === 2)!.previousRanks?.[0]).toBe(1)
    expect(ranking.ranked.find((entry) => entry.memberId === 3)!.previousRanks).toBeNull()
    expect(ranking.qualifying[0].previousRanks).toBeNull()
    expect(ranking.lastMatchAt).toBe(new Date(2026, 9, 11, 22, 30).toISOString())
  })

  it('parties officielles de clan seulement, depuis le début de la période précédente, joueurs actifs des clans suivis', async () => {
    await getPlayersRanking('month', 'all', NOW)
    const sql = sqlOf('FROM SquadMember')!
    expect(sql.sql).toContain("sm.matchType = 'official'")
    expect(sql.sql).toContain("cm.isActive = 1 AND cm.joinStatus = 'active'")
    expect(sql.sql).toContain('c.isSystem = 0 AND c.archivedAt IS NULL')
    expect(sql.sql).toContain('GROUP BY sq.memberId, isCurrent')
    expect(sql.values).toContainEqual(new Date(2026, 8, 1))
    expect(sql.sql).not.toContain('gameMode LIKE')
  })

  it('mode Duo : filtre sur le gameMode PUBG dans les trois lectures', async () => {
    await getPlayersRanking('week', 'duo', NOW)
    for (const table of ['FROM SquadMember', 'COUNT(ke.distance)', 'FROM ZoneClosurePosition']) {
      expect(sqlOf(table)!.sql).toContain('sm.gameMode LIKE')
      expect(sqlOf(table)!.values).toContain('duo%')
    }
  })

  it('« Tous » : aucune période précédente, aucune flèche', async () => {
    const ranking = await getPlayersRanking('all', 'all', NOW)
    expect(sqlOf('FROM SquadMember')!.sql).not.toContain('isCurrent`')
    expect(sqlOf('FROM SquadMember')!.sql).not.toContain(', isCurrent')
    expect(ranking.ranked.every((entry) => entry.previousRanks === null)).toBe(true)
  })

  it('badge de chaque joueur : le plus haut de ses rôles Fragger / Medic / Ghost de la période, sans autre lecture', async () => {
    const ranking = await getPlayersRanking('month', 'all', NOW)
    const everyone = [...ranking.ranked, ...ranking.qualifying]
    const of = (memberId: number) => everyone.find((entry) => entry.memberId === memberId)!
    // Vexa : Fragger 100, Medic 67 (assistances et survie à égalité dans ces données) — Fragger.
    expect(of(2).roles).toMatchObject({ fragger: 100, medic: 67 })
    expect(of(2).style).toBe('fragger')
    // Kr4ken : 2e partout (50), mais le plus souvent dans le cercle (Ghost 100) — Ghost.
    expect([of(1).roles.ghost, of(1).style]).toEqual([100, 'ghost'])
    // Nyx_FR : dernier en Fragger (0), sans fermeture mesurée ; Medic à 33 reste son meilleur rôle.
    expect([of(3).roles.fragger, of(3).roles.ghost, of(3).style]).toEqual([0, null, 'medic'])
    expect(mocks.telemetryFindMany).not.toHaveBeenCalled()
  })

  it('cache de 5 minutes par période et mode', async () => {
    await getPlayersRanking('month', 'all', NOW)
    await getPlayersRanking('month', 'all', new Date(NOW.getTime() + 60_000))
    expect(mocks.queryRaw).toHaveBeenCalledTimes(3)
    await getPlayersRanking('month', 'squad', NOW)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(6)
    await getPlayersRanking('month', 'all', new Date(NOW.getTime() + 6 * 60_000))
    expect(mocks.queryRaw).toHaveBeenCalledTimes(9)
  })

  it('une lecture en échec ne reste pas en cache', async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getPlayersRanking('month', 'all', NOW)).rejects.toThrow('base indisponible')
    await expect(getPlayersRanking('month', 'all', NOW)).resolves.toMatchObject({ period: 'month' })
  })
})

describe('getPlayersComparison', () => {
  it('joueur et moyenne de son clan : sommes des joueurs du clan, rôles de la population, élément sous le seuil signalé', async () => {
    const comparison = await getPlayersComparison(
      [
        { kind: 'player', memberId: 4 },
        { kind: 'clan', clanId: 10 },
      ],
      'month',
      'all',
      NOW
    )
    expect(comparison.slots.map((slot) => [slot.key, slot.name, slot.qualified])).toEqual([
      ['4', 'Lemon', false],
      ['clan-10', 'Moyenne Clan Démo', true],
    ])
    const clan = comparison.slots[1]
    // Kr4ken, Vexa et Lemon : 36 parties, 16 000 dégâts.
    expect(clan).toMatchObject({ players: 3, matches: 36 })
    expect(clan.values.avgDamage).toBeCloseTo(444.44, 1)
    expect(clan.roles.fragger).not.toBeNull()
    expect(comparison.duels).toEqual([])
  })

  it('retard sur le cercle pondéré par les parties, sans les joueurs non mesurés ; trois armes les plus jouées, hors grenades', async () => {
    mocks.telemetryFindMany.mockResolvedValue([
      { memberId: 1, avgCircleDelaySeconds: 30, avgCircleDelayPercent: 10, avgBlueZoneHits: 20, matchesPlayed: 10 },
      { memberId: 2, avgCircleDelaySeconds: 0, avgCircleDelayPercent: 0, avgBlueZoneHits: 40, matchesPlayed: 10 },
    ])
    const weapon = (memberId: number, weaponName: string, matchCount: number, kills: number) => ({
      memberId,
      weaponName,
      kills,
      headshots: 0,
      shotsFired: 100,
      hitsLanded: 40,
      avgDistance: 5000,
      maxDistance: 9000,
      matchCount,
    })
    mocks.weaponFindMany.mockResolvedValue([
      weapon(1, 'ProjGrenade_C', 30, 2),
      weapon(1, 'WeapUMP_C', 12, 20),
      weapon(1, 'WeapAK47_C', 9, 15),
      weapon(1, 'WeapKar98k_C', 5, 6),
      weapon(1, 'WeapHK416_C', 2, 1),
      weapon(2, 'WeapHK416_C', 20, 30),
    ])
    const comparison = await getPlayersComparison(
      [
        { kind: 'player', memberId: 1 },
        { kind: 'clan', clanId: 10 },
      ],
      'month',
      'all',
      NOW
    )
    const [kraken, clan] = comparison.slots
    expect(kraken.values).toMatchObject({ avgCircleDelaySeconds: 30, avgBlueZoneHits: 20 })
    expect(clan.values).toMatchObject({ avgCircleDelaySeconds: 30, avgBlueZoneHits: 30 })
    expect(kraken.weapons.map((entry) => `${entry.name}:${entry.matchCount}:${entry.accuracy}`)).toEqual(['UMP45:12:40', 'AKM:9:40', 'Kar98k:5:40'])
    expect(clan.weapons[0]).toMatchObject({ name: 'M416', matchCount: 22, kills: 31 })
    expect(mocks.telemetryFindMany.mock.calls.map(([query]) => query.where.period)).toEqual(['month-2026-10'])
  })

  it('duels : éliminations dans les deux sens, retrouvées par membre ou par compte PUBG, dernière rencontre', async () => {
    duelRows = [
      { id: 'k1', killerMemberId: 1, killerAccountId: 'account.kraken', victimMemberId: 2, victimAccountId: 'account.vexa', matchDate: new Date('2026-09-20T20:00:00Z'), mapName: 'Desert_Main' },
      { id: 'k2', killerMemberId: 1, killerAccountId: 'account.kraken', victimMemberId: null, victimAccountId: 'account.vexa', matchDate: new Date('2026-10-03T20:00:00Z'), mapName: 'Baltic_Main' },
      { id: 'k3', killerMemberId: null, killerAccountId: 'account.vexa', victimMemberId: 1, victimAccountId: 'account.kraken', matchDate: new Date('2026-09-01T20:00:00Z'), mapName: 'Baltic_Main' },
      { id: 'k4', killerMemberId: 1, killerAccountId: 'account.kraken', victimMemberId: 1, victimAccountId: 'account.kraken', matchDate: new Date('2026-10-05T20:00:00Z'), mapName: 'Baltic_Main' },
    ]
    const comparison = await getPlayersComparison(
      [
        { kind: 'player', memberId: 1 },
        { kind: 'player', memberId: 2 },
        { kind: 'player', memberId: 3 },
      ],
      'month',
      'all',
      NOW
    )
    expect(comparison.duels).toEqual([
      { a: '1', b: '2', aKills: 2, bKills: 1, last: { date: '2026-10-03T20:00:00.000Z', mapName: 'Erangel', killer: '1' } },
      { a: '1', b: '3', aKills: 0, bKills: 0, last: null },
      { a: '2', b: '3', aKills: 0, bKills: 0, last: null },
    ])
    const duelSql = sqlOf('ke.victimAccountId')!
    expect(duelSql.sql).toContain('UNION ALL')
    expect(duelSql.values).toEqual(expect.arrayContaining([1, 2, 3, 'account.kraken', 'account.vexa']))
  })

  it('joueur sans partie sur la période : identité et zéros ; joueur ou clan inconnus écartés', async () => {
    mocks.memberFindMany.mockImplementation(async ({ where }: { where: { id: { in: number[] } } }) =>
      where.id.in.includes(77) ? [{ id: 77, displayName: 'Rookie', pubgAccountId: null, clan: { id: 20, name: 'Les-Ratz', tag: 'RATZ' } }] : IDENTITIES.filter((member) => where.id.in.includes(member.id))
    )
    mocks.clanFindMany.mockResolvedValue([])
    const comparison = await getPlayersComparison(
      [
        { kind: 'player', memberId: 77 },
        { kind: 'player', memberId: 99 },
        { kind: 'clan', clanId: 404 },
      ],
      'month',
      'all',
      NOW
    )
    expect(comparison.slots).toHaveLength(1)
    expect(comparison.slots[0]).toMatchObject({ name: 'Rookie', matches: 0, qualified: false })
  })
})
