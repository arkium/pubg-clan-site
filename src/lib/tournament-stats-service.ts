/**
 * Chargement des statistiques d'un tournoi (awards, fun facts, armes) pour `GET /api/tournaments/[id]/standings` :
 * compteurs `SquadMember` des manches et télémétrie (`memberStats`, `killFeedSamples`). Le calcul est dans
 * `tournament-stats.ts` (pur, testé) ; ici, seulement les requêtes et la conversion des comptes PUBG en membres.
 */
import { prisma } from '@/lib/prisma'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import {
  computeTournamentAwards,
  computeTournamentWeapons,
  type TournamentAwardsView,
  type TournamentRoundStatRow,
  type TournamentTelemetryRound,
  type TournamentTelemetryWeapon,
  type TournamentWeapon,
} from '@/lib/tournament-stats'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'

type TelemetryMemberRow = {
  memberKey?: unknown
  damageTaken?: unknown
  circleDelaySeconds?: unknown
  weapons?: unknown
}

type KillFeedRow = { killerKey?: unknown; victimKey?: unknown; timestampSeconds?: unknown }

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function readWeapons(value: unknown): TournamentTelemetryWeapon[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((weapon): weapon is Record<string, unknown> => Boolean(weapon) && typeof weapon === 'object')
    .filter((weapon) => typeof weapon.weaponName === 'string')
    .map((weapon) => ({
      weaponName: weapon.weaponName as string,
      kills: number(weapon.kills),
      headshots: number(weapon.headshots),
      damageDealt: number(weapon.damageDealt),
    }))
}

/** Premier kill de la manche dans le kill-feed (tout le lobby), au plus petit horodatage. */
function firstKillOf(feed: unknown, memberOf: (key: unknown) => number | null): TournamentTelemetryRound['firstKill'] {
  if (!Array.isArray(feed)) return null
  const kills = (feed as KillFeedRow[]).filter(
    (row) => row && typeof row === 'object' && typeof row.timestampSeconds === 'number' && typeof row.victimKey === 'string'
  )
  if (kills.length === 0) return null
  const first = kills.reduce((best, row) => ((row.timestampSeconds as number) < (best.timestampSeconds as number) ? row : best))
  return { killerId: memberOf(first.killerKey), victimId: memberOf(first.victimKey) }
}

export async function loadTournamentStats(
  matches: ReadonlyArray<{ id: string; createdAt: Date | string }>,
  eligibleMemberIds: readonly number[],
  memberLabel: (memberId: number) => string
): Promise<{ awards: TournamentAwardsView; weapons: TournamentWeapon[] }> {
  // Mêmes numéros que les manches de la page (`buildRoundViews`) : ordre chronologique, #1 = la plus ancienne.
  const ordered = [...matches].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
  const roundOf = new Map(ordered.map((match, index) => [match.id, index + 1]))
  const matchIds = ordered.map((match) => match.id)
  const eligible = [...new Set(eligibleMemberIds)]
  if (matchIds.length === 0 || eligible.length === 0) {
    return { awards: computeTournamentAwards({ rows: [], telemetry: [], rounds: matchIds.length, memberLabel }), weapons: [] }
  }

  const [memberRows, telemetryRows, accounts, weaponLabels] = await Promise.all([
    prisma.squadMember.findMany({
      where: { squadMatchId: { in: matchIds }, memberId: { in: eligible } },
      select: {
        squadMatchId: true,
        memberId: true,
        kills: true,
        damage: true,
        assists: true,
        revives: true,
        knockouts: true,
        headshotKills: true,
        timeSurvived: true,
        rideDistance: true,
        walkDistance: true,
        swimDistance: true,
        boosts: true,
        heals: true,
        vehicleDestroys: true,
        roadKills: true,
        longestKill: true,
        weaponsAcquired: true,
      },
    }),
    // Colonnes compressées : toujours la `*Gz` avec celle en clair, puis `decodeTelemetryRow` (CLAUDE.md, gotcha 10).
    prisma.squadMatchTelemetry.findMany({
      where: { squadMatchId: { in: matchIds }, status: 'success' },
      select: { squadMatchId: true, memberStats: true, memberStatsGz: true, killFeedSamples: true, killFeedSamplesGz: true },
    }),
    prisma.clanMember.findMany({ where: { id: { in: eligible } }, select: { id: true, pubgAccountId: true } }),
    getWeaponLabels(),
  ])

  const rows: TournamentRoundStatRow[] = memberRows.map(({ squadMatchId, ...row }) => ({ ...row, round: roundOf.get(squadMatchId) ?? 0 }))

  // La télémétrie connaît les joueurs par compte PUBG (`memberKey`) : seuls les players du classement sont gardés.
  const memberByAccount = new Map(accounts.filter((row) => row.pubgAccountId).map((row) => [row.pubgAccountId as string, row.id]))
  const memberOf = (key: unknown) => (typeof key === 'string' ? (memberByAccount.get(key) ?? null) : null)
  const telemetry: TournamentTelemetryRound[] = []
  for (const raw of telemetryRows) {
    const row = decodeTelemetryRow(raw)
    if (!Array.isArray(row.memberStats)) continue
    const members = (row.memberStats as TelemetryMemberRow[]).flatMap((stats) => {
      const memberId = memberOf(stats?.memberKey)
      if (memberId === null) return []
      return [{
        memberId,
        damageTaken: number(stats.damageTaken),
        circleDelaySeconds: number(stats.circleDelaySeconds),
        weapons: readWeapons(stats.weapons),
      }]
    })
    telemetry.push({ round: roundOf.get(row.squadMatchId) ?? 0, members, firstKill: firstKillOf(row.killFeedSamples, memberOf) })
  }
  telemetry.sort((left, right) => left.round - right.round)

  return {
    awards: computeTournamentAwards({ rows, telemetry, rounds: matchIds.length, memberLabel }),
    weapons: computeTournamentWeapons(telemetry, memberLabel, (id) => weaponDisplayName(id, weaponLabels)),
  }
}
