import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { mapAssetUrl, resolveGameMode, resolveMapAssetKey, resolveMapName } from '@/lib/pubg-assets'
import { buildTelemetryErrorResponse } from '@/lib/pubg-telemetry/api-contract'
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
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type ReplayRow = {
  squadMatchId: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  placement: number
  createdAt: Date
  positionSamples: unknown
  deathSamples: unknown
  landingSamples: unknown
  knockoutSamples: unknown
  reviveSamples: unknown
  phaseSnapshots: unknown
  vehicleSamples: unknown
  summary: unknown
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; matchId: string }> }
) {
  try {
    const { clanId, matchId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireNavPermission('clan.matches')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    if (!matchId || typeof matchId !== 'string') {
      return Response.json(buildTelemetryErrorResponse('Invalid match id', 'INVALID_MATCH_ID'), {
        status: 400,
      })
    }

    const rows = await prisma.$queryRaw<ReplayRow[]>(Prisma.sql`
      SELECT
        sm.id AS squadMatchId,
        sm.pubgMatchId,
        sm.gameMode,
        sm.mapName,
        sm.placement,
        sm.createdAt,
        t.positionSamples,
        t.deathSamples,
        t.landingSamples,
        t.knockoutSamples,
        t.reviveSamples,
        t.phaseSnapshots,
        t.vehicleSamples,
        t.summary
      FROM SquadMatch sm
      INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
      WHERE sm.id = ${matchId}
        AND t.status = 'success'
        AND EXISTS (
          SELECT 1
          FROM SquadMember sdm
          INNER JOIN ClanMember cm ON cm.id = sdm.memberId
          WHERE sdm.squadMatchId = sm.id
            AND cm.clanId = ${parsedClanId}
        )
      LIMIT 1
    `)

    const row = rows[0]

    if (!row) {
      return Response.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }

    const memberKeys = collectLobbyAccountIds(
      row.positionSamples,
      row.landingSamples,
      row.deathSamples,
      row.knockoutSamples,
      row.reviveSamples
    )

    const [clan, clanMembers, globalPlayers, encounteredPlayers, killEvents] = await Promise.all([
      prisma.clan.findUnique({
        where: { id: parsedClanId },
        select: { tag: true },
      }),
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
      identities.set(key, {
        name: player.pubgPlayerName,
        clanTag: player.pubgClanTag,
        clanId: null,
      })
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
    const jumps = Array.from(
      extractInitialJumps(row.vehicleSamples, matchStartEpochSeconds).values()
    )

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
      currentClanId: parsedClanId,
      currentClanTag: clan?.tag ?? null,
      identities,
      positionSamples: row.positionSamples,
      deathSamples: row.deathSamples,
      landingSamples: row.landingSamples,
      knockoutSamples: row.knockoutSamples,
      reviveSamples: row.reviveSamples,
      phaseSnapshots: row.phaseSnapshots,
      vehicleSamples: row.vehicleSamples,
      summary: row.summary,
      killEvents: killEvents as ReplayKillEventInput[],
      flightPath:
        computeFlightPathFromJumps(jumps, row.mapName) ??
        computeFlightPath(row.landingSamples, row.mapName),
    })

    // Les positions sont purgeables depuis l'admin base de données : sans elles,
    // le match reste consultable mais n'a plus de replay à jouer.
    if (payload.players.length === 0) {
      return Response.json(
        buildTelemetryErrorResponse(
          'Aucune position enregistrée pour ce match — le replay est indisponible (télémétrie de géolocalisation purgée ou match trop ancien).',
          'REPLAY_NO_POSITIONS'
        ),
        { status: 404 }
      )
    }

    return Response.json(
      {
        ok: true,
        data: {
          ...payload,
          match: {
            ...payload.match,
            mapAssetUrl: mapAssetUrl(row.mapName),
          },
        },
      },
      {
        // La télémétrie d'un match parsé ne change plus : un cache privé court
        // évite de reconstruire le payload à chaque aller-retour d'onglet.
        headers: { 'Cache-Control': 'private, max-age=300' },
      }
    )
  } catch (error) {
    console.error('Match replay payload failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to build match replay'), {
      status: 500,
    })
  }
}
