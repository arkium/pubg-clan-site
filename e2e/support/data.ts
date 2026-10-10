import type { ClansLeaderboardResponse } from '@/app/api/clans-leaderboard/route'
import { DEFAULT_LEAGUE_SETTINGS, clanPowerScore, clanRawScore, type LeagueMatchType } from '@/lib/clan-league'
import type { HomeShowcasePayload } from '@/lib/home-showcase'
import type { HomeRankedTournament, HomeTournament, HomeTournamentsPayload } from '@/lib/home-tournaments'
import type { ClanMatchesResponse, SquadMatch } from '@/types/squad-matches'
import { sessionDateOf } from '@/lib/match-sessions'
import type { ClanOverview } from '@/hooks/useClanOverview'
import type { ItemUseStats } from '@/lib/item-use-stats'
import type { CachedClanMatchesPayload } from '@/lib/matches-cache-service'
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

/**
 * Ligue Inter-Clans (e2e/clans-league.spec.ts) : 16 clans classés, 2 en qualification, 2 sans partie. « Clan Démo »
 * (CLAN_ID, le clan du membre connecté des tests) est 10e, en blue zone ; rang précédent fixé pour les flèches. En
 * « Ranked » (`matchType=competitive`), 4 clans classés seulement — le rechargement par type de partie se voit.
 */
export function clansLeaderboardResponse(period: LeaderboardPeriod, matchType: LeagueMatchType = 'official'): ClansLeaderboardResponse {
  const factor = PERIOD_FACTOR[period]
  const previous = [2, 1, 5, 3, 4, 9, 6, 8, 7, 12, 10, 11, 14, 13, null, 15]
  const leagueScore = 1100
  const minMatches = DEFAULT_LEAGUE_SETTINGS.minMatches[matchType][period]
  const standings = CALLSIGNS.slice(0, matchType === 'competitive' ? 4 : 16).map((callsign, index) => {
    const mine = index === 9
    const winRate = 0.26 - index * 0.015
    const avgDamage = 420 - index * 12
    const avgKills = 3 - index * 0.1
    const avgKnocks = index === 4 ? 5.2 : 3.4 - index * 0.1
    const avgPlacementPoints = 3.2 - index * 0.12
    const matches = (40 - index) * factor
    const rawScore = clanRawScore({ avgPlacementPoints, avgDamage, avgKills, avgKnocks })
    return {
      clanId: mine ? CLAN_ID : index + 2,
      name: mine ? 'Clan Démo' : `${matchType === 'competitive' ? 'Ranked' : 'Clan'} ${callsign}`,
      tag: mine ? 'DEMO' : callsign.slice(0, 4).toUpperCase(),
      imageUrl: null,
      matches,
      wins: Math.round(matches * winRate),
      winRate,
      avgPlacementPoints,
      avgDamage,
      avgKills,
      avgKnocks,
      rawScore,
      powerScore: clanPowerScore({ matches, rawScore, leagueScore }),
      rank: index + 1,
      previousRank: period === 'all' ? null : previous[index],
      activeMembers: 20 - index,
    }
  })
  return {
    period,
    matchType,
    generatedAt: FIXED_DATE,
    lastMatchAt: FIXED_DATE,
    standings,
    qualifying: [
      { clanId: 42, name: 'Clan Novice', tag: 'NOV', imageUrl: null, matches: minMatches - 2, required: minMatches },
      { clanId: 43, name: 'Clan Recrue', tag: 'REC', imageUrl: null, matches: 1, required: minMatches },
    ],
    scoring: {
      minMatches,
      settings: DEFAULT_LEAGUE_SETTINGS,
      league: { matches: 400, avgPlacementPoints: 2.1, avgDamage: 480, avgKills: 3.4, avgKnocks: 3, rawScore: leagueScore },
    },
    withoutMatch: [
      { clanId: 40, name: 'Clan Endormi', tag: 'ZZZ', imageUrl: null },
      { clanId: 41, name: 'Clan Fantôme', tag: 'GHO', imageUrl: null },
    ],
    feed: [
      { date: '2026-09-21', kind: 'first', clan: 'Clan Alpha', text: 'a sorti Clan Bravo de la 1re place', weight: 100 },
      { date: '2026-09-21', kind: 'zone-in', clan: 'Clan Foxtrot', text: 'entre dans la zone (6e)', weight: 63 },
      { date: '2026-09-20', kind: 'climb', clan: 'Clan Charlie', text: 'remonte de 2 places (3e)', weight: 42 },
      { date: '2026-09-19', kind: 'zone-out', clan: 'Clan India', text: 'tombe en blue zone', weight: 55 },
      { date: '2026-09-18', kind: 'overtake', clan: 'Clan Delta', text: 'passe devant Clan Echo', weight: 26 },
    ],
    titles: {
      damage: { clanId: 2, name: 'Clan Alpha', value: 420 },
      knocks: { clanId: 6, name: 'Clan Echo', value: 5.2 },
      climb: period === 'all' ? null : { clanId: 7, name: 'Clan Foxtrot', places: 3 },
    },
  }
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
    // Paires et escouade d'au moins 5 parties : duo de la période et barres de synergies.
    synergies: {
      topPairs: [
        { memberIds: [1, 2], memberNames: [PLAYERS[0].displayName, PLAYERS[1].displayName], matchesPlayed: 14 * factor, totalKills: 41, totalDamage: 5200, totalDurationSeconds: 20000, winRate: 0.286 },
        { memberIds: [1, 3], memberNames: [PLAYERS[0].displayName, PLAYERS[2].displayName], matchesPlayed: 20 * factor, totalKills: 50, totalDamage: 6100, totalDurationSeconds: 30000, winRate: 0.2 },
        { memberIds: [2, 3], memberNames: [PLAYERS[1].displayName, PLAYERS[2].displayName], matchesPlayed: 3, totalKills: 6, totalDamage: 800, totalDurationSeconds: 4000, winRate: 0.667 },
      ],
      topSquads: [
        { memberIds: [1, 2, 3, 4], memberNames: PLAYERS.slice(0, 4).map((p) => p.displayName), matchesPlayed: 8 * factor, totalKills: 60, totalDamage: 9000, totalDurationSeconds: 12000, winRate: 0.143 },
      ],
    },
    topPerformers: { kills: [{ memberId: 1, displayName: PLAYERS[0].displayName, totalKills: 60, matchesPlayed: 30 }], damage: [], survival: [], winRate: [], assists: [], revives: [] },
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
  // Codes et clés de src/lib/weapons/weapon-categories.ts, comme la route (docs/features/weapons.md §7).
  const weapons = [
    ['WeapHK416_C', 'M416', 'm416', 'AR', "Fusils d'assaut"],
    ['WeapBerylM762_C', 'Beryl M762', 'beryl m762', 'AR', "Fusils d'assaut"],
    ['WeapMini14_C', 'Mini 14', 'mini14', 'DMR', 'Fusils de précision'],
    ['WeapKar98k_C', 'Kar98k', 'kar98k', 'SR', 'Snipers'],
    ['WeapUMP_C', 'UMP45', 'ump9', 'SMG', 'Pistolets-mitrailleurs'],
    ['WeapG18_C', 'P18C', 'p18c', 'PISTOL', 'Pistolets'],
    ['ProjGrenade_C', 'Grenade', 'frag grenade', 'THROWABLE', 'Explosifs'],
  ] as const
  const rows = PLAYERS.flatMap((player, index) =>
    weapons.map(([weaponName, weaponLabel, weaponKey, code, label], weaponIndex) => ({
      memberId: player.memberId,
      displayName: player.displayName,
      pubgPlayerName: player.displayName,
      weaponName,
      weaponLabel,
      weaponKey,
      weaponCategoryCode: code,
      weaponCategoryLabel: label,
      kills: (20 - weaponIndex * 3 + (index % 5)) * PERIOD_FACTOR[period],
      headshots: 4,
      // Une grenade ne compte pas de tirs : précision absente (« – »).
      shotsFired: code === 'THROWABLE' ? 0 : 400,
      hitsLanded: code === 'THROWABLE' ? 0 : 120,
      accuracy: code === 'THROWABLE' ? 0 : 30,
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
      weaponLabel: weaponName.replace('Weap', '').replace('_C', ''),
    })
  )
  return {
    ok: true,
    meta: { period, periodKey: period === 'all' ? 'all-time' : `${period}-2026-39`, count: rows.length },
    data: { member: { id: MEMBER_ID, displayName: PLAYERS[0].displayName, clanId: CLAN_ID }, rows, note: null },
  }
}

/** Vitrine de l'accueil (`GET /api/home/showcase`) : trois Top 1 fictifs, un kill feed de sept lignes. */
export function homeShowcase(): HomeShowcasePayload {
  const squad = (names: string[]) =>
    names.map((name, index) => ({
      memberId: index + 1,
      name: `Joueur ${name}`,
      kills: 6 - index * 2,
      damage: 800 - index * 200,
      revives: index,
      weapons: index < 3 ? ['Kar98k', 'Beryl M762'].slice(0, 2 - (index % 2)) : [],
      mvp: index === 0,
    }))
  const dinner = (id: string, mapName: string, mapLabel: string, clanTag: string, names: string[]) => ({
    squadMatchId: id,
    clanId: CLAN_ID,
    clanName: `Clan ${clanTag}`,
    clanTag,
    mapName,
    mapLabel,
    mapImage: `/maps/pubg/${mapName}.webp`,
    playedAt: FIXED_DATE,
    durationSeconds: 1902,
    // Troisième partie sans télémétrie : « #1 » seul.
    teamCount: id === 'match-3' ? null : 26,
    teamMode: 'squad' as const,
    matchType: 'official',
    kills: 14,
    damage: 2087,
    longestKillMeters: 312,
    debriefPath: `/clans/${CLAN_ID}/telemetry/matches/${id}/debrief`,
    squad: squad(names),
  })
  return {
    generatedAt: FIXED_DATE,
    stats: { clans: 29, players: 399, weekKills: 7957, weekWins: 198, isoWeek: 39 },
    dinners: [
      dinner('match-1', 'Desert_Main', 'Miramar', 'ALFA', ['Alpha', 'Bravo', 'Charlie', 'Delta']),
      dinner('match-2', 'Baltic_Main', 'Erangel', 'ECHO', ['Echo', 'Foxtrot', 'Golf']),
      dinner('match-3', 'Tiger_Main', 'Taego', 'HOTL', ['Hotel', 'India']),
    ],
    killFeed: [
      { id: 'k1', kind: 'kill', killer: 'Joueur Alpha', killerClanTag: 'ALFA', weapon: 'Kar98k', headshot: true, distanceMeters: 312, victimClanTag: 'ABC' },
      { id: 'k2', kind: 'kill', killer: 'Joueur Bravo', killerClanTag: 'ALFA', weapon: 'M416', headshot: false, distanceMeters: 48, victimClanTag: null },
      { id: 'k3', kind: 'kill', killer: 'Joueur Echo', killerClanTag: 'ECHO', weapon: 'Poêle', headshot: false, distanceMeters: 2, victimClanTag: null },
      { id: 'k4', kind: 'kill', killer: 'Joueur Hotel', killerClanTag: 'HOTL', weapon: 'AWM', headshot: true, distanceMeters: 427, victimClanTag: 'XYZ' },
      { id: 'win-match-1', kind: 'win', clanTag: 'ALFA', mapLabel: 'Miramar' },
      { id: 'k5', kind: 'kill', killer: 'Joueur Golf', killerClanTag: 'ECHO', weapon: 'Mini 14', headshot: false, distanceMeters: 186, victimClanTag: null },
      { id: 'k6', kind: 'kill', killer: 'Joueur India', killerClanTag: 'HOTL', weapon: 'UMP45', headshot: false, distanceMeters: 14, victimClanTag: null },
    ],
  }
}

/** Débriefing d'une partie (`GET /api/clans/1/matches/<id>/telemetry`) : 9 équipes, escouade [ALFA] + un coéquipier. */
export const DEBRIEF_MATCH_ID = 'match-debrief-1'
const DEBRIEF_START = Date.parse('2026-09-21T20:00:00.000Z') / 1000

export function debriefTelemetry(teamId: number | null = null) {
  const focusTeam = teamId ?? 1
  const teams = Array.from({ length: 9 }, (_, index) => ({
    teamId: index + 1,
    placement: index + 1,
    placementEstimated: false,
    kills: 12 - index,
    eliminatedAt: index === 0 ? null : 1600 - index * 150,
    tag: index === 0 ? 'ALFA' : `T${index + 1}`,
    clanName: index === 0 ? 'Clan ALFA' : null,
    trackedClanId: index === 0 ? CLAN_ID : null,
    players: [`${CALLSIGNS[index]} 1`, `${CALLSIGNS[index]} 2`],
  }))
  const combat = (id: string, type: string, t: number, phase: number, extra: Record<string, unknown>) => ({
    id,
    type,
    timestamp: t,
    phaseNumber: phase,
    actorAffiliation: 'external',
    targetAffiliation: 'external',
    ...extra,
  })
  return {
    ok: true,
    data: {
      match: {
        id: DEBRIEF_MATCH_ID,
        pubgMatchId: 'pubg-debrief-1',
        gameMode: 'squad-fpp',
        matchType: 'official',
        mapName: 'Baltic_Main',
        durationSeconds: 1632,
        placement: focusTeam,
        createdAt: new Date(DEBRIEF_START * 1000).toISOString(),
        members: [
          { memberId: 1, displayName: 'Joueur Alpha', kills: 5, damage: 812, assists: 2, revives: 1, placement: 1, walkDistance: 2410, rideDistance: 0 },
          { memberId: 2, displayName: 'Joueur Bravo', kills: 2, damage: 431, assists: 1, revives: 0, placement: 1, walkDistance: 1980, rideDistance: 3300 },
        ],
        clanTag: 'ALFA',
        otherTrackedClans: [],
        teams,
        focus: { teamId: focusTeam, clanId: CLAN_ID, tag: 'ALFA', clanName: 'Clan ALFA' },
      },
      telemetry: {
        status: 'success',
        weaponStats: [{ weaponName: 'WeapHK416_C', kills: 4, damageDealt: 620, shotsFired: 120, hitsLanded: 40 }],
        memberStats: [
          { memberKey: 'account.alpha', weapons: [{ shotsFired: 100, hitsLanded: 30 }], damageTaken: 250 },
          { memberKey: 'account.mate', weapons: [{ shotsFired: 40, hitsLanded: 8 }], damageTaken: 180 },
          // Deux bots dans le lobby : badge « 2 bots » de l'en-tête.
          { memberKey: 'ai.1042', weapons: [], damageTaken: 100 },
          { memberKey: 'ai.1043', weapons: [], damageTaken: 100 },
        ],
        phaseSnapshots: [
          { isGame: 0.1, timestampSeconds: 10, numAliveTeams: 26 },
          { isGame: 1, timestampSeconds: 120, numAliveTeams: 26 },
          { isGame: 2, timestampSeconds: 480, numAliveTeams: 20 },
        ],
        squadBodyZones: {
          available: true,
          dealt: [
            { zone: 'head', hits: 4, damage: 220 },
            { zone: 'torso', hits: 11, damage: 480 },
          ],
          taken: [{ zone: 'legs', hits: 3, damage: 90 }],
        },
      },
      combatEvents: [
        combat('e1', 'knock', 95, 1, { actorName: 'Joueur Alpha', actorAffiliation: 'current_clan', isSquadActor: true, targetName: 'Rival Un', distanceMeters: 42 }),
        combat('e2', 'kill', 130, 1, {
          actorName: 'Joueur Alpha', actorAffiliation: 'current_clan', isSquadActor: true, targetName: 'Rival Un', targetClanTag: 'RIV',
          weaponName: 'WeapHK416_C', damageReason: 'HeadShot', distanceMeters: 42,
        }),
        combat('e3', 'kill', 500, 2, { actorName: 'Rival Deux', targetName: 'Joueur Bravo', targetAffiliation: 'current_clan', isSquadTarget: true, weaponName: 'WeapAWM_C', distanceMeters: 310 }),
        // Hors escouade : un ours élimine un bot (identifiants techniques de la télémétrie, affichés en badges).
        combat('e4', 'kill', 520, 2, { actorName: 'monster.bear-02', targetName: 'ai.1042', weaponName: 'WeapM16A4_C', distanceMeters: 60 }),
        combat('e5', 'recall', 700, 2, { actorName: 'Joueur Bravo', actorAffiliation: 'current_clan', isSquadActor: true, targetName: '' }),
      ],
      killEvents: [
        { id: 'k1', killerName: 'Joueur Alpha', victimName: 'Rival Un', victimClanTag: 'RIV', killerClanTag: 'ALFA', damageCauser: 'WeapHK416_C', distance: 42, headshot: true, timestampSeconds: DEBRIEF_START + 130, isClanKill: true, isClanVictim: false, isSquadKill: true, isSquadVictim: false, source: 'sync' },
        { id: 'k2', killerName: 'Rival Deux', victimName: 'Joueur Bravo', victimClanTag: 'ALFA', killerClanTag: null, damageCauser: 'WeapAWM_C', distance: 310, headshot: false, timestampSeconds: DEBRIEF_START + 500, isClanKill: false, isClanVictim: true, isSquadKill: false, isSquadVictim: true, source: 'telemetry' },
      ],
      throwableStats: [
        { memberId: 1, itemId: 'Item_Weapon_SmokeBomb_C', count: 2 },
        { memberId: 1, itemId: 'Item_Weapon_Grenade_C', count: 1 },
      ],
      squadMates: [
        { accountId: 'account.mate', name: 'Coéquipier Kilo', clanTag: 'KIL', teamId: 1, bot: false, kills: 1, damage: 264, knockouts: 1, revives: 1, recalls: 0, deaths: 0, headshots: 0, damageTaken: 180, trackedClan: null, pubgClanCheckedAt: null },
      ],
      killFeedAvailable: true,
      weaponLabels: { WeapHK416_C: 'M416', WeapAWM_C: 'AWM' },
      memberIdentityMap: { 'account.alpha': { name: 'Joueur Alpha', clanTag: 'ALFA', clanId: CLAN_ID } },
    },
  }
}

/**
 * Matchs du clan (`GET /api/clans/1/matches`) : trois soirées, dont celle du 26 septembre qui passe minuit (partie de
 * 00:40 à Paris, rangée dans la soirée du 26 par la journée de jeu). Heures en UTC, affichées à Paris.
 */
export function clanMatchesResponse(period: string): ClanMatchesResponse {
  const names = ['Joueur Alpha', 'Joueur Bravo', 'Joueur Charlie', 'Joueur Delta']
  const game = (id: string, utc: string, placement: number, players: number, map: string, status: 'success' | 'pending', teamCount: number | null): SquadMatch => {
    const members = names.slice(0, players).map((displayName, index) => ({
      memberId: index + 1,
      displayName,
      kills: Math.max(0, 5 - index - (placement > 5 ? 2 : 0)),
      damage: 400 - index * 50,
      assists: 1,
      revives: index === 0 ? 1 : 0,
      placement,
    }))
    return {
      id,
      pubgMatchId: `pubg-${id}`,
      gameMode: players === 4 ? 'squad-fpp' : players === 3 ? 'squad-fpp' : 'duo-fpp',
      mapName: map,
      matchType: 'official',
      placement,
      createdAt: utc,
      durationSeconds: 1500,
      teamCount,
      totalKills: members.reduce((sum, member) => sum + member.kills, 0),
      totalDamage: members.reduce((sum, member) => sum + member.damage, 0),
      totalAssists: players,
      totalRevives: 1,
      members,
      isWin: placement === 1,
      telemetry: { status, parserVersion: null, parsedAt: null, bytesDownloaded: null, summary: null, topWeapons: [], memberStats: [], errorCode: null, errorMessage: null },
    }
  }
  // Du plus récent au plus ancien, comme l'API.
  const squads = [
    game('s26-5', '2026-09-26T22:40:00.000Z', 9, 4, 'Neon_Main', 'pending', null),
    game('s26-4', '2026-09-26T20:30:00.000Z', 3, 4, 'DihorOtok_Main', 'success', 26),
    game('s26-3', '2026-09-26T19:20:00.000Z', 1, 4, 'Baltic_Main', 'success', 25),
    game('s26-2', '2026-09-26T18:15:00.000Z', 2, 3, 'Desert_Main', 'success', 26),
    game('s26-1', '2026-09-26T17:42:00.000Z', 14, 2, 'Tiger_Main', 'success', 24),
    game('s25-2', '2026-09-25T20:00:00.000Z', 5, 3, 'Savage_Main', 'success', 25),
    game('s25-1', '2026-09-25T19:00:00.000Z', 11, 3, 'Baltic_Main', 'success', 25),
    game('s21-1', '2026-09-21T19:00:00.000Z', 7, 4, 'Desert_Main', 'success', 26),
  ]
  const byDate = new Map<string, SquadMatch[]>()
  for (const match of squads) byDate.set(sessionDateOf(match.createdAt), [...(byDate.get(sessionDateOf(match.createdAt)) ?? []), match])
  const sessions = Array.from(byDate.entries()).map(([date, matches]) => ({
    date,
    matches,
    totalDuration: matches.reduce((sum, match) => sum + match.durationSeconds, 0),
    totalKills: matches.reduce((sum, match) => sum + match.totalKills, 0),
    totalDamage: matches.reduce((sum, match) => sum + match.totalDamage, 0),
    winRate: matches.filter((match) => match.isWin).length / matches.length,
    members: names.slice(0, Math.max(...matches.map((match) => match.members.length))).map((displayName, index) => ({ memberId: index + 1, displayName })),
  }))
  const wins = squads.filter((match) => match.isWin).length
  return {
    clanId: CLAN_ID,
    clanName: 'Clan Alpha',
    period: period as ClanMatchesResponse['period'],
    availableModes: ['duo', 'squad', 'trio'],
    mapLabels: { Baltic_Main: 'Erangel', Desert_Main: 'Miramar', Tiger_Main: 'Taego', Savage_Main: 'Sanhok', Neon_Main: 'Rondo', DihorOtok_Main: 'Vikendi' },
    squads,
    stats: {
      totalKills: squads.reduce((sum, match) => sum + match.totalKills, 0),
      totalDamage: squads.reduce((sum, match) => sum + match.totalDamage, 0),
      winRate: wins / squads.length,
      matchCount: squads.length,
    },
    modePerformance: [],
    sessions,
    synergies: { topPairs: [], topSquads: [] },
    topPerformers: { kills: [], damage: [], survival: [] },
  }
}

/** Vitrine de la vue d'ensemble (`GET /api/clans/1/overview/showcase`). */
export function clanShowcase() {
  return {
    generatedAt: FIXED_DATE,
    level: 17,
    pubgMemberCount: 55,
    platform: 'steam',
    palmares: { monthWins: 97, monthGames: 1123, league: { rank: 13, of: 29 }, trackedKills: 4560, tournament: null },
    briefing: {
      win: {
        squadMatchId: 'win-1',
        mapName: 'Baltic_Main',
        mapLabel: 'Erangel',
        playedAt: '2026-09-26T19:20:00.000Z',
        kills: 14,
        squadSize: 4,
        mvp: { name: PLAYERS[0].displayName, kills: 6 },
        debriefPath: `/clans/${CLAN_ID}/telemetry/matches/win-1/debrief`,
      },
      longestKill: {
        killer: PLAYERS[0].displayName,
        weapon: 'Kar98k',
        distanceMeters: 431,
        headshot: true,
        victimTag: 'WOLF',
        playedAt: '2026-09-22T20:44:00.000Z',
        replayPath: `/clans/${CLAN_ID}/telemetry/matches/long-1/debrief?tab=replay`,
      },
      streak: { count: 3, atLeast: false, dates: ['2026-09-23', '2026-09-25', '2026-09-26'], weekSessions: 5, weekWins: 7 },
    },
    hints: { activeChallenges: 2, openTournaments: 1, weekGames: 25 },
  }
}

/**
 * Tournois de la vitrine (`GET /api/home/tournaments`), dates relatives à l'exécution — ce que la route renvoie une fois
 * ses fenêtres appliquées (début dans 14 jours, fin depuis moins de 3 jours) : `live` (un direct et quatre à venir),
 * `upcoming` (rien en cours), `results` (un tournoi terminé avant-hier, rien d'autre), `none` (rien à montrer).
 */
export function homeTournaments(scenario: 'live' | 'upcoming' | 'results' | 'none' = 'live'): HomeTournamentsPayload {
  const now = Date.now()
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString()
  const organizer = (id: number, tag: string, name: string) => ({ id, tag, name })
  const upcoming: HomeTournament[] = [
    { id: 'scrims-jeudi', title: 'Scrims du jeudi', mode: 'intra_clan', startDate: at(5), endDate: at(8), gameMode: 'normal-squad', mapName: 'Savage_Main', organizerClan: organizer(2, 'DEMO', 'Clan Démo'), roundCount: 0, participantCount: 0, playerCount: 0, lastRoundAt: null },
    { id: 'solo-showdown', title: 'Solo Showdown #4', mode: 'solo_ffa', startDate: at(96), endDate: at(240), gameMode: 'normal-solo', mapName: 'Desert_Main', organizerClan: organizer(3, 'RATZ', 'Les-Ratz'), roundCount: 0, participantCount: 0, playerCount: 0, lastRoundAt: null },
    { id: 'mix-match', title: 'Mix & Match #3', mode: 'custom_teams', startDate: at(200), endDate: at(300), gameMode: 'normal-squad', mapName: 'Tiger_Main', organizerClan: organizer(1, 'LMT', 'La Meute'), roundCount: 0, participantCount: 0, playerCount: 0, lastRoundAt: null },
    { id: 'coupe-hiver', title: 'Coupe d’hiver', mode: 'inter_clan', startDate: at(300), endDate: at(600), gameMode: null, mapName: null, organizerClan: organizer(1, 'LMT', 'La Meute'), roundCount: 0, participantCount: 0, playerCount: 0, lastRoundAt: null },
  ]
  const podium = [
    { key: 'clan:1', label: '[LMT] La Meute', points: 412 },
    { key: 'clan:2', label: '[DEMO] Clan Démo', points: 389 },
    { key: 'clan:3', label: '[RATZ] Les-Ratz', points: 351 },
  ]
  const live: HomeRankedTournament = {
    id: 'coupe-automne',
    title: 'Coupe d’automne 2026',
    mode: 'inter_clan',
    startDate: at(-168),
    endDate: at(552),
    gameMode: 'normal-squad',
    mapName: 'Baltic_Main',
    organizerClan: organizer(1, 'LMT', 'La Meute'),
    roundCount: 5,
    participantCount: 9,
    playerCount: 42,
    lastRoundAt: at(-22 / 60),
    leaders: podium,
  }
  const finished: HomeRankedTournament = {
    id: 'coupe-ete',
    title: 'Coupe d’été 2026',
    mode: 'inter_clan',
    startDate: at(-24 * 20),
    endDate: at(-48),
    gameMode: 'normal-squad',
    mapName: 'Desert_Main',
    organizerClan: organizer(1, 'LMT', 'La Meute'),
    roundCount: 18,
    participantCount: 11,
    playerCount: 38,
    lastRoundAt: at(-50),
    leaders: podium,
  }
  if (scenario === 'none') return { live: [], upcoming: [], upcomingCount: 0, results: [] }
  if (scenario === 'results') return { live: [], upcoming: [], upcomingCount: 0, results: [finished] }
  return { live: scenario === 'live' ? [live] : [], upcoming, upcomingCount: 4, results: [] }
}
