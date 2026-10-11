/**
 * Joueurs non suivis d'un tournoi (demande du 2026-10-11) — docs/features/tournois.md, « Joueurs non suivis ».
 *
 * Une manche ne retient que les joueurs suivis (`ClanMember` actif d'un clan actif) : un joueur inconnu du site ne
 * marque rien et ses kills manquent à sa squad. La télémétrie couvre tout le lobby (`memberStats`, une entrée par
 * compte PUBG avec l'équipe et les kills) : on compare les deux, manche par manche. Le site connaît souvent ces joueurs
 * (adversaires croisés : `Player`, `EncounteredPlayer`), avec leur pseudo et leur clan PUBG.
 *
 * Outil en ligne de commande équivalent : `scripts/tournament-participant-coverage.ts`.
 */
import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { getTournamentMatches } from '@/lib/tournament-service'

/** Entrée de `memberStats` (télémétrie), champs lus ici. */
export type LobbyMemberStat = { memberKey?: string; teamId?: number; kills?: number }

export type UntrackedLobbyPlayer = {
  accountId: string
  /** Manches jouées (numéros chronologiques). */
  rounds: number[]
  kills: number
  /** Coéquipiers suivis, « [TAG] Pseudo » : disent pour quelle squad le joueur a joué. */
  teammates: string[]
}

export type UntrackedPlayer = UntrackedLobbyPlayer & {
  name: string | null
  platformShard: string
  /** Clan PUBG connu du site (adversaire croisé), `null` s'il n'en a pas ou s'il n'est pas encore résolu. */
  pubgClan: { tag: string | null; name: string | null } | null
  /** Clan du site qui suit ce clan PUBG : le joueur y sera ajouté. */
  siteClan: { id: number; tag: string | null; name: string } | null
}

export type UntrackedPlayersReport = {
  roundCount: number
  /** Manches sans télémétrie analysée : impossible d'y vérifier le lobby. */
  roundsWithoutTelemetry: number[]
  players: UntrackedPlayer[]
}

/** Comptes humains seulement : ni bots (`ai.…`) ni animaux (`Monster.Bear-…` sur Dihor Otok). */
function isHumanAccount(memberKey: string | undefined): memberKey is string {
  return !!memberKey && memberKey.toLowerCase().startsWith('account.')
}

/**
 * Partie pure : les joueurs du lobby qui ne sont pas suivis, avec leurs manches, leurs kills et leurs coéquipiers suivis.
 * `stats` vaut `null` pour une manche sans télémétrie. Les plus présents d'abord, puis les plus gros tueurs.
 */
export function collectUntrackedLobbyPlayers(
  rounds: Array<{ round: number; stats: LobbyMemberStat[] | null }>,
  trackedLabels: ReadonlyMap<string, string>
): { players: UntrackedLobbyPlayer[]; roundsWithoutTelemetry: number[] } {
  // Clé en minuscules : un même compte reste un seul joueur, quelle que soit la casse du fichier de télémétrie.
  const byAccount = new Map<string, { accountId: string; rounds: number[]; kills: number; teammates: Set<string> }>()
  const roundsWithoutTelemetry: number[] = []

  for (const { round, stats } of rounds) {
    if (!stats || stats.length === 0) {
      roundsWithoutTelemetry.push(round)
      continue
    }
    const humans = stats.filter((stat) => isHumanAccount(stat.memberKey))
    for (const stat of humans) {
      const key = stat.memberKey!.toLowerCase()
      if (trackedLabels.has(key)) continue
      const entry = byAccount.get(key) ?? { accountId: stat.memberKey!, rounds: [], kills: 0, teammates: new Set<string>() }
      if (!entry.rounds.includes(round)) entry.rounds.push(round)
      entry.kills += stat.kills ?? 0
      for (const mate of humans) {
        const label = mate.teamId === stat.teamId ? trackedLabels.get(mate.memberKey!.toLowerCase()) : undefined
        if (label) entry.teammates.add(label)
      }
      byAccount.set(key, entry)
    }
  }

  const players = [...byAccount.values()]
    .map((entry) => ({ accountId: entry.accountId, rounds: entry.rounds, kills: entry.kills, teammates: [...entry.teammates] }))
    .sort((left, right) => right.rounds.length - left.rounds.length || right.kills - left.kills)
  return { players, roundsWithoutTelemetry }
}

export async function listTournamentUntrackedPlayers(tournamentId: string): Promise<UntrackedPlayersReport> {
  const matches = [...(await getTournamentMatches(tournamentId))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const [tracked, telemetry] = await Promise.all([
    prisma.clanMember.findMany({
      where: { isActive: true, clan: { isActive: true }, pubgAccountId: { not: null } },
      select: { pubgAccountId: true, displayName: true, clan: { select: { tag: true } } },
    }),
    prisma.squadMatchTelemetry.findMany({
      where: { squadMatchId: { in: matches.map((match) => match.id) }, status: 'success' },
      select: { squadMatchId: true, memberStats: true, memberStatsGz: true },
    }),
  ])
  const trackedLabels = new Map(
    tracked.map((member) => [member.pubgAccountId!.toLowerCase(), `[${member.clan?.tag ?? '?'}] ${member.displayName}`])
  )
  const statsByMatch = new Map(
    telemetry.map((row) => [row.squadMatchId, (decodeTelemetryRow(row).memberStats as LobbyMemberStat[] | null) ?? null])
  )

  const { players, roundsWithoutTelemetry } = collectUntrackedLobbyPlayers(
    matches.map((match, index) => ({ round: index + 1, stats: statsByMatch.get(match.id) ?? null })),
    trackedLabels
  )
  if (players.length === 0) return { roundCount: matches.length, roundsWithoutTelemetry, players: [] }

  // Pseudo et clan PUBG : ce que le site sait déjà de ces adversaires.
  const accountIds = players.map((player) => player.accountId)
  const [known, encountered] = await Promise.all([
    prisma.player.findMany({
      where: { pubgAccountId: { in: accountIds } },
      select: {
        pubgAccountId: true,
        pubgPlayerName: true,
        platformShard: true,
        opponentClan: { select: { pubgClanId: true, tag: true, name: true } },
      },
    }),
    prisma.encounteredPlayer.findMany({
      where: { pubgAccountId: { in: accountIds } },
      select: { pubgAccountId: true, pubgPlayerName: true, platformShard: true, pubgClanId: true, pubgClanTag: true, pubgClanName: true },
    }),
  ])
  const pubgClanIds = [
    ...new Set(
      [...known.map((entry) => entry.opponentClan?.pubgClanId), ...encountered.map((entry) => entry.pubgClanId)].filter(
        (id): id is string => !!id
      )
    ),
  ]
  const siteClans = pubgClanIds.length
    ? await prisma.clan.findMany({
        where: { pubgClanId: { in: pubgClanIds }, isActive: true, archivedAt: null },
        select: { id: true, tag: true, name: true, pubgClanId: true },
      })
    : []

  return {
    roundCount: matches.length,
    roundsWithoutTelemetry,
    players: players.map((player) => {
      const fromPlayer = known.find((entry) => entry.pubgAccountId === player.accountId)
      const fromEncounter = encountered.find((entry) => entry.pubgAccountId === player.accountId)
      const pubgClanId = fromPlayer?.opponentClan?.pubgClanId ?? fromEncounter?.pubgClanId ?? null
      const siteClan = siteClans.find((clan) => clan.pubgClanId === pubgClanId)
      return {
        ...player,
        name: fromPlayer?.pubgPlayerName ?? fromEncounter?.pubgPlayerName ?? null,
        platformShard: fromPlayer?.platformShard ?? fromEncounter?.platformShard ?? 'steam',
        pubgClan: fromPlayer?.opponentClan
          ? { tag: fromPlayer.opponentClan.tag, name: fromPlayer.opponentClan.name }
          : fromEncounter?.pubgClanTag || fromEncounter?.pubgClanName
            ? { tag: fromEncounter.pubgClanTag, name: fromEncounter.pubgClanName }
            : null,
        siteClan: siteClan ? { id: siteClan.id, tag: siteClan.tag, name: siteClan.name } : null,
      }
    }),
  }
}
