/**
 * Annuaire des clans (`/clans`, refonte du 2026-09-26, docs/features/clans.md §Annuaire) : activité des 7 derniers
 * jours, joueurs de la soirée, clan du moment, tri, recherche, clans en sommeil. Module pur, importable côté client.
 */

import { sessionDateOf } from '@/lib/match-sessions'
import { dominantRole, type RosterRoleId } from '@/lib/member-roster'

/** Sans partie depuis ce nombre de jours, un clan est « en sommeil ». */
export const SLEEP_AFTER_DAYS = 14
/** Parties minimales sur 7 jours pour prétendre au titre de clan du moment. */
export const MOMENT_MIN_GAMES = 5

/** Parties cumulées des membres (`MemberTelemetryStats.matchesPlayed`) en dessous desquelles un clan n'a pas de style. */
export const CLAN_STYLE_MIN_MATCHES = 20

/**
 * Style de jeu d'un clan (badge de l'annuaire, 2026-10-04) : le rôle dominant des **moyennes** de ses membres — même
 * calcul que les trois jauges de « Style de jeu du clan » (`playstyleRoles`) et même règle que le rôle d'un membre
 * (`dominantRole`), sur la période `all-time` comme la fiche des membres. Scores de 0 à 100.
 */
export type ClanStyle = {
  id: RosterRoleId
  /** Score moyen du rôle retenu. */
  score: number
  aggression: number
  support: number
  zoneDiscipline: number
  /** Membres ayant des stats de télémétrie, et leurs parties cumulées. */
  members: number
  matches: number
}

export type ClanStyleRow = { members: number; matches: number; aggression: number; support: number; zoneDiscipline: number }

/** `null` sous `CLAN_STYLE_MIN_MATCHES` parties cumulées ou sans score positif : pas de badge plutôt qu'un style au hasard. */
export function clanStyleOf(row: ClanStyleRow | null | undefined): ClanStyle | null {
  if (!row || !Number.isFinite(row.matches) || row.matches < CLAN_STYLE_MIN_MATCHES) return null
  const best = dominantRole({ aggression: row.aggression, support: row.support, zoneDiscipline: row.zoneDiscipline })
  if (!best) return null
  return { id: best.id, score: best.score, aggression: row.aggression, support: row.support, zoneDiscipline: row.zoneDiscipline, members: row.members, matches: row.matches }
}

export interface ClanActivity {
  clanId: number
  games7: number
  wins7: number
  /** Joueurs distincts ayant joué dans la soirée en cours (journée de jeu, depuis 06:00 à Paris). */
  playedTonight: number
  lastMatchAt: string | null
  /** Rang en Ligue des clans (mois) ; `null` si le clan n'y figure pas. */
  leagueRank: number | null
  /** Style de jeu dominant depuis le début du suivi ; `null` sans assez de parties analysées. */
  style: ClanStyle | null
}

export interface ClanDirectoryPayload {
  generatedAt: string
  /** Soirée en cours (`AAAA-MM-JJ`) et joueurs distincts qui y ont joué, tous clans confondus. */
  tonight: { date: string; players: number }
  leagueSize: number
  clanOfMomentId: number | null
  activity: ClanActivity[]
}

export type ActivityRow = { clanId: number; memberId: number; squadMatchId: string; placement: number; createdAt: Date | string }

/** Agrège les parties des 7 derniers jours par clan, et les joueurs de la soirée en cours. */
export function aggregateActivity(rows: readonly ActivityRow[], tonight: string) {
  const byClan = new Map<number, { games: Set<string>; wins: Set<string>; tonight: Set<number> }>()
  const tonightPlayers = new Set<number>()
  for (const row of rows) {
    const entry = byClan.get(row.clanId) ?? { games: new Set<string>(), wins: new Set<string>(), tonight: new Set<number>() }
    entry.games.add(row.squadMatchId)
    if (row.placement === 1) entry.wins.add(row.squadMatchId)
    if (sessionDateOf(row.createdAt) === tonight) {
      entry.tonight.add(row.memberId)
      tonightPlayers.add(row.memberId)
    }
    byClan.set(row.clanId, entry)
  }
  return {
    byClan: new Map(
      Array.from(byClan.entries()).map(([clanId, entry]) => [
        clanId,
        { games7: entry.games.size, wins7: entry.wins.size, playedTonight: entry.tonight.size },
      ])
    ),
    tonightPlayers: tonightPlayers.size,
  }
}

/** Clan du moment : le plus de top 1 sur 7 jours (au moins 5 parties), puis le meilleur taux, puis le plus de parties. */
export function pickClanOfMoment(
  entries: ReadonlyArray<{ clanId: number; games7: number; wins7: number; isSystem?: boolean }>,
  minGames = MOMENT_MIN_GAMES
): number | null {
  let best: { clanId: number; games7: number; wins7: number } | null = null
  for (const entry of entries) {
    if (entry.isSystem || entry.games7 < minGames || entry.wins7 === 0) continue
    if (!best) {
      best = entry
      continue
    }
    const rate = entry.wins7 / entry.games7
    const bestRate = best.wins7 / best.games7
    if (entry.wins7 > best.wins7 || (entry.wins7 === best.wins7 && (rate > bestRate || (rate === bestRate && entry.games7 > best.games7)))) {
      best = entry
    }
  }
  return best?.clanId ?? null
}

export function isSleeping(lastMatchAt: string | null | undefined, now: Date = new Date(), days = SLEEP_AFTER_DAYS): boolean {
  if (!lastMatchAt) return true
  return now.getTime() - Date.parse(lastMatchAt) > days * 86_400_000
}

export type DirectorySortKey = 'activity' | 'name' | 'members' | 'games'

export type DirectoryEntry = {
  id: number
  name: string
  tag: string
  membersCount: number
  games7: number
  wins7: number
  playedTonight: number
  lastMatchAt: string | null
}

/** Tri de l'annuaire. Activité : joueurs de la soirée, puis parties sur 7 jours, puis dernière partie. */
export function sortDirectory<T extends DirectoryEntry>(entries: readonly T[], key: DirectorySortKey): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  const last = (entry: T) => (entry.lastMatchAt ? Date.parse(entry.lastMatchAt) : 0)
  return [...entries].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (key === 'members') return b.membersCount - a.membersCount || byName(a, b)
    if (key === 'games') return b.games7 - a.games7 || byName(a, b)
    return b.playedTonight - a.playedTonight || b.games7 - a.games7 || last(b) - last(a) || byName(a, b)
  })
}

/** Recherche par nom ou tag, crochets et casse ignorés (« [RATZ] », « meute »). */
export function matchesQuery(entry: Pick<DirectoryEntry, 'name' | 'tag'>, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(/[[\]]/g, '')
  if (!needle) return true
  return entry.name.toLowerCase().includes(needle) || entry.tag.toLowerCase().includes(needle)
}

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })

/** « ce soir », « il y a 3 h », « hier », « mar. », « le 02/09 » — dernière partie, en relatif. */
export function relativeLastGame(lastMatchAt: string | null | undefined, now: Date = new Date()): string {
  if (!lastMatchAt) return 'aucune partie'
  const at = new Date(lastMatchAt)
  const hours = (now.getTime() - at.getTime()) / 3_600_000
  const tonight = sessionDateOf(now)
  const session = sessionDateOf(at)
  if (session === tonight) return hours < 1 ? 'il y a moins d’une heure' : hours < 6 ? `il y a ${Math.floor(hours)} h` : 'ce soir'
  const days = Math.round((Date.parse(tonight) - Date.parse(session)) / 86_400_000)
  if (days === 1) return 'hier'
  if (days < 7) return weekday.format(at)
  return `le ${dayMonth.format(at)}`
}
