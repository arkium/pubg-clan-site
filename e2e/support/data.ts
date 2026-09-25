import type { ClanLeaderboardEntry, ClansLeaderboardResponse } from '@/app/api/clans-leaderboard/route'
import type { ClanOverview } from '@/hooks/useClanOverview'
import type { ItemUseStats } from '@/lib/item-use-stats'
import type { CachedClanMatchesPayload } from '@/lib/matches-cache-service'
import type { DashboardResponse } from '@/types/dashboard'
import type { LeaderboardPeriod, LeaderboardResponse, PlayerStatsEntry } from '@/types/leaderboard'

/**
 * Données fictives des tests de rendu : noms inventés, dates figées, aucun lien avec la production.
 * Assez de lignes pour que les pages défilent et que le bandeau se docke.
 */

export const CLAN_ID = 1
export const MEMBER_ID = 1
const FIXED_DATE = '2026-09-21T20:00:00.000Z'

const CALLSIGNS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
]

export const PLAYERS = CALLSIGNS.map((callsign, index) => ({ memberId: index + 1, displayName: `Joueur ${callsign}` }))

export function clanList() {
  return [
    { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO', platformShard: 'steam', membersCount: PLAYERS.length, matchesCount: 120 },
    { id: 2, name: 'Clan Témoin', tag: 'TEMO', platformShard: 'steam', membersCount: 12, matchesCount: 64 },
  ]
}

/** Valeurs qui dépendent de la période, pour vérifier qu'un changement de période recharge bien. */
const PERIOD_FACTOR: Record<LeaderboardPeriod, number> = { week: 1, month: 4, all: 20 }

function playerStats(period: LeaderboardPeriod, index: number): PlayerStatsEntry {
  const factor = PERIOD_FACTOR[period]
  const player = PLAYERS[index]
  const matchesPlayed = (30 - index) * factor
  const matchesWon = Math.max(0, Math.round(matchesPlayed * 0.1))
  const totalKills = (60 - index * 2) * factor
  return {
    id: `stats-${period}-${player.memberId}`,
    memberId: player.memberId,
    displayName: player.displayName,
    avatarUrl: null,
    period: period === 'all' ? 'all-time' : `${period}-2026-39`,
    periodType: period,
    totalKills,
    totalDamage: totalKills * 120,
    totalAssists: 10 * factor,
    totalRevives: 5 * factor,
    matchesPlayed,
    matchesWon,
    winRate: matchesPlayed > 0 ? matchesWon / matchesPlayed : 0,
    avgKillsPerGame: matchesPlayed > 0 ? totalKills / matchesPlayed : 0,
    avgDamagePerGame: matchesPlayed > 0 ? (totalKills * 120) / matchesPlayed : 0,
    soloKills: 0,
    duoClanKills: Math.round(totalKills * 0.2),
    trioClanKills: Math.round(totalKills * 0.3),
    squadClanKills: Math.round(totalKills * 0.5),
    timePlayedSeconds: matchesPlayed * 1500,
    activeDays: Math.min(7 * factor, 30),
    badgeType: null,
  }
}

export function leaderboardResponse(period: LeaderboardPeriod): LeaderboardResponse {
  const leaderboard = PLAYERS.map((_, index) => playerStats(period, index))
  return {
    clanId: CLAN_ID,
    period,
    sortBy: 'kills',
    matchType: 'official',
    mode: 'all',
    lastUpdatedAt: FIXED_DATE,
    leaderboard,
    highlights: { topKiller: leaderboard[0], topDamage: leaderboard[0], bestWinRate: leaderboard[1], mvp: leaderboard[0] },
    progression: [],
  }
}

export function clansLeaderboardResponse(period: LeaderboardPeriod): ClansLeaderboardResponse {
  const factor = PERIOD_FACTOR[period]
  const leaderboard: ClanLeaderboardEntry[] = CALLSIGNS.slice(0, 16).map((callsign, index) => ({
    clanId: index + 1,
    name: `Clan ${callsign}`,
    tag: callsign.slice(0, 4).toUpperCase(),
    activeMembers: 20 - index,
    matches: (40 - index) * factor,
    winRate: 0.2 - index * 0.01,
    avgDamage: 400 - index * 10,
    avgKills: 3 - index * 0.1,
    avgKnocks: 3.5 - index * 0.1,
    powerScore: 1000 - index * 40,
    rank: index + 1,
  }))
  return { period, leaderboard }
}

export function itemUseStats(period: LeaderboardPeriod, withMembers: boolean): ItemUseStats {
  const factor = PERIOD_FACTOR[period]
  const items = [
    { itemId: 'Item_Heal_FirstAid_C', subCategory: 'Heal', count: 40 * factor, share: 40 },
    { itemId: 'Item_Boost_EnergyDrink_C', subCategory: 'Boost', count: 30 * factor, share: 30 },
    { itemId: 'Item_Boost_PainKiller_C', subCategory: 'Boost', count: 20 * factor, share: 20 },
    { itemId: 'Item_JerryCan_C', subCategory: 'Fuel', count: 10 * factor, share: 10 },
  ]
  return {
    period,
    totalCount: 100 * factor,
    matchCount: 25 * factor,
    families: [
      { subCategory: 'Boost', count: 50 * factor, share: 50 },
      { subCategory: 'Heal', count: 40 * factor, share: 40 },
      { subCategory: 'Fuel', count: 10 * factor, share: 10 },
    ],
    items,
    members: withMembers
      ? PLAYERS.map((player, index) => ({
          memberId: player.memberId,
          displayName: player.displayName,
          count: (30 - index) * factor,
          perMatch: 4 - index * 0.1,
        }))
      : [],
    dataStart: '2026-09-17T00:00:00.000Z',
  }
}

export function memberDashboard(): DashboardResponse {
  return {
    member: {
      id: MEMBER_ID,
      displayName: PLAYERS[0].displayName,
      pubgPlayerName: PLAYERS[0].displayName,
      platformShard: 'steam',
      createdAt: FIXED_DATE,
      clanId: CLAN_ID,
    },
    stats: null,
    clanAverage: null,
    progression: [],
    topPerformances: [],
    squads: [],
    dropPressure: {
      dropCount: 0,
      matchCount: 0,
      averageNearbyPlayers250m: 0,
      averageNearbyOpponents250m: null,
      maximumNearbyPlayers250m: 0,
      hotDropCount: 0,
      hotDropShare: 0,
      levelCounts: { calm: 0, contested: 0, hot: 0, veryHot: 0 },
    },
    dropPressureRanking: [],
    dropPressureTimeline: [],
    mapLabels: {},
    period: 'week',
  }
}

export function clanOverview(): ClanOverview {
  const performer = { memberId: 1, displayName: PLAYERS[0].displayName, value: 60, matchesPlayed: 30 }
  return {
    clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO', pubgClanId: null, platformShard: 'steam', imageUrl: null },
    clanStats: {
      syncedAt: FIXED_DATE,
      pubg: null,
      tracked: {
        membersCount: PLAYERS.length,
        aggregated: {
          totalKills: 480,
          totalDamage: 61000,
          totalAssists: 150,
          totalRevives: 80,
          matchesPlayed: 120,
          matchesWon: 12,
          winRate: 0.1,
        },
        topPerformers: {
          kills: performer,
          damage: performer,
          winRate: performer,
          assists: performer,
          revives: performer,
          survival: performer,
        },
      },
    },
    roster: PLAYERS.map((player) => ({
      id: player.memberId,
      displayName: player.displayName,
      pubgPlayerName: player.displayName,
      pubgAccountId: null,
      role: 'Member',
      joinedAt: FIXED_DATE,
      hasAccount: false,
      avatarUrl: null,
      lastRefreshedAt: null,
      medalCounts: { gold: 0, silver: 0, bronze: 0 },
    })),
  }
}

export function clanMatchesStats(period: LeaderboardPeriod) {
  const factor = PERIOD_FACTOR[period]
  const rosterStats = PLAYERS.map((player, index) => ({
    memberId: player.memberId,
    displayName: player.displayName,
    matchesPlayed: (30 - index) * factor,
    totalKills: (60 - index * 2) * factor,
    totalAssists: 10 * factor,
    totalDamage: (60 - index * 2) * 120 * factor,
    wins: 3 * factor,
  }))
  const modeBlock = {
    synergies: { topPairs: [], topSquads: [] },
    topPerformers: { kills: [], damage: [], survival: [], winRate: [], assists: [], revives: [] },
    rosterStats: rosterStats.map((row) => ({
      ...row,
      totalRevives: 5 * factor,
      averagePlacement: 8,
      winRate: row.matchesPlayed > 0 ? row.wins / row.matchesPlayed : 0,
    })),
  }
  const payload: CachedClanMatchesPayload = {
    globalStats: { totalKills: 480 * factor, totalDamage: 61000 * factor, winRate: 0.1, matchCount: 120 * factor, wins: 12 * factor, totalAssists: 150 * factor },
    modePerformance: [
      { mode: 'squad', matches: 80 * factor, kills: 300 * factor, wins: 8 * factor, losses: 72 * factor, damage: 40000 * factor, assists: 100 * factor, durationSeconds: 100000 * factor },
      { mode: 'duo', matches: 40 * factor, kills: 180 * factor, wins: 4 * factor, losses: 36 * factor, damage: 21000 * factor, assists: 50 * factor, durationSeconds: 50000 * factor },
    ],
    rosterStats,
    byMode: { all: modeBlock, duo: modeBlock, trio: modeBlock, squad: modeBlock },
  }
  return { period, periodKey: period === 'all' ? 'all-time' : `${period}-2026-39`, payload, computedAt: FIXED_DATE }
}

export function clanWeapons(period: LeaderboardPeriod) {
  const weapons = [
    ['WeapHK416_C', 'M416', 'AR', "Fusils d'assaut"],
    ['WeapBerylM762_C', 'Beryl M762', 'AR', "Fusils d'assaut"],
    ['WeapMini14_C', 'Mini 14', 'DMR', 'Fusils de précision'],
    ['WeapKar98k_C', 'Kar98k', 'SR', 'Snipers'],
    ['WeapUMP_C', 'UMP45', 'SMG', 'Pistolets-mitrailleurs'],
  ] as const
  const rows = PLAYERS.flatMap((player, index) =>
    weapons.map(([weaponName, weaponLabel, code, label], weaponIndex) => ({
      memberId: player.memberId,
      displayName: player.displayName,
      pubgPlayerName: player.displayName,
      weaponName,
      weaponLabel,
      weaponCategoryCode: code,
      weaponCategoryLabel: label,
      kills: (20 - weaponIndex * 3 + (index % 5)) * PERIOD_FACTOR[period],
      headshots: 4,
      shotsFired: 400,
      hitsLanded: 120,
      accuracy: 30,
      avgDistance: 45.5,
      maxDistance: 210,
      totalDamage: 2400,
      matchCount: 10,
    }))
  )
  return {
    ok: true,
    clanId: CLAN_ID,
    period,
    periodKey: period === 'all' ? 'all-time' : `${period}-2026-39`,
    count: rows.length,
    matchCount: 40,
    categoryLabels: {},
    rows,
    note: null,
  }
}

export function memberWeapons(period: LeaderboardPeriod) {
  const rows = ['WeapHK416_C', 'WeapBerylM762_C', 'WeapMini14_C', 'WeapKar98k_C', 'WeapUMP_C', 'WeapSCAR-L_C'].map(
    (weaponName, index) => ({
      weaponName,
      kills: 30 - index * 4,
      headshots: 6,
      shotsFired: 500,
      hitsLanded: 150,
      accuracy: 30,
      avgDistance: 40,
      maxDistance: 180,
      matchCount: 12,
    })
  )
  return {
    ok: true,
    meta: { period, periodKey: period === 'all' ? 'all-time' : `${period}-2026-39`, count: rows.length },
    data: { member: { id: MEMBER_ID, displayName: PLAYERS[0].displayName, clanId: CLAN_ID }, rows, note: null },
  }
}

export function memberWeaponMastery() {
  const weapons = ['WeapHK416_C', 'WeapBerylM762_C', 'WeapMini14_C', 'WeapKar98k_C', 'WeapUMP_C', 'WeapAKM_C', 'WeapSCAR-L_C', 'WeapM16A4_C', 'WeapSKS_C', 'WeapAWM_C', 'WeapVector_C', 'WeapUZI_C']
  return {
    memberId: MEMBER_ID,
    weapons: weapons.map((weaponId, index) => ({
      id: index + 1,
      memberId: MEMBER_ID,
      weaponId,
      weaponName: weaponId,
      kills: 400 - index * 20,
      headshots: 80,
      knockouts: 300,
      shots: 20000,
      hits: 6000,
      damage: 50000,
      longestKillDistance: 350,
      level: 40 - index,
      xpTotal: 100000,
      tier: 3,
      lastRefreshedAt: FIXED_DATE,
    })),
  }
}
