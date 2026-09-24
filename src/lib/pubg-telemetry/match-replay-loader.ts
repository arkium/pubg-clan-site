import { Prisma } from '@prisma/client'

import { decodeGeoColumn } from '@/lib/pubg-telemetry/geo-codec'
import { prisma } from '@/lib/prisma'
import { mapAssetUrl, resolveGameMode, resolveMapAssetKey, resolveMapName } from '@/lib/pubg-assets'
import { computeFlightPath, computeFlightPathFromJumps } from '@/lib/pubg-telemetry/flight-path'
import {
  buildMatchReplayPayload,
  collectLobbyAccountIds,
  extractInitialJumps,
  normalizeReplayKey,
  type ReplayIdentity,
  type ReplayKillEventInput,
} from '@/lib/pubg-telemetry/match-replay'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'

/**
 * Chargement du Replay 2D d'un match, partagé par la vue clan et la vue tournoi.
 * Vue clan : `accessClanId` restreint aux matchs du clan et `currentClanId` le met en avant.
 * Vue tournoi : aucun des deux — l'escouade suivie est choisie côté client (`focusTeamId`).
 */
type ReplayRow = {
  squadMatchId: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  placement: number
  createdAt: Date
  positionSamples: unknown
  positionSamplesGz: unknown
  deathSamples: unknown
  landingSamples: unknown
  knockoutSamples: unknown
  reviveSamples: unknown
  phaseSnapshots: unknown
  vehicleSamples: unknown
  summary: unknown
  killFeedSamples: unknown
  carePackageSamples: unknown
}

export type MatchReplayLoadResult =
  | { status: 'ok'; data: ReturnType<typeof buildMatchReplayPayload> & { match: { mapAssetUrl: string | null } } }
  | { status: 'not_found' }
  | { status: 'no_positions' }

export async function loadMatchReplay(input: {
  matchId: string
  accessClanId?: number
  currentClanId: number | null
}): Promise<MatchReplayLoadResult> {
  const rows = await prisma.$queryRaw<ReplayRow[]>(Prisma.sql`
    SELECT
      sm.id AS squadMatchId,
      sm.pubgMatchId,
      sm.gameMode,
      sm.mapName,
      sm.placement,
      sm.createdAt,
      t.positionSamples,
      t.positionSamplesGz,
      t.deathSamples,
      t.landingSamples,
      t.knockoutSamples,
      t.reviveSamples,
      t.phaseSnapshots,
      t.vehicleSamples,
      t.summary,
      t.killFeedSamples,
      t.carePackageSamples
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE sm.id = ${input.matchId}
      AND t.status = 'success'
      ${input.accessClanId
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM SquadMember sdm
            INNER JOIN ClanMember cm ON cm.id = sdm.memberId
            WHERE sdm.squadMatchId = sm.id
              AND cm.clanId = ${input.accessClanId}
          )`
        : Prisma.empty}
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) return { status: 'not_found' }

  // Les deux formats de stockage coexistent le temps du rattrapage : toujours decoder.
  const positionSamples = decodeGeoColumn(row.positionSamplesGz, row.positionSamples)

  const memberKeys = collectLobbyAccountIds(
    positionSamples,
    row.landingSamples,
    row.deathSamples,
    row.knockoutSamples,
    row.reviveSamples
  )

  const [clan, clanMembers, globalPlayers, encounteredPlayers, killEvents] = await Promise.all([
    input.currentClanId
      ? prisma.clan.findUnique({ where: { id: input.currentClanId }, select: { tag: true } })
      : Promise.resolve(null),
    prisma.clanMember.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: {
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
        clanId: true,
        clan: { select: { tag: true } },
      },
    }),
    prisma.player.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: {
        pubgAccountId: true,
        pubgPlayerName: true,
        opponentClan: { select: { tag: true } },
      },
    }),
    prisma.encounteredPlayer.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
    }),
    prisma.killEvent.findMany({
      where: { squadMatchId: row.squadMatchId },
      select: {
        id: true,
        killerAccountId: true,
        killerRawKey: true,
        victimAccountId: true,
        victimRawKey: true,
        weaponName: true,
        distance: true,
        headshot: true,
        timestampSeconds: true,
      },
      orderBy: { timestampSeconds: 'asc' },
    }),
  ])

  // Priorité croissante : joueur croisé < identité globale < membre d'un clan suivi.
  const identities = new Map<string, ReplayIdentity>()

  for (const player of encounteredPlayers) {
    const key = normalizeReplayKey(player.pubgAccountId)
    if (!key) continue
    identities.set(key, { name: player.pubgPlayerName, clanTag: player.pubgClanTag, clanId: null })
  }

  for (const player of globalPlayers) {
    const key = normalizeReplayKey(player.pubgAccountId)
    if (!key) continue
    identities.set(key, {
      name: player.pubgPlayerName,
      clanTag: player.opponentClan?.tag ?? identities.get(key)?.clanTag ?? null,
      clanId: null,
    })
  }

  for (const member of clanMembers) {
    const key = normalizeReplayKey(member.pubgAccountId)
    if (!key) continue
    identities.set(key, {
      name: member.displayName || member.pubgPlayerName,
      clanTag: member.clan?.tag ?? null,
      clanId: member.clanId,
    })
  }

  const bounds = getMapBounds(row.mapName)
  const matchStartEpochSeconds = row.createdAt.getTime() / 1000
  const jumps = Array.from(extractInitialJumps(row.vehicleSamples, matchStartEpochSeconds).values())

  const payload = buildMatchReplayPayload({
    match: {
      squadMatchId: row.squadMatchId,
      pubgMatchId: row.pubgMatchId,
      mapName: row.mapName,
      mapAssetKey: resolveMapAssetKey(row.mapName),
      mapLabel: resolveMapName(row.mapName),
      mapWidth: bounds.width,
      mapHeight: bounds.height,
      gameMode: resolveGameMode(row.gameMode),
      placement: row.placement,
      createdAt: row.createdAt,
    },
    matchStartEpochSeconds,
    currentClanId: input.currentClanId,
    currentClanTag: clan?.tag ?? null,
    identities,
    positionSamples,
    deathSamples: row.deathSamples,
    landingSamples: row.landingSamples,
    knockoutSamples: row.knockoutSamples,
    reviveSamples: row.reviveSamples,
    phaseSnapshots: row.phaseSnapshots,
    vehicleSamples: row.vehicleSamples,
    summary: row.summary,
    killFeedSamples: row.killFeedSamples,
    carePackageSamples: row.carePackageSamples,
    killEvents: killEvents as ReplayKillEventInput[],
    flightPath: computeFlightPathFromJumps(jumps, row.mapName) ?? computeFlightPath(row.landingSamples, row.mapName),
  })

  // Les positions sont purgeables depuis l'admin base de données : sans elles,
  // le match reste consultable mais n'a plus de replay à jouer.
  if (payload.players.length === 0) return { status: 'no_positions' }

  return {
    status: 'ok',
    data: { ...payload, match: { ...payload.match, mapAssetUrl: mapAssetUrl(row.mapName) } },
  }
}

export const REPLAY_NO_POSITIONS_MESSAGE =
  'Aucune position enregistrée pour ce match — le replay est indisponible (télémétrie de géolocalisation purgée ou match trop ancien).'
