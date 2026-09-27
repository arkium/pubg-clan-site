import type { ApiMock } from './api'
import {
  CLAN_ID,
  MEMBER_ID,
  clanMatchesStats,
  clanOverview,
  clanShowcase,
  clanWeapons,
  clansLeaderboardResponse,
  itemUseStats,
  leaderboardResponse,
  memberDashboard,
  memberWeaponMastery,
  memberWeapons,
  homeShowcase,
  debriefTelemetry,
  clanMatchesResponse,
  DEBRIEF_MATCH_ID,
} from './data'
import type { LeaderboardPeriod } from '@/types/leaderboard'

/** Réponses figées de chaque page testée (API du navigateur, paramètres lus depuis l'URL). */

function periodOf(url: URL): LeaderboardPeriod {
  const value = url.searchParams.get('period')
  return value === 'month' || value === 'all' ? value : 'week'
}

export function mockClanLeaderboard(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/leaderboard`, (url) => ({ body: leaderboardResponse(periodOf(url)) }))
}

export function mockClanOverview(api: ApiMock) {
  api
    .on('GET', `/api/clans/${CLAN_ID}/overview`, { body: clanOverview() })
    .on('GET', `/api/clans/${CLAN_ID}/overview/matches-stats`, (url) => ({ body: clanMatchesStats(periodOf(url)) }))
    // Panneaux secondaires : état « sans données », rendu par la page comme en production.
    .on('GET', `/api/clans/${CLAN_ID}/city-insights`, { body: { insights: null, error: 'Aucune ville sur cette période.' } })
    .on('GET', `/api/clans/${CLAN_ID}/drop-pressure-stats`, { body: { stats: null, error: 'Aucun atterrissage sur cette période.' } })
    .on('GET', `/api/clans/${CLAN_ID}/overview/showcase`, { body: clanShowcase() })
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/synergies`, {
      body: { rows: [{ memberAId: 1, memberAName: 'Joueur Alpha', memberBId: 2, memberBName: 'Joueur Bravo', reviveCount: 9, recallCount: 0, coKillCount: 4, sharedDamageEvents: 0 }] },
    })
}

/** Le shell charge la fiche du joueur consulté (nom dans le header) sur toutes les pages joueur. */
function mockMemberShell(api: ApiMock) {
  api.on('GET', `/api/members/${MEMBER_ID}/dashboard`, { body: memberDashboard() })
}

export function mockMemberItems(api: ApiMock) {
  mockMemberShell(api)
  api.on('GET', `/api/members/${MEMBER_ID}/item-use`, (url) => ({ body: { data: itemUseStats(periodOf(url), false) } }))
}

export function mockMemberWeapons(api: ApiMock) {
  mockMemberShell(api)
  api
    .on('GET', `/api/members/${MEMBER_ID}/telemetry/weapons`, (url) => ({ body: memberWeapons(periodOf(url)) }))
    .on('GET', `/api/members/${MEMBER_ID}/weapon-mastery`, { body: memberWeaponMastery() })
    .on('GET', `/api/members/${MEMBER_ID}/throwables`, { body: { data: { totalThrows: 0, items: [] } } })
}

export function mockClanWeapons(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/weapons`, (url) => ({ body: clanWeapons(periodOf(url)) }))
}

export function mockClansLeaderboard(api: ApiMock) {
  api.on('GET', '/api/clans-leaderboard', (url) => ({ body: clansLeaderboardResponse(periodOf(url)) }))
}

/** Vitrine publique de l'accueil : une seule API, publique. */
export function mockHomeShowcase(api: ApiMock) {
  api.on('GET', '/api/home/showcase', { body: homeShowcase() })
}

/** Débriefing : l'équipe demandée (`?teamId=`) est renvoyée comme escouade analysée ; le replay est indisponible. */
export function mockMatchDebrief(api: ApiMock) {
  const base = `/api/clans/${CLAN_ID}/matches/${DEBRIEF_MATCH_ID}`
  api
    .on('GET', `${base}/telemetry`, (url) => ({ body: debriefTelemetry(Number(url.searchParams.get('teamId')) || null) }))
    .on('GET', `${base}/replay`, { status: 404, body: { ok: false, error: { message: 'Replay indisponible pour ce match.' } } })
}

/** Matchs du clan et page d'une soirée : une seule API, lue avec la période de l'URL. */
export function mockClanMatches(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/matches`, (url) => ({ body: clanMatchesResponse(url.searchParams.get('period') ?? 'week') }))
}

/**
 * Annuaire des clans : quatre clans (dont le clan technique et un clan en sommeil) et leur activité. Dates relatives à
 * l'heure du test, pour que la mise en sommeil (14 jours) ne dépende pas du jour où il tourne.
 */
export function mockClanDirectory(api: ApiMock) {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
  api
    .on('GET', '/api/clans', {
      body: [
        { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO', platformShard: 'steam', membersCount: 24, matchesCount: 120, killsCount: 480, timePlayedSeconds: 180000, imageUrl: null },
        { id: 2, name: 'Clan Témoin', tag: 'TEMO', platformShard: 'steam', membersCount: 12, matchesCount: 64, killsCount: 200, timePlayedSeconds: 90000, imageUrl: null },
        { id: 3, name: 'Clan Meute', tag: 'MEUT', platformShard: 'steam', membersCount: 30, matchesCount: 300, killsCount: 1500, timePlayedSeconds: 400000, imageUrl: null },
        { id: 4, name: 'Clan Endormi', tag: 'ZZZ', platformShard: 'steam', membersCount: 8, matchesCount: 40, killsCount: 90, timePlayedSeconds: 50000, imageUrl: null },
        { id: 99, name: 'Ungrouped', tag: 'UNG', platformShard: 'steam', membersCount: 5, matchesCount: 10, killsCount: 20, timePlayedSeconds: 10000, imageUrl: null, isSystem: true },
      ],
    })
    .on('GET', '/api/clans/directory', {
      body: {
        generatedAt: hoursAgo(0),
        tonight: { date: '2026-09-26', players: 11 },
        leagueSize: 29,
        clanOfMomentId: 3,
        activity: [
          { clanId: CLAN_ID, games7: 25, wins7: 5, playedTonight: 3, lastMatchAt: hoursAgo(2), leagueRank: 3 },
          { clanId: 2, games7: 10, wins7: 0, playedTonight: 0, lastMatchAt: hoursAgo(30), leagueRank: 12 },
          { clanId: 3, games7: 64, wins7: 7, playedTonight: 8, lastMatchAt: hoursAgo(1), leagueRank: 1 },
          { clanId: 4, games7: 0, wins7: 0, playedTonight: 0, lastMatchAt: hoursAgo(24 * 20), leagueRank: null },
          { clanId: 99, games7: 4, wins7: 0, playedTonight: 0, lastMatchAt: hoursAgo(50), leagueRank: null },
        ],
      },
    })
}
