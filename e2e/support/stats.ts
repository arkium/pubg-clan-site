import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS, clanMatchesStats, itemUseStats } from './data'

import type { ClanPlaystyleRow, CooperationPair } from '@/lib/clan-playstyle'
import type { CareerLifetimeStats } from '@/lib/clan-career'
import type { LeaderboardPeriod } from '@/types/leaderboard'

/**
 * Statistiques du clan (e2e/stats.spec.ts) : « Style de jeu » (télémétrie, période) et « Carrière PUBG » (sans
 * période). Noms inventés, aucun lien avec la production.
 */

const periodOf = (url: URL) => (url.searchParams.get('period') ?? 'week') as LeaderboardPeriod

export function playstyleRows(): ClanPlaystyleRow[] {
  return PLAYERS.slice(0, 8).map((player, index) => ({
    memberId: player.memberId,
    displayName: player.displayName,
    aggressionScore: 82 - index * 6,
    supportScore: index === 2 ? 61 : index < 4 ? 30 - index * 5 : 0,
    zoneDisciplineScore: 60 + index * 3,
    avgBlueZoneHits: 2.3,
    avgFirstContactPhase: 2.4,
    avgCircleDelaySeconds: 14,
    avgCircleDelayPercent: 9,
    avgSafeZonePresencePercent: 84,
    avgOnFootDistanceMeters: 21_000,
    avgVehicleDistanceMeters: 13_000,
    avgDamageTaken: 318,
    avgHealAmount: 212,
    avgHealsUsed: 3.1,
    avgBoostsUsed: 2.4,
    maxVehicleSpeedKph: 1_184,
    avgPositionEvents: 212,
    matchesPlayed: 20 - index,
  }))
}

export function cooperationPairs(): CooperationPair[] {
  const name = (index: number) => PLAYERS[index].displayName
  return [
    { memberAId: 3, memberAName: name(2), memberBId: 1, memberBName: name(0), reviveCount: 14, coKillCount: 9, recallCount: 3, sharedDamageEvents: 30 },
    { memberAId: 1, memberAName: name(0), memberBId: 2, memberBName: name(1), reviveCount: 9, coKillCount: 31, recallCount: 0, sharedDamageEvents: 50 },
    { memberAId: 5, memberAName: name(4), memberBId: 2, memberBName: name(1), reviveCount: 11, coKillCount: 4, recallCount: 2, sharedDamageEvents: 10 },
    { memberAId: 4, memberAName: name(3), memberBId: 1, memberBName: name(0), reviveCount: 2, coKillCount: 22, recallCount: 1, sharedDamageEvents: 20 },
  ]
}

export function mockClanPlaystyle(api: ApiMock) {
  api
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/playstyle`, (url) => ({
      body: { ok: true, clanId: CLAN_ID, period: periodOf(url), periodKey: 'x', count: 8, rows: playstyleRows() },
    }))
    .on('GET', `/api/clans/${CLAN_ID}/bot-stats`, { body: { data: { avgBotsPerMatch: 3.4, matchesWithData: 40 } } })
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/item-use`, (url) => ({ body: { data: itemUseStats(periodOf(url), true) } }))
    .on('GET', `/api/clans/${CLAN_ID}/overview/matches-stats`, (url) => ({ body: clanMatchesStats(periodOf(url)) }))
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/synergies`, { body: { rows: cooperationPairs() } })
}

function careerStats(index: number, synced: boolean): CareerLifetimeStats {
  const level = 1 - index * 0.1
  return {
    combat: {
      kills: Math.round(8200 * level),
      deaths: Math.round(6000 * level),
      kdRatio: 1.37 - index * 0.05,
      headshots: Math.round(1500 * level),
      assists: Math.round(4000 * level),
      knockouts: Math.round(9000 * level),
      highestKillstreak: 12 - index,
      longestKill: 712.43 - index * 20,
      teamkills: index === 3 ? 42 : 5 + index,
      suicides: 10 + index,
    },
    victory: { wins: Math.round(380 * level), losses: Math.round(5600 * level), winLossRatio: 0.07, longestTimeAlive: 1900 + index * 10 },
    support: { teammatesRevived: Math.round(1400 * level), boostsUsed: Math.round(9000 * level), healed: Math.round(8000 * level) },
    vehicle: { vehiclesDestroyed: 40 + index, roadkills: 30 + index },
    movement: { drivenDistance: 9_000_000 * level, walkedDistance: 5_500_000 * level, swamDistance: 60_000 },
    other: {
      weaponsPicked: Math.round(21_000 * level),
      damageGiven: 1_100_000 * level,
      // Les deux derniers joueurs n'ont pas encore été resynchronisés depuis l'ajout de l'engagement.
      ...(synced ? { timeSurvived: Math.round(2400 * 3600 * level), roundsPlayed: Math.round(6000 * level), daysPlayed: Math.round(900 * level) } : {}),
    },
  }
}

export function clanCareer() {
  const refreshed = new Date(Date.now() - 3 * 3_600_000).toISOString()
  return {
    clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' },
    members: PLAYERS.slice(0, 8).map((player, index) => ({
      memberId: player.memberId,
      displayName: player.displayName,
      lastRefreshedAt: refreshed,
      stats: careerStats(index, index < 6),
    })),
    activeMemberCount: 9,
    lifetimeSync: { expression: '0 4 * * *', timezone: 'UTC', runsPerDay: 1 },
  }
}

export function mockClanCareer(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/lifetime-stats`, { body: clanCareer() })
}
