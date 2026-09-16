/**
 * Coéquipiers de l'escouade qui ne sont membres d'aucun clan suivi.
 *
 * `SquadMember` (et donc `SquadMatch.totalKills`…) ne couvre que les membres suivis :
 * un coéquipier invité n'y figure pas. Ses statistiques existent pourtant dans
 * `memberStats` de la télémétrie, qui couvre tout le lobby. Pour les membres suivis,
 * les deux sources concordent (vérifié sur `cmu027vpd3ftl04tzlejla0vk` : kills, dégâts
 * et réanimations identiques) — seules les assistances manquent côté télémétrie.
 */

export type SquadMateStats = {
  accountId: string
  name: string
  clanTag: string | null
  teamId: number
  bot: boolean
  kills: number
  damage: number
  knockouts: number
  revives: number
  /** Rappels déclenchés par ce joueur pour ses coéquipiers (`LogPlayerUseRespawn`). */
  recalls: number
  deaths: number
  headshots: number
  damageTaken: number
}

type Identity = { name: string; clanTag?: string | null }

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

export function extractSquadMates(input: {
  memberStats: unknown
  positionSamples: unknown
  clanAccountIds: Iterable<string>
  identities: Record<string, Identity>
  /** Équipes de l'escouade, imposées (vue tournoi, escouade sans clan suivi) au lieu d'être déduites du clan. */
  teamIds?: Iterable<number>
}): { mates: SquadMateStats[]; mateStatsRows: Record<string, unknown>[] } {
  const clanKeys = new Set(Array.from(input.clanAccountIds, (id) => id.toLowerCase()))
  const stats = parseRows(input.memberStats)

  // `teamId` de memberStats en priorité, sinon celui des positions.
  const teamByKey = new Map<string, number>()
  for (const row of parseRows(input.positionSamples)) {
    const key = toKey(row.memberKey)
    const team = toNumber(row.teamId)
    if (key && team > 0 && !teamByKey.has(key)) teamByKey.set(key, team)
  }
  for (const row of stats) {
    const key = toKey(row.memberKey)
    const team = toNumber(row.teamId)
    if (key && team > 0) teamByKey.set(key, team)
  }

  const squadTeams = new Set<number>(input.teamIds ?? [])
  if (!input.teamIds) {
    for (const key of clanKeys) {
      const team = teamByKey.get(key)
      if (team) squadTeams.add(team)
    }
  }

  const identities = new Map<string, Identity>()
  for (const [accountId, identity] of Object.entries(input.identities)) {
    identities.set(accountId.toLowerCase(), identity)
  }

  const mates: SquadMateStats[] = []
  const mateStatsRows: Record<string, unknown>[] = []
  for (const row of stats) {
    const key = toKey(row.memberKey)
    const team = teamByKey.get(key)
    if (!key || clanKeys.has(key) || !team || !squadTeams.has(team)) continue

    const bot = key.startsWith('ai.')
    const identity = identities.get(key)
    mateStatsRows.push(row)
    mates.push({
      accountId: String(row.memberKey),
      name: identity?.name ?? (bot ? 'Bot' : key.replace(/^account\./, '').slice(0, 8)),
      clanTag: identity?.clanTag ?? null,
      teamId: team,
      bot,
      kills: toNumber(row.kills),
      damage: Math.round(toNumber(row.damageDealt)),
      knockouts: toNumber(row.knockouts),
      revives: toNumber(row.revives),
      recalls: toNumber(row.recalls),
      deaths: toNumber(row.deaths),
      headshots: toNumber(row.headshots),
      damageTaken: Math.round(toNumber(row.damageTaken)),
    })
  }

  mates.sort((left, right) => right.kills - left.kills || right.damage - left.damage || left.name.localeCompare(right.name))
  return { mates, mateStatsRows }
}
