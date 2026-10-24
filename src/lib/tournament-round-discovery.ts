/**
 * Découverte des manches d'un tournoi — docs/features/tournois.md, « Synchronisation PUBG ».
 *
 * PUBG ne liste une partie que chez ses participants : l'organisateur qui l'a regardée en observateur (ou hébergée sans
 * jouer) ne la voit pas dans ses propres parties. La synchronisation lit donc les parties des joueurs du clan
 * organisateur — celui qui clique, ceux déjà vus dans une manche, puis les plus récemment actifs — et retient les
 * parties personnalisées jouées dans la fenêtre du tournoi, quel que soit leur format (solo, duo, squad…).
 *
 * Coût : les listes se lisent 10 joueurs par appel ; une partie n'est lue (une place dans la file PUBG à 10 requêtes par
 * minute) que si sa date est inconnue et qu'elle peut tomber dans la fenêtre. Les listes PUBG vont de la plus récente à
 * la plus ancienne : le parcours d'un joueur s'arrête à la première partie antérieure au début du tournoi.
 */
import { prisma } from '@/lib/prisma'
import { fetchMatchOverview, fetchRecentMatchIdsForPlayers, type PubgApiCallContext } from '@/lib/pubg'

/** Joueurs du clan organisateur lus à chaque synchronisation : deux appels groupés. */
export const DISCOVERY_MEMBER_LIMIT = 20
/** Parties de date inconnue lues au plus par synchronisation ; la suivante reprend où celle-ci s'est arrêtée. */
export const DISCOVERY_MATCH_READ_LIMIT = 12
/** PUBG ne garde la liste des parties d'un joueur que 14 jours. */
const PUBG_MATCH_LIST_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

export type DiscoveryMember = {
  id: number
  pubgAccountId: string
  platformShard: string
  lastMatchAt: Date | null
}

/** Date et type d'une partie : tout ce qu'il faut pour savoir si elle est une manche du tournoi. */
export type MatchMoment = { createdAt: number; matchType: string }

export type DiscoveryWindow = { startAt: number; endAt: number }

/**
 * Ordre de lecture des joueurs : celui qui clique, ceux déjà vus dans une manche du tournoi (ils jouent la suivante),
 * puis les plus récemment actifs. Au-delà de `limit`, un joueur n'est pas lu : ses coéquipiers du clan le sont.
 */
export function pickDiscoveryMembers(
  members: DiscoveryMember[],
  input: { actorMemberId: number | null; roundMemberIds: ReadonlySet<number> },
  limit = DISCOVERY_MEMBER_LIMIT
): DiscoveryMember[] {
  const priority = (member: DiscoveryMember) =>
    member.id === input.actorMemberId ? 0 : input.roundMemberIds.has(member.id) ? 1 : 2
  return [...members]
    .sort(
      (left, right) =>
        priority(left) - priority(right) ||
        (right.lastMatchAt?.getTime() ?? 0) - (left.lastMatchAt?.getTime() ?? 0) ||
        left.id - right.id
    )
    .slice(0, limit)
}

/** La première partie de date connue après `index` dans la liste (donc plus ancienne). */
function nextKnownOlder(matchIds: string[], index: number, known: ReadonlyMap<string, MatchMoment>) {
  for (let cursor = index + 1; cursor < matchIds.length; cursor += 1) {
    const moment = known.get(matchIds[cursor])
    if (moment) return moment
  }
  return null
}

export type MatchListWalk = {
  /** Parties personnalisées jouées dans la fenêtre. */
  rounds: string[]
  /** Le budget de lecture s'est épuisé avant la fin du parcours. */
  truncated: boolean
}

/**
 * Parcourt la liste PUBG d'un joueur, de la plus récente à la plus ancienne. Une partie de date inconnue n'est lue
 * (`read`) que si elle peut tomber dans la fenêtre : inutile quand une partie connue plus ancienne est encore postérieure
 * à la fin. Le parcours s'arrête à la première partie antérieure au début. `known` est complété par les lectures.
 */
export async function walkMatchList(
  matchIds: string[],
  known: Map<string, MatchMoment>,
  window: DiscoveryWindow,
  read: (matchId: string) => Promise<MatchMoment | null>,
  budget: { remaining: number }
): Promise<MatchListWalk> {
  const rounds: string[] = []
  for (let index = 0; index < matchIds.length; index += 1) {
    const matchId = matchIds[index]
    let moment = known.get(matchId) ?? null
    if (!moment) {
      const older = nextKnownOlder(matchIds, index, known)
      if (older && older.createdAt > window.endAt) continue
      if (budget.remaining <= 0) return { rounds, truncated: true }
      budget.remaining -= 1
      moment = await read(matchId)
      if (!moment) continue
      known.set(matchId, moment)
    }
    if (moment.createdAt < window.startAt) break
    if (moment.createdAt <= window.endAt && moment.matchType === 'custom') rounds.push(matchId)
  }
  return { rounds, truncated: false }
}

// Dates déjà lues chez PUBG, gardées d'une synchronisation à l'autre (relance automatique chaque minute) : une partie
// hors de la fenêtre n'est pas enregistrée en base par la synchronisation, elle serait sinon relue à chaque fois.
const MATCH_MOMENT_CACHE_LIMIT = 5000

const globalForMatchMoments = globalThis as typeof globalThis & {
  tournamentMatchMoments?: Map<string, MatchMoment>
}

function rememberMoment(matchId: string, moment: MatchMoment) {
  const cache = (globalForMatchMoments.tournamentMatchMoments ??= new Map())
  cache.set(matchId, moment)
  if (cache.size > MATCH_MOMENT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

async function loadKnownMoments(matchIds: string[]) {
  const known = new Map<string, MatchMoment>(globalForMatchMoments.tournamentMatchMoments ?? [])
  if (matchIds.length === 0) return known
  const [memberRows, squadRows] = await Promise.all([
    prisma.match.findMany({
      where: { pubgMatchId: { in: matchIds } },
      select: { pubgMatchId: true, pubgCreatedAt: true, matchType: true },
      distinct: ['pubgMatchId'],
    }),
    prisma.squadMatch.findMany({
      where: { pubgMatchId: { in: matchIds } },
      select: { pubgMatchId: true, createdAt: true, matchType: true },
    }),
  ])
  for (const row of memberRows) known.set(row.pubgMatchId, { createdAt: row.pubgCreatedAt.getTime(), matchType: row.matchType })
  for (const row of squadRows) known.set(row.pubgMatchId, { createdAt: row.createdAt.getTime(), matchType: row.matchType })
  return known
}

export type TournamentRoundDiscovery = {
  /** Joueurs du clan organisateur dont la liste PUBG a été lue. */
  membersRead: number
  /** Parties lues chez PUBG pour connaître leur date. */
  matchesRead: number
  truncated: boolean
  /** Parties personnalisées de la fenêtre, avec le shard où les lire. */
  rounds: Array<{ pubgMatchId: string; shard: string }>
  errors: string[]
}

const EMPTY_DISCOVERY: TournamentRoundDiscovery = { membersRead: 0, matchesRead: 0, truncated: false, rounds: [], errors: [] }

export async function discoverTournamentRounds(input: {
  organizerClanId: number
  startAt: Date
  endAt: Date
  actorMemberId: number | null
  roundMemberIds: ReadonlySet<number>
  now?: Date
}): Promise<TournamentRoundDiscovery> {
  const now = (input.now ?? new Date()).getTime()
  const window = { startAt: input.startAt.getTime(), endAt: input.endAt.getTime() }
  // Avant le début, rien ne peut compter ; 14 jours après la fin, PUBG ne liste plus les parties.
  if (now < window.startAt || now - window.endAt > PUBG_MATCH_LIST_RETENTION_MS) return EMPTY_DISCOVERY

  const candidates = await prisma.clanMember.findMany({
    where: { clanId: input.organizerClanId, isActive: true, pubgAccountId: { not: null } },
    select: { id: true, pubgAccountId: true, platformShard: true, lastMatchAt: true },
  })
  const members = pickDiscoveryMembers(
    candidates.map((member) => ({ ...member, pubgAccountId: member.pubgAccountId! })),
    input
  )
  if (members.length === 0) return EMPTY_DISCOVERY

  const context: PubgApiCallContext = { clanId: input.organizerClanId, source: 'tournament-sync' }
  const errors: string[] = []
  const lists: Array<{ member: DiscoveryMember; matchIds: string[] }> = []
  const shards = Array.from(new Set(members.map((member) => member.platformShard)))
  for (const shard of shards) {
    const shardMembers = members.filter((member) => member.platformShard === shard)
    try {
      const matchIdsByAccount = await fetchRecentMatchIdsForPlayers(
        shardMembers.map((member) => member.pubgAccountId),
        shard,
        context
      )
      for (const member of shardMembers) {
        lists.push({ member, matchIds: matchIdsByAccount.get(member.pubgAccountId) ?? [] })
      }
    } catch (error) {
      errors.push(`players ${shard}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const known = await loadKnownMoments(Array.from(new Set(lists.flatMap((list) => list.matchIds))))
  const budget = { remaining: DISCOVERY_MATCH_READ_LIMIT }
  const rounds = new Map<string, string>()
  let truncated = false

  for (const { member, matchIds } of lists) {
    const read = async (matchId: string): Promise<MatchMoment | null> => {
      try {
        const overview = await fetchMatchOverview(matchId, member.platformShard, context)
        const moment = { createdAt: new Date(overview.createdAt).getTime(), matchType: overview.matchType }
        rememberMoment(matchId, moment)
        return moment
      } catch (error) {
        errors.push(`${matchId}: ${error instanceof Error ? error.message : String(error)}`)
        return null
      }
    }
    const walk = await walkMatchList(matchIds, known, window, read, budget)
    for (const matchId of walk.rounds) if (!rounds.has(matchId)) rounds.set(matchId, member.platformShard)
    truncated ||= walk.truncated
  }

  return {
    membersRead: lists.length,
    matchesRead: DISCOVERY_MATCH_READ_LIMIT - budget.remaining,
    truncated,
    rounds: Array.from(rounds, ([pubgMatchId, shard]) => ({ pubgMatchId, shard })),
    errors,
  }
}
