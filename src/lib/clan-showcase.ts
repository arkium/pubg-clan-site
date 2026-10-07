/**
 * Vitrine de la vue d'ensemble d'un clan (refonte du 2026-09-26, docs/features/clans.md §Vue d'ensemble) : types et
 * logique pure du palmarès et du briefing de la semaine. Importable côté client.
 */

import { sessionDateOf } from '@/lib/match-sessions'

export interface ClanShowcaseWin {
  squadMatchId: string
  mapName: string
  mapLabel: string
  playedAt: string
  kills: number
  squadSize: number
  mvp: { name: string; kills: number } | null
  debriefPath: string
}

export interface ClanShowcaseLongestKill {
  killer: string
  weapon: string
  distanceMeters: number
  headshot: boolean
  /** Tag du clan de la victime s'il est connu ; son pseudo n'est pas utile ici. */
  victimTag: string | null
  playedAt: string
  replayPath: string
}

export interface ClanShowcaseStreak {
  /** Soirées consécutives (les plus récentes) avec au moins un top 1. */
  count: number
  /** La série remonte au début des soirées lues (début du mois ou de la semaine) : elle peut être plus longue. */
  atLeast: boolean
  /** Dates de ces soirées, de la plus ancienne à la plus récente. */
  dates: string[]
  weekSessions: number
  weekWins: number
}

export interface ClanShowcase {
  generatedAt: string
  level: number | null
  pubgMemberCount: number | null
  platform: string
  palmares: {
    monthWins: number
    monthGames: number
    league: { rank: number; of: number } | null
    trackedKills: number
    tournament: { id: string; title: string } | null
  }
  briefing: {
    win: ClanShowcaseWin | null
    longestKill: ClanShowcaseLongestKill | null
    streak: ClanShowcaseStreak
  }
  hints: { activeChallenges: number; openTournaments: number; weekGames: number }
}

export type ShowcaseMatch = {
  id: string
  placement: number
  createdAt: Date | string
  members: Array<{ kills: number; name: string }>
}

/** Soirées (journée de jeu à Paris) d'une liste de parties, de la plus récente à la plus ancienne. */
export function sessionsOf(matches: readonly ShowcaseMatch[]): Array<{ date: string; games: number; wins: number }> {
  const byDate = new Map<string, { date: string; games: number; wins: number }>()
  for (const match of matches) {
    const date = sessionDateOf(match.createdAt)
    const entry = byDate.get(date) ?? { date, games: 0, wins: 0 }
    entry.games += 1
    entry.wins += match.placement === 1 ? 1 : 0
    byDate.set(date, entry)
  }
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
}

/** Série en cours : soirées consécutives les plus récentes ayant chacune au moins un top 1. */
export function winStreak(sessionsNewestFirst: ReadonlyArray<{ date: string; wins: number }>): { count: number; dates: string[] } {
  const dates: string[] = []
  for (const session of sessionsNewestFirst) {
    if (session.wins === 0) break
    dates.push(session.date)
  }
  return { count: dates.length, dates: dates.reverse() }
}

/** MVP d'une partie : le plus de kills ; personne sans kill. */
export function pickMvp(members: ReadonlyArray<{ name: string; kills: number }>): { name: string; kills: number } | null {
  let best: { name: string; kills: number } | null = null
  for (const member of members) {
    if (!best || member.kills > best.kills) best = member
  }
  return best && best.kills > 0 ? { name: best.name, kills: best.kills } : null
}

/** Niveau et membres du clan lus dans la fiche PUBG synchronisée (`Clan.clanStats.pubg`). */
export function pubgClanFacts(clanStats: unknown): { level: number | null; memberCount: number | null } {
  const pubg = (clanStats as { pubg?: { memberCount?: unknown; raw?: { attributes?: { clanLevel?: unknown } } } } | null)?.pubg
  const level = pubg?.raw?.attributes?.clanLevel
  const memberCount = pubg?.memberCount
  return {
    level: typeof level === 'number' && Number.isFinite(level) ? level : null,
    memberCount: typeof memberCount === 'number' && Number.isFinite(memberCount) ? memberCount : null,
  }
}

// ── Duo et synergies ─────────────────────────────────────────────────────────────────────────────

export type SynergyLike = {
  memberIds: number[]
  memberNames: string[]
  matchesPlayed: number
  totalKills: number
  winRate: number
}

/** Seuil de parties ensemble pour qu'une paire ou une escouade compte (duo de la période, barres). */
export const SYNERGY_MIN_GAMES = 5

/** Duo de la période : la paire au meilleur taux de top 1, au moins `minGames` parties ensemble ; à égalité, la plus assidue. */
export function pickDuo<T extends SynergyLike>(pairs: readonly T[], minGames = SYNERGY_MIN_GAMES): T | null {
  let best: T | null = null
  for (const pair of pairs) {
    if (pair.matchesPlayed < minGames) continue
    if (!best || pair.winRate > best.winRate || (pair.winRate === best.winRate && pair.matchesPlayed > best.matchesPlayed)) best = pair
  }
  return best
}

export type SynergyBar = { key: string; mode: 'duo' | 'trio' | 'squad'; names: string; winRate: number; games: number; widthPercent: number }

/** Barres des synergies : paires et escouades d'au moins `minGames` parties, par taux de top 1 décroissant. */
export function synergyBars(groups: readonly SynergyLike[], limit = 5, minGames = SYNERGY_MIN_GAMES): SynergyBar[] {
  const kept = groups
    .filter((group) => group.matchesPlayed >= minGames)
    .sort((a, b) => b.winRate - a.winRate || b.matchesPlayed - a.matchesPlayed)
    .slice(0, limit)
  const max = Math.max(0, ...kept.map((group) => group.winRate))
  return kept.map((group) => ({
    key: group.memberIds.join(':'),
    mode: group.memberIds.length <= 2 ? 'duo' : group.memberIds.length === 3 ? 'trio' : 'squad',
    names: group.memberNames.join(group.memberNames.length === 2 ? ' + ' : ', '),
    winRate: group.winRate,
    games: group.matchesPlayed,
    widthPercent: max > 0 ? Math.round((group.winRate / max) * 100) : 0,
  }))
}

// ── Navigation par intention ─────────────────────────────────────────────────────────────────────

export type ExploreIntent = 'play' | 'improve' | 'compete'

const INTENT_BY_NAV_KEY: Record<string, ExploreIntent> = {
  'clan.matches': 'play',
  'clan.members': 'play',
  'clan.members-pending': 'play',
  'clan.challenges': 'play',
  'clan.tournaments': 'play',
  'clan.stats': 'improve',
  'clan.stats-career': 'improve',
  'clan.stats-weapons': 'improve',
  'clan.drop-zones': 'improve',
  'clan.positions': 'improve',
  'clan.zone-closures': 'improve',
  'clan.heatmap-kills': 'improve',
  'clan.leaderboard': 'compete',
  'clan.awards': 'compete',
}

/** Répartit les pages du clan en trois intentions ; une page inconnue va dans « Progresser », jamais perdue. */
export function groupByIntent<T extends { navKey: string }>(items: readonly T[]): Record<ExploreIntent, T[]> {
  const groups: Record<ExploreIntent, T[]> = { play: [], improve: [], compete: [] }
  for (const item of items) {
    if (item.navKey === 'clan.overview') continue
    groups[INTENT_BY_NAV_KEY[item.navKey] ?? 'improve'].push(item)
  }
  return groups
}
