import type { ApiMock } from './api'
import { mockCareerApis, mockMemberCalendar } from './career'
import { CLAN_ID, MEMBER_ID, PLAYERS, itemUseStats, leaderboardResponse, memberWeapons } from './data'

import type { RosterMember } from '@/lib/member-roster'
import { activityBuckets } from '@/lib/player-dashboard'
import type { StandardPeriod } from '@/lib/period'
import type { DashboardMatch, MatchesResponse, PlayerDashboardResponse } from '@/types/dashboard'

/**
 * Membres du clan et tableau de bord d'un joueur (e2e/members.spec.ts). Noms inventés ; les dates sont relatives à
 * l'heure du test (« a joué ce soir », réserve à 30 jours), sans lien avec la production.
 */

const periodOf = (url: URL): StandardPeriod => {
  const value = url.searchParams.get('period')
  return value === 'month' || value === 'all' ? value : 'week'
}

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
/** Une seconde plus tôt : toujours la soirée en cours, quelle que soit l'heure du test. */
const JUST_NOW = () => ago(1 / 3600)

type Row = [name: string, role: 'fragger' | 'medic' | 'ghost' | null, lastMatchHoursAgo: number | null, matches: number, kills: number, wins: number, weapon: string | null, medals: [number, number, number]]

/** 9 actifs (2 ont joué ce soir), 3 en réserve (plus de 30 jours ou jamais). */
const ROSTER: Row[] = [
  ['Joueur Alpha', 'fragger', 0, 64, 182, 12, 'Item_Weapon_BerylM762_C', [6, 3, 2]],
  ['Joueur Bravo', 'ghost', 0, 58, 122, 12, 'Item_Weapon_HK416_C', [4, 5, 1]],
  ['Joueur Charlie', 'medic', 26, 51, 72, 6, 'Item_Weapon_UMP_C', [2, 2, 4]],
  ['Joueur Delta', 'fragger', 50, 47, 111, 7, 'Item_Weapon_Mini14_C', [3, 1, 3]],
  ['Joueur Echo', 'medic', 74, 42, 50, 4, 'Item_Weapon_SCAR-L_C', [1, 3, 2]],
  ['Joueur Foxtrot', 'ghost', 98, 30, 50, 5, 'Item_Weapon_Kar98k_C', [1, 1, 0]],
  ['Joueur Golf', 'ghost', 170, 21, 40, 4, 'Item_Weapon_M24_C', [0, 1, 2]],
  ['Joueur Hotel', 'fragger', 290, 12, 16, 1, null, [0, 0, 1]],
  ['Joueur India', null, 500, 8, 8, 0, null, [0, 0, 0]],
  ['Joueur Juliett', 'medic', 24 * 40, 0, 0, 0, null, [0, 0, 0]],
  ['Joueur Kilo', 'fragger', 24 * 60, 0, 0, 0, null, [0, 1, 0]],
  ['Joueur Lima', null, null, 0, 0, 0, null, [0, 0, 0]],
]

export function memberCards(): RosterMember[] {
  return ROSTER.map(([displayName, role, hours, matches, kills, wins, weapon, [gold, silver, bronze]], index) => ({
    memberId: index + 1,
    displayName,
    pubgPlayerName: displayName.replace('Joueur ', '') + '_FR',
    avatarUrl: null,
    lastMatchAt: hours === null ? null : hours === 0 ? JUST_NOW() : ago(hours),
    role: role ? { id: role, score: 80 - index * 3 } : null,
    recent: { matches, kills, wins },
    favoriteWeapon: weapon ? { id: weapon, label: weapon.replace('Item_Weapon_', '').replace('_C', '') } : null,
    medals: { gold, silver, bronze },
  }))
}

export function mockClanMembers(api: ApiMock, options: { pendingCount?: number | null } = {}) {
  api.on('GET', `/api/clans/${CLAN_ID}/members/cards`, () => ({
    body: { clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' }, members: memberCards(), pendingCount: options.pendingCount ?? null },
  }))
}

// ── Tableau de bord ───────────────────────────────────────────────────────────────────────────────

const FACTOR: Record<StandardPeriod, number> = { week: 1, month: 4, all: 20 }

export function playerDashboard(period: StandardPeriod): PlayerDashboardResponse {
  const factor = FACTOR[period]
  const now = new Date()
  const matches = Array.from({ length: 6 }, (_, index) => ({
    createdAt: new Date(now.getTime() - index * 26 * 3_600_000).toISOString(),
    kills: 2 + index,
    damage: 200 + index * 50,
    placement: index === 0 ? 1 : 8,
  }))
  return {
    period,
    member: {
      id: MEMBER_ID,
      displayName: PLAYERS[0].displayName,
      pubgPlayerName: 'Alpha_FR',
      avatarUrl: null,
      createdAt: '2025-03-02T10:00:00.000Z',
      lastMatchAt: JUST_NOW(),
      clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' },
    },
    stats: {
      totalKills: 64 * factor,
      totalDamage: 9420 * factor,
      totalAssists: 6 * factor,
      totalRevives: 11 * factor,
      matchesPlayed: 22 * factor,
      matchesWon: 4 * factor,
      winRate: 4 / 22,
    },
    clanAverage: { avgKills: 54.2 * factor, avgDamage: 8486 * factor, avgWinRate: 0.12, avgMatches: 20 * factor, avgAssists: 5, avgRevives: 8 },
    activity: activityBuckets(matches, period, now),
    bestMatch: {
      mapName: 'Baltic_Main',
      mapLabel: 'Erangel',
      gameMode: 'squad-fpp',
      kills: 12,
      damage: 1840,
      placement: 1,
      createdAt: '2026-09-21T20:00:00.000Z',
      timeSurvived: 1860,
      teammates: ['Joueur Bravo', 'Joueur Charlie', 'Joueur Delta'],
      debriefHref: `/clans/${CLAN_ID}/telemetry/matches/sm-best/debrief?period=${period}`,
    },
    playstyle: {
      current: { aggression: 82, support: 40, zoneDiscipline: 66, safeZonePercent: 86, healCoveragePercent: 71, firstContactPhase: 2.1, matchesPlayed: 22 },
      previous: period === 'all' ? null : { aggression: 76, support: 43, zoneDiscipline: 64 },
      clan: { aggression: 58, support: 34, zoneDiscipline: 71 },
    },
    mates: [
      { memberId: 2, displayName: 'Joueur Bravo', avatarUrl: null, matchCount: 14, winRate: 0.286, sharedPlayTimeSeconds: 5 * 3600, role: 'ghost' },
      { memberId: 3, displayName: 'Joueur Charlie', avatarUrl: null, matchCount: 9, winRate: 0.222, sharedPlayTimeSeconds: 3 * 3600, role: 'medic' },
      { memberId: 4, displayName: 'Joueur Delta', avatarUrl: null, matchCount: 7, winRate: 0.143, sharedPlayTimeSeconds: 1800, role: 'fragger' },
    ],
  }
}

function recentMatches(): MatchesResponse {
  const rows: Array<[string, number, number, number]> = [
    ['Baltic_Main', 1, 12, 1840],
    ['Desert_Main', 4, 5, 712],
    ['Tiger_Main', 17, 2, 288],
    ['Savage_Main', 2, 7, 1104],
    ['Baltic_Main', 38, 0, 64],
  ]
  const matches: DashboardMatch[] = rows.map(([mapName, placement, kills, damageDealt], index) => ({
    id: `m-${index}`,
    pubgMatchId: `pm-${index}`,
    clanMode: 'squad',
    mapName,
    gameMode: 'squad-fpp',
    matchType: 'official',
    duration: 1800,
    placement,
    kills,
    damageDealt,
    assists: 1,
    revives: 1,
    pubgCreatedAt: ago(index * 5 + 1),
    squad: [],
    clanId: CLAN_ID,
    squadMatchId: `sm-${index}`,
    telemetryAvailable: index !== 4,
  }))
  return { matches, totalCount: 25, mapLabels: { Baltic_Main: 'Erangel', Desert_Main: 'Miramar', Tiger_Main: 'Taego', Savage_Main: 'Sanhok' } }
}

/** Le shell lit le profil minimal du joueur consulté (nom, clan) sur toutes les pages joueur. */
export function mockMemberProfile(api: ApiMock) {
  api.on('GET', `/api/members/${MEMBER_ID}`, {
    body: { id: MEMBER_ID, displayName: PLAYERS[0].displayName, avatarUrl: null, pubgPlayerName: 'Alpha_FR', platformShard: 'steam', clanId: CLAN_ID },
  })
}

export function mockPlayerDashboard(api: ApiMock) {
  mockMemberProfile(api)
  api
    .on('GET', `/api/members/${MEMBER_ID}/dashboard`, (url) => ({ body: playerDashboard(periodOf(url)) }))
    .on('GET', `/api/members/${MEMBER_ID}/telemetry/weapons`, (url) => ({ body: memberWeapons(periodOf(url)) }))
    .on('GET', `/api/members/${MEMBER_ID}/nemesis`, {
      body: {
        data: {
          botKillCount: 23,
          topKillers: [{ name: 'xX_Kr4ken_Xx', clanTag: null, count: 4 }],
          topVictims: [{ name: 'Baguette_Sniper', clanTag: 'BGT', count: 3 }],
        },
      },
    })
    .on('GET', `/api/members/${MEMBER_ID}/city-insights`, {
      body: { insights: { favoriteCity: { locationId: 'pochinki', name: 'Pochinki', mapName: 'Baltic_Main', mapLabel: 'Erangel' } } },
    })
    .on('GET', `/api/members/${MEMBER_ID}/drop-pressure`, {
      body: { stats: { dropCount: 18, matchCount: 22, averageNearbyPlayers250m: 5.2, averageNearbyOpponents250m: 1.6, maximumNearbyPlayers250m: 12, hotDropCount: 6, hotDropShare: 33.3, levelCounts: { calm: 6, contested: 6, hot: 4, veryHot: 2 } }, ranking: [], timeline: [] },
    })
    .on('GET', `/api/members/${MEMBER_ID}/matches`, { body: recentMatches() })
    .on('GET', `/api/clans/${CLAN_ID}/leaderboard`, (url) => ({ body: leaderboardResponse(periodOf(url)) }))
    // Cartes résumé « Objets consommés » et « Cartes » (2026-10-03), même période que la page.
    .on('GET', `/api/members/${MEMBER_ID}/item-use`, (url) => ({ body: { data: itemUseStats(periodOf(url), false) } }))
    .on('GET', `/api/members/${MEMBER_ID}/map-stats`, {
      body: {
        mapStats: [
          { mapName: 'Desert_Main', mapLabel: 'Miramar', matches: 12, wins: 1, winRate: 1 / 12 },
          { mapName: 'Baltic_Main', mapLabel: 'Erangel', matches: 30, wins: 4, winRate: 4 / 30 },
          { mapName: 'Tiger_Main', mapLabel: 'Taego', matches: 0, wins: 0, winRate: 0 },
        ],
        bestCompositions: [],
      },
    })
  // Sans période : carte Carrière PUBG et calendrier des 5 dernières semaines (e2e/support/career.ts).
  mockCareerApis(api)
  mockMemberCalendar(api)
}
