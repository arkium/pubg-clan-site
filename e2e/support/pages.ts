import type { ApiMock } from './api'
import {
  CLAN_ID,
  MEMBER_ID,
  clanMatchesStats,
  clanOverview,
  clanWeapons,
  clansLeaderboardResponse,
  itemUseStats,
  leaderboardResponse,
  memberDashboard,
  memberWeaponMastery,
  memberWeapons,
  homeShowcase,
  debriefTelemetry,
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
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/synergies`, { body: { rows: [] } })
}

export function mockClanItems(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/item-use`, (url) => ({ body: { data: itemUseStats(periodOf(url), true) } }))
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
