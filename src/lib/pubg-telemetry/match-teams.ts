/**
 * Équipes du lobby d'un match, reconstituées depuis la télémétrie (`memberStats` couvre les ~100 joueurs,
 * avec `teamId` et `teamPlacement`). Sert la bande de sélection des escouades du débriefing et le choix de
 * l'équipe mise en avant (vue clan : l'équipe du clan ; vue tournoi : l'équipe championne).
 */

type Identity = { name: string; clanTag?: string | null; clanId?: number }

export type MatchTeamSummary = {
  teamId: number
  /** Classement final de l'équipe, `null` si aucune source ne permet de l'établir. */
  placement: number | null
  /**
   * `true` quand le classement est déduit de l'ordre des éliminations : matchs analysés avant que le parser
   * ne lise `LogMatchEnd.characters[].character.ranking` (2026-09-16), équipe sans membre suivi.
   */
  placementEstimated: boolean
  kills: number
  /**
   * Horodatage (celui de `deathSamples`, secondes epoch) de la mort du dernier joueur de l'équipe ; `null` si un
   * joueur au moins n'est jamais mort (équipe en vie à la fin, ou partie quittée avant l'avion).
   */
  eliminatedAtEpoch: number | null
  players: Array<{ accountId: string; name: string }>
  /** Clans suivis présents dans l'équipe, du plus représenté au moins représenté. */
  trackedClanIds: number[]
  /** Tag le plus fréquent parmi les joueurs (clan suivi ou clan PUBG résolu). */
  tag: string | null
}

function parseRows(value: unknown): Record<string, unknown>[] {
  let rows = value
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      return []
    }
  }
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : []
}

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const toKey = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

/** `teamId` par compte (minuscules) : celui de `memberStats` en priorité, sinon celui des positions. */
export function buildTeamIndex(memberStats: unknown, positionSamples: unknown): Map<string, number> {
  const teamByKey = new Map<string, number>()
  for (const row of parseRows(positionSamples)) {
    const key = toKey(row.memberKey)
    const team = toNumber(row.teamId)
    if (key && team > 0 && !teamByKey.has(key)) teamByKey.set(key, team)
  }
  for (const row of parseRows(memberStats)) {
    const key = toKey(row.memberKey)
    const team = toNumber(row.teamId)
    if (key && team > 0) teamByKey.set(key, team)
  }
  return teamByKey
}

function mostFrequent<T>(values: T[]): T[] {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([value]) => value)
}

export function listMatchTeams(input: {
  memberStats: unknown
  positionSamples: unknown
  identities: Record<string, Identity>
  /** Morts du match (`deathSamples`) : ordre des éliminations, pour estimer un classement manquant. */
  deathSamples?: unknown
  /** Classement officiel (API PUBG, `SquadMember.placement`) des membres suivis, par compte. */
  trackedPlacements?: Record<string, number>
}): MatchTeamSummary[] {
  const teamByKey = buildTeamIndex(input.memberStats, input.positionSamples)
  const identities = new Map<string, Identity>()
  for (const [accountId, identity] of Object.entries(input.identities)) {
    identities.set(accountId.toLowerCase(), identity)
  }

  const teams = new Map<number, MatchTeamSummary & { clanIds: number[]; tags: string[] }>()
  // Classement de fin de partie lu dans la télémétrie (LogMatchEnd, parses depuis le 2026-09-16).
  let hasTelemetryPlacement = false
  for (const row of parseRows(input.memberStats)) {
    const key = toKey(row.memberKey)
    const teamId = teamByKey.get(key)
    if (!key || !teamId) continue

    const team =
      teams.get(teamId) ??
      {
        teamId,
        placement: null,
        placementEstimated: false,
        kills: 0,
        eliminatedAtEpoch: null,
        players: [],
        trackedClanIds: [],
        tag: null,
        clanIds: [],
        tags: [],
      }
    teams.set(teamId, team)

    if (toNumber(row.teamPlacement) > 0) hasTelemetryPlacement = true
    const placement = toNumber(row.teamPlacement) || toNumber(input.trackedPlacements?.[key])
    if (placement > 0 && (team.placement === null || placement < team.placement)) team.placement = placement
    team.kills += toNumber(row.kills)

    const identity = identities.get(key)
    const bot = key.startsWith('ai.')
    team.players.push({
      accountId: String(row.memberKey),
      name: identity?.name ?? (bot ? 'Bot' : key.replace(/^account\./, '').slice(0, 8)),
    })
    if (identity?.clanId) team.clanIds.push(identity.clanId)
    if (identity?.clanTag) team.tags.push(identity.clanTag)
  }

  // Classement manquant : une équipe est classée d'autant mieux qu'elle a été éliminée tard. Une équipe
  // sans aucune mort enregistrée est considérée en vie à la fin.
  const lastDeathByTeam = new Map<number, number>()
  const hasDeath = new Set<string>()
  for (const row of parseRows(input.deathSamples)) {
    const key = toKey(row.memberKey)
    const teamId = teamByKey.get(key) ?? toNumber(row.teamId)
    const timestamp = toNumber(row.timestampSeconds)
    if (!key || !teamId) continue
    hasDeath.add(key)
    lastDeathByTeam.set(teamId, Math.max(lastDeathByTeam.get(teamId) ?? 0, timestamp))
  }
  const eliminationTime = (team: MatchTeamSummary) =>
    team.players.every((player) => hasDeath.has(player.accountId.toLowerCase()))
      ? lastDeathByTeam.get(team.teamId) ?? 0
      : Number.POSITIVE_INFINITY
  const allTeams = Array.from(teams.values())
  for (const team of allTeams) {
    const time = eliminationTime(team)
    team.eliminatedAtEpoch = Number.isFinite(time) && time > 0 ? time : null
  }
  if (lastDeathByTeam.size > 0) {
    for (const team of allTeams) {
      if (team.placement !== null) continue
      const time = eliminationTime(team)
      // Classement de fin connu pour le lobby, mais pas pour cette équipe, et aucun de ses joueurs n'est
      // mort : elle n'était plus là à la fin (partie quittée avant l'avion). Sans cette garde, elle passait
      // « en vie à la fin », donc #1 estimé, à côté du vrai vainqueur (constaté le 2026-09-26).
      if (!Number.isFinite(time) && hasTelemetryPlacement) continue
      team.placement = 1 + allTeams.filter((other) => other !== team && eliminationTime(other) > time).length
      team.placementEstimated = true
    }
  }

  return allTeams
    .map(({ clanIds, tags, ...team }) => ({
      ...team,
      players: team.players.sort((left, right) => left.name.localeCompare(right.name)),
      trackedClanIds: mostFrequent(clanIds),
      tag: mostFrequent(tags)[0] ?? null,
    }))
    .sort(
      (left, right) =>
        (left.placement ?? Number.MAX_SAFE_INTEGER) - (right.placement ?? Number.MAX_SAFE_INTEGER) ||
        Number(left.placementEstimated) - Number(right.placementEstimated) ||
        right.kills - left.kills ||
        left.teamId - right.teamId
    )
}

/**
 * Équipe mise en avant : celle demandée si elle existe ; sinon la meilleure équipe du clan consulté ;
 * sinon la mieux classée du lobby (vue tournoi : l'équipe championne).
 */
export function pickFocusTeam(
  teams: MatchTeamSummary[],
  request: { teamId?: number | null; clanId?: number | null }
): MatchTeamSummary | null {
  if (request.teamId) {
    const requested = teams.find((team) => team.teamId === request.teamId)
    if (requested) return requested
  }
  if (request.clanId) {
    const clanTeam = teams.find((team) => team.trackedClanIds.includes(request.clanId as number))
    if (clanTeam) return clanTeam
  }
  return teams[0] ?? null
}
