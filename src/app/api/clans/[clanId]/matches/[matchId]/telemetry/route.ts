import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getPhaseLabels } from '@/lib/phase-label-service'
import { getWeaponLabels } from '@/lib/weapon-label-service'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type MatchTelemetryRow = {
  squadMatchId: string
  pubgMatchId: string
  gameMode: string
  mapName: string
  placement: number
  createdAt: Date
  totalKills: number
  totalDamage: number
  totalAssists: number
  totalRevives: number
  status: string
  attemptCount: number
  lastAttemptAt: Date | null
  nextRetryAt: Date | null
  parserVersion: string
  parsedAt: Date
  sourceGeneratedAt: Date | null
  contentLength: number | null
  bytesDownloaded: number | null
  errorCode: string | null
  errorMessage: string | null
  summary: unknown
  weaponStats: unknown
  memberStats: unknown
  positionSamples: unknown
  trajectorySegments: unknown
  deathSamples: unknown
  phaseSnapshots: unknown
  telemetryCreatedAt: Date
  telemetryUpdatedAt: Date
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string; matchId: string }> }
) {
  try {
    const { clanId, matchId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json(buildTelemetryErrorResponse('Invalid clan id', 'INVALID_CLAN_ID'), {
        status: 400,
      })
    }

    const roleError = await requireNavPermission('clan.matches')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    if (!matchId || typeof matchId !== 'string') {
      return NextResponse.json(buildTelemetryErrorResponse('Invalid match id', 'INVALID_MATCH_ID'), {
        status: 400,
      })
    }

    const rows = await prisma.$queryRaw<MatchTelemetryRow[]>(Prisma.sql`
      SELECT
        sm.id AS squadMatchId,
        sm.pubgMatchId,
        sm.gameMode,
        sm.mapName,
        sm.placement,
        sm.createdAt,
        sm.totalKills,
        sm.totalDamage,
        sm.totalAssists,
        sm.totalRevives,
        t.status,
        t.attemptCount,
        t.lastAttemptAt,
        t.nextRetryAt,
        t.parserVersion,
        t.parsedAt,
        t.sourceGeneratedAt,
        t.contentLength,
        t.bytesDownloaded,
        t.errorCode,
        t.errorMessage,
        t.summary,
        t.weaponStats,
        t.memberStats,
        t.positionSamples,
        t.trajectorySegments,
        t.deathSamples,
        t.phaseSnapshots,
        t.createdAt AS telemetryCreatedAt,
        t.updatedAt AS telemetryUpdatedAt
      FROM SquadMatch sm
      INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
      WHERE sm.id = ${matchId}
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
      return NextResponse.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }

    const members = await prisma.squadMember.findMany({
      where: {
        squadMatchId: row.squadMatchId,
        member: {
          clanId: parsedClanId,
        },
      },
      select: {
        memberId: true,
        kills: true,
        damage: true,
        assists: true,
        revives: true,
        placement: true,
        member: {
          select: {
            displayName: true,
            pubgAccountId: true,
          },
        },
      },
      orderBy: {
        memberId: 'asc',
      },
    })

    const telemetryStatus = row.status === 'success' || row.status === 'failed' ? row.status : 'pending'

    const weaponLabels = await getWeaponLabels()
    const phaseLabels = await getPhaseLabels()
    const allTrackedSquadMembers = await prisma.squadMember.findMany({
      where: { squadMatchId: row.squadMatchId },
      select: {
        member: {
          select: {
            displayName: true,
            pubgAccountId: true,
            clanId: true,
            clan: {
              select: {
                tag: true
              }
            }
          }
        }
      }
    })

    const memberIdentityMap: Record<string, { name: string, clanTag?: string, clanId?: number }> = {}

    // First populate from EncounteredPlayer
    const encounteredPlayers = await prisma.encounteredPlayer.findMany({
      where: { clanId: parsedClanId },
      select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
    })

    for (const p of encounteredPlayers) {
      if (p.pubgAccountId) {
        memberIdentityMap[p.pubgAccountId] = {
          name: p.pubgPlayerName,
          clanTag: p.pubgClanTag ?? undefined
        }
      }
    }

    // Then overwrite with actual tracked ClanMember (which has clanId)
    for (const sm of allTrackedSquadMembers) {
      if (sm.member.pubgAccountId) {
        memberIdentityMap[sm.member.pubgAccountId] = {
          name: sm.member.displayName,
          clanTag: sm.member.clan?.tag ?? undefined,
          clanId: sm.member.clanId ?? undefined
        }
      }
    }

    const payload = {
      match: {
        id: row.squadMatchId,
        pubgMatchId: row.pubgMatchId,
        gameMode: row.gameMode,
        mapName: row.mapName,
        placement: row.placement,
        createdAt: row.createdAt.toISOString(),
        totalKills: row.totalKills,
        totalDamage: row.totalDamage,
        totalAssists: row.totalAssists,
        totalRevives: row.totalRevives,
        members: members.map((entry) => ({
          memberId: entry.memberId,
          displayName: entry.member.displayName,
          kills: entry.kills,
          damage: entry.damage,
          assists: entry.assists,
          revives: entry.revives,
          placement: entry.placement,
        })),
      },
      telemetry: {
        status: telemetryStatus,
        attemptCount: row.attemptCount,
        lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
        nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
        parserVersion: row.parserVersion,
        parsedAt: row.parsedAt.toISOString(),
        sourceGeneratedAt: row.sourceGeneratedAt?.toISOString() ?? null,
        contentLength: row.contentLength,
        bytesDownloaded: row.bytesDownloaded,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        summary: row.summary,
        weaponStats: row.weaponStats,
        memberStats: row.memberStats,
        positionSamples: row.positionSamples,
        trajectorySegments: row.trajectorySegments,
        deathSamples: row.deathSamples,
        phaseSnapshots: row.phaseSnapshots,
        createdAt: row.telemetryCreatedAt.toISOString(),
        updatedAt: row.telemetryUpdatedAt.toISOString(),
      },
      weaponLabels,
      phaseLabels,
      memberIdentityMap,
    }

    return NextResponse.json(
      buildTelemetrySuccessResponse(
        {
          scope: 'clan',
          clanId: parsedClanId,
          count: 1,
        },
        payload,
        payload
      )
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry match detail failed:', error)
    return NextResponse.json(buildTelemetryErrorResponse('Failed to load match telemetry detail'), {
      status: 500,
    })
  }
}
