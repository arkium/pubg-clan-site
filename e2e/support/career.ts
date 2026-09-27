import type { ApiMock } from './api'
import { CLAN_ID, MEMBER_ID } from './data'

/**
 * Carrière PUBG d'un joueur et calendrier de son tableau de bord (e2e/career.spec.ts, e2e/members.spec.ts). Chiffres
 * inventés, dates relatives à l'heure du test ; aucun lien avec la production.
 */

type Blocks = {
  kills: number
  losses: number
  wins: number
  games: number
  longest: number
  streak: number
  alive: number
  heals: number
  boosts: number
  walked: number
}

export function lifetime({ kills, losses, wins, games, longest, streak, alive, heals, boosts, walked }: Blocks) {
  return {
    combat: { kills, deaths: losses, kdRatio: kills / losses, headshots: Math.round(kills / 4), assists: 1120, knockouts: 3890, highestKillstreak: streak, longestKill: longest, teamkills: 3, suicides: 5 },
    victory: { wins, losses, winLossRatio: wins / losses, longestTimeAlive: alive },
    support: { teammatesRevived: 488, boostsUsed: boosts, healed: heals },
    vehicle: { vehiclesDestroyed: 22, roadkills: 14 },
    movement: { drivenDistance: 2_840_000, walkedDistance: walked, swamDistance: 12_300 },
    other: { weaponsPicked: 9870, damageGiven: 612_400, timeSurvived: 900_000, roundsPlayed: games, daysPlayed: 300 },
  }
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

export function careerResponse() {
  return {
    memberId: MEMBER_ID,
    member: { displayName: 'Joueur Alpha', pubgPlayerName: 'Alpha_FR', clanId: CLAN_ID, clan: { name: 'Clan Démo', tag: 'DEMO' } },
    stats: lifetime({ kills: 3412, losses: 1180, wins: 42, games: 1222, longest: 612, streak: 9, alive: 1864, heals: 1200, boosts: 2466, walked: 1_204_000 }),
    statsByMode: {
      squad: lifetime({ kills: 2525, losses: 900, wins: 34, games: 934, longest: 612, streak: 9, alive: 1864, heals: 900, boosts: 1800, walked: 900_000 }),
      duo: lifetime({ kills: 717, losses: 240, wins: 7, games: 247, longest: 488, streak: 7, alive: 1702, heals: 250, boosts: 500, walked: 240_000 }),
      solo: null,
    },
    clanRanks: { 'combat.kills': 1, 'victory.wins': 2, 'combat.highestKillstreak': 3, 'combat.kdRatio': null },
    lastRefreshedAt: hoursAgo(3),
  }
}

const season = (id: number, values: Record<string, unknown>) => ({
  id,
  memberId: MEMBER_ID,
  seasonId: `division.bro.official.pc-2018-${id}`,
  rankedGameMode: null,
  rankedTier: null,
  rankedSubTier: null,
  rankedPoints: 0,
  rankedBestTier: null,
  rankedBestSubTier: null,
  rankedBestPoints: 0,
  rankedKills: 0,
  rankedDamage: 0,
  rankedWins: 0,
  rankedMatches: 0,
  rankedAssists: 0,
  rankedRevives: 0,
  normalKills: 0,
  normalDamage: 0,
  normalWins: 0,
  normalLosses: 0,
  normalAssists: 0,
  normalRevives: 0,
  normalMatches: 0,
  lastRefreshedAt: hoursAgo(3),
  ...values,
})

export function seasonsResponse() {
  return {
    memberId: MEMBER_ID,
    seasons: [
      season(43, { rankedGameMode: 'squad', rankedTier: 'Gold', rankedSubTier: '2', rankedPoints: 2050, rankedBestTier: 'Platinum', rankedBestSubTier: '4', rankedMatches: 48, rankedWins: 3, normalKills: 159, normalDamage: 23_199, normalWins: 14, normalLosses: 19, normalMatches: 33 }),
      season(42, { rankedTier: 'Silver', rankedSubTier: '1', rankedPoints: 1750, rankedMatches: 72, rankedWins: 6, normalKills: 746, normalDamage: 107_970, normalWins: 35, normalLosses: 142, normalMatches: 177 }),
      season(41, { normalKills: 90, normalDamage: 12_000, normalWins: 4, normalLosses: 30, normalMatches: 34 }),
    ],
  }
}

const PARIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Journée de jeu d'aujourd'hui (06:00 à 06:00, Paris), comme `sessionDateOf`. */
export const sessionToday = () => PARIS_DATE.format(new Date(Date.now() - 6 * 3_600_000))
const daysBefore = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

export function calendarResponse() {
  const today = sessionToday()
  const hours = Array.from({ length: 24 }, () => 0)
  hours[21] = 6
  hours[22] = 5
  hours[14] = 2
  return {
    today,
    days: [
      { date: daysBefore(today, 20), games: 7, wins: 2 },
      { date: daysBefore(today, 13), games: 4, wins: 0 },
      { date: daysBefore(today, 1), games: 2, wins: 1 },
    ],
    hours,
  }
}

/** Routes de la carrière (et de la synchro) : la page Carrière et les cartes du tableau de bord. */
export function mockCareerApis(api: ApiMock) {
  api
    .on('GET', `/api/members/${MEMBER_ID}/stats`, { body: careerResponse() })
    .on('GET', `/api/members/${MEMBER_ID}/season-stats`, { body: seasonsResponse() })
    .on('POST', `/api/members/${MEMBER_ID}/stats`, { body: careerResponse() })
    .on('POST', `/api/members/${MEMBER_ID}/season-stats`, { body: { memberId: MEMBER_ID } })
}

export function mockMemberCalendar(api: ApiMock) {
  api.on('GET', `/api/members/${MEMBER_ID}/calendar`, { body: calendarResponse() })
}
