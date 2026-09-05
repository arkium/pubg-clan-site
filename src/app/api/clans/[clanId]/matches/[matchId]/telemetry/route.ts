import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireNavPermission } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'
import {
  buildTelemetryErrorResponse,
  buildTelemetrySuccessResponse,
} from '@/lib/pubg-telemetry/api-contract'
import { getPhaseLabels } from '@/lib/phase-label-service'
import { getWeaponLabels } from '@/lib/weapon-label-service'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function safeJsonParse(value: unknown, fallback: any = []): any {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
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
  knockoutSamples: unknown
  reviveSamples: unknown
  landingSamples: unknown
  telemetryCreatedAt: Date
  telemetryUpdatedAt: Date
}

function computeFlightPath(landingSamples: unknown, mapName?: string) {
  let parsed = landingSamples
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!Array.isArray(parsed) || parsed.length < 2) {
    return null
  }

  const valid = parsed
    .filter((p): p is { x: number; y: number; timestampSeconds: number } => {
      return (
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).x === 'number' &&
        typeof (p as Record<string, unknown>).y === 'number' &&
        typeof (p as Record<string, unknown>).timestampSeconds === 'number'
      )
    })
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)

  if (valid.length < 2) {
    return null
  }

  // Filter out late respawns (Blue Chip recalls / Emergency pickups beyond initial drop window)
  const t0 = valid[0].timestampSeconds
  const initialLandings = valid.filter((p) => p.timestampSeconds - t0 <= 80)
  const samplePool = initialLandings.length >= 2 ? initialLandings : valid

  const k = Math.max(2, Math.floor(samplePool.length * 0.15))
  const earliest = samplePool.slice(0, k)
  const latest = samplePool.slice(-k)

  const dropStart = {
    x: Math.round(earliest.reduce((sum, p) => sum + p.x, 0) / earliest.length),
    y: Math.round(earliest.reduce((sum, p) => sum + p.y, 0) / earliest.length),
  }
  const dropEnd = {
    x: Math.round(latest.reduce((sum, p) => sum + p.x, 0) / latest.length),
    y: Math.round(latest.reduce((sum, p) => sum + p.y, 0) / latest.length),
  }

  const dx = dropEnd.x - dropStart.x
  const dy = dropEnd.y - dropStart.y
  const angleDeg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10

  // Extrapolate flight path across full map boundaries [0, width] x [0, height]
  let entry = dropStart
  let exit = dropEnd

  if (mapName && (dx !== 0 || dy !== 0)) {
    const bounds = getMapBounds(mapName)
    const width = bounds.width
    const height = bounds.height
    const candidates: { t: number; x: number; y: number }[] = []

    if (dx !== 0) {
      const tLeft = (0 - dropStart.x) / dx
      const yLeft = dropStart.y + tLeft * dy
      if (yLeft >= -1000 && yLeft <= height + 1000) {
        candidates.push({ t: tLeft, x: 0, y: Math.max(0, Math.min(height, yLeft)) })
      }
      const tRight = (width - dropStart.x) / dx
      const yRight = dropStart.y + tRight * dy
      if (yRight >= -1000 && yRight <= height + 1000) {
        candidates.push({ t: tRight, x: width, y: Math.max(0, Math.min(height, yRight)) })
      }
    }

    if (dy !== 0) {
      const tTop = (0 - dropStart.y) / dy
      const xTop = dropStart.x + tTop * dx
      if (xTop >= -1000 && xTop <= width + 1000) {
        candidates.push({ t: tTop, x: Math.max(0, Math.min(width, xTop)), y: 0 })
      }
      const tBottom = (height - dropStart.y) / dy
      const xBottom = dropStart.x + tBottom * dx
      if (xBottom >= -1000 && xBottom <= width + 1000) {
        candidates.push({ t: tBottom, x: Math.max(0, Math.min(width, xBottom)), y: height })
      }
    }

    if (candidates.length >= 2) {
      candidates.sort((a, b) => a.t - b.t)
      entry = { x: Math.round(candidates[0].x), y: Math.round(candidates[0].y) }
      exit = { x: Math.round(candidates[candidates.length - 1].x), y: Math.round(candidates[candidates.length - 1].y) }
    }
  }

  return {
    start: entry,
    end: exit,
    dropStart,
    dropEnd,
    angleDeg,
  }
}

type PlayerAffiliation = 'current_clan' | 'tracked_clan' | 'external'

function resolvePlayer(params: {
  member?: {
    displayName?: string | null
    clanId?: number | null
    clan?: { tag?: string | null } | null
  } | null
  accountId?: string | null
  clanId: number
  clanTag: string
  clanAccountIds: Set<string>
  memberIdentityMap: Record<string, { name: string; clanTag?: string; clanId?: number }>
  fallbackName: string
}): {
  name: string
  clanTag: string | null
  affiliation: PlayerAffiliation
  isClan: boolean
  isTrackedClan: boolean
} {
  const { member, accountId, clanId, clanTag, clanAccountIds, memberIdentityMap, fallbackName } = params

  const identity = accountId ? memberIdentityMap[accountId] : undefined
  const pClanId = member?.clanId ?? identity?.clanId
  const isCurrentClan = Boolean(
    pClanId === clanId ||
    (accountId && clanAccountIds.has(accountId))
  )

  const isTrackedClan = Boolean(
    !isCurrentClan && pClanId && pClanId !== clanId
  )

  const name = member?.displayName ?? identity?.name ?? accountId ?? fallbackName
  const tag = isCurrentClan
    ? clanTag
    : (member?.clan?.tag ?? identity?.clanTag ?? null)

  const affiliation: PlayerAffiliation = isCurrentClan
    ? 'current_clan'
    : isTrackedClan
    ? 'tracked_clan'
    : 'external'

  return {
    name,
    clanTag: tag,
    affiliation,
    isClan: isCurrentClan,
    isTrackedClan,
  }
}

function buildMatchCombatEvents(params: {
  matchStartEpoch: number
  clanTag: string
  clanId: number
  clanAccountIds: Set<string>
  memberIdentityMap: Record<string, { name: string; clanTag?: string; clanId?: number }>
  phaseSnapshots: any[]
  killEvents: any[]
  knockoutSamples: any[]
  reviveSamples: any[]
}) {
  const {
    matchStartEpoch,
    clanTag,
    clanId,
    clanAccountIds,
    memberIdentityMap,
    phaseSnapshots,
    killEvents,
    knockoutSamples,
    reviveSamples,
  } = params

  function getPhase(elapsed: number): number {
    for (const snap of phaseSnapshots) {
      if (snap.timestampSeconds >= elapsed && snap.isGame >= 1) {
        return Math.floor(snap.isGame)
      }
    }
    if (phaseSnapshots.length > 0) {
      const last = phaseSnapshots[phaseSnapshots.length - 1]
      return Math.max(1, Math.floor(last.isGame || 1))
    }
    return 1
  }

  const events: any[] = []

  // 1. Kills
  for (const k of killEvents) {
    const elapsed = Math.max(
      0,
      Math.floor(k.timestampSeconds > 100000 ? k.timestampSeconds - matchStartEpoch : k.timestampSeconds)
    )
    const killer = resolvePlayer({
      member: k.killerMember,
      accountId: k.killerAccountId,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Inconnu',
    })
    const victim = resolvePlayer({
      member: k.victimMember,
      accountId: k.victimAccountId,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Inconnu',
    })

    events.push({
      id: `kill-${k.id}`,
      type: 'kill',
      timestamp: elapsed,
      phaseNumber: getPhase(elapsed),
      actorName: killer.name,
      actorClanTag: killer.clanTag,
      actorAffiliation: killer.affiliation,
      targetName: victim.name,
      targetClanTag: victim.clanTag,
      targetAffiliation: victim.affiliation,
      weaponName: k.weaponName,
      damageReason: k.headshot ? 'HeadShot' : 'Torso',
      distanceMeters: Math.round((k.distance || 0) / 100),
      isClanActor: killer.isClan,
      isClanTarget: victim.isClan,
      isTrackedClanActor: killer.isTrackedClan,
      isTrackedClanTarget: victim.isTrackedClan,
    })
  }

  // 2. Knockouts (paired by timestamp)
  const knByTime = new Map<number, { phase?: number; knocker?: any; victim?: any }>()
  for (const kn of knockoutSamples) {
    if (!knByTime.has(kn.timestampSeconds)) knByTime.set(kn.timestampSeconds, { phase: kn.phase })
    const entry = knByTime.get(kn.timestampSeconds)!
    if (kn.role === 'knocker') entry.knocker = kn
    else if (kn.role === 'victim') entry.victim = kn
  }

  let knIdx = 0
  for (const [ts, pair] of knByTime.entries()) {
    knIdx++
    const elapsed = Math.max(0, Math.floor(ts > 100000 ? ts - matchStartEpoch : ts))
    const knockerAcc = pair.knocker?.memberKey
    const victimAcc = pair.victim?.memberKey

    const knocker = resolvePlayer({
      accountId: knockerAcc,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Adversaire',
    })
    const victim = resolvePlayer({
      accountId: victimAcc,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Cible',
    })

    let dist = 0
    if (pair.knocker?.x && pair.victim?.x) {
      const dx = pair.knocker.x - pair.victim.x
      const dy = pair.knocker.y - pair.victim.y
      dist = Math.round(Math.sqrt(dx * dx + dy * dy) / 100)
    }

    events.push({
      id: `knock-${knIdx}`,
      type: 'knock',
      timestamp: elapsed,
      phaseNumber: Math.max(1, Math.floor(pair.phase || getPhase(elapsed))),
      actorName: knocker.name,
      actorClanTag: knocker.clanTag,
      actorAffiliation: knocker.affiliation,
      targetName: victim.name,
      targetClanTag: victim.clanTag,
      targetAffiliation: victim.affiliation,
      weaponName: pair.knocker?.damageCauser || 'Arme',
      damageReason: pair.knocker?.damageReason || 'Combat',
      distanceMeters: dist,
      isClanActor: knocker.isClan,
      isClanTarget: victim.isClan,
      isTrackedClanActor: knocker.isTrackedClan,
      isTrackedClanTarget: victim.isTrackedClan,
    })
  }

  // 3. Revives (paired by timestamp)
  const rvByTime = new Map<number, { phase?: number; reviver?: any; revived?: any }>()
  for (const rv of reviveSamples) {
    if (!rvByTime.has(rv.timestampSeconds)) rvByTime.set(rv.timestampSeconds, { phase: rv.phase })
    const entry = rvByTime.get(rv.timestampSeconds)!
    if (rv.role === 'reviver') entry.reviver = rv
    else if (rv.role === 'revived') entry.revived = rv
  }

  let rvIdx = 0
  for (const [ts, pair] of rvByTime.entries()) {
    rvIdx++
    const elapsed = Math.max(0, Math.floor(ts > 100000 ? ts - matchStartEpoch : ts))
    const reviverAcc = pair.reviver?.memberKey
    const revivedAcc = pair.revived?.memberKey

    const reviver = resolvePlayer({
      accountId: reviverAcc,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Équipier',
    })
    const revived = resolvePlayer({
      accountId: revivedAcc,
      clanId,
      clanTag,
      clanAccountIds,
      memberIdentityMap,
      fallbackName: 'Équipier',
    })

    events.push({
      id: `revive-${rvIdx}`,
      type: 'revive',
      timestamp: elapsed,
      phaseNumber: Math.max(1, Math.floor(pair.phase || getPhase(elapsed))),
      actorName: reviver.name,
      actorClanTag: reviver.clanTag,
      actorAffiliation: reviver.affiliation,
      targetName: revived.name,
      targetClanTag: revived.clanTag,
      targetAffiliation: revived.affiliation,
      isClanActor: reviver.isClan,
      isClanTarget: revived.isClan,
      isTrackedClanActor: reviver.isTrackedClan,
      isTrackedClanTarget: revived.isTrackedClan,
    })
  }

  events.sort((a, b) => a.timestamp - b.timestamp)
  return events
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
        t.knockoutSamples,
        t.reviveSamples,
        t.landingSamples,
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
      return Response.json(
        buildTelemetryErrorResponse('Telemetry not found for this match', 'TELEMETRY_NOT_FOUND'),
        { status: 404 }
      )
    }

    const [members, killEvents, throwableStats] = await Promise.all([
      prisma.squadMember.findMany({
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
      }),
      prisma.killEvent.findMany({
        where: { squadMatchId: row.squadMatchId },
        select: {
          id: true,
          killerAccountId: true,
          killerRawKey: true,
          killerMemberId: true,
          victimAccountId: true,
          victimRawKey: true,
          victimMemberId: true,
          weaponName: true,
          distance: true,
          headshot: true,
          timestampSeconds: true,
          killerMember: {
            select: {
              displayName: true,
              pubgPlayerName: true,
              clanId: true,
              clan: {
                select: {
                  tag: true,
                },
              },
            },
          },
          victimMember: {
            select: {
              displayName: true,
              pubgPlayerName: true,
              clanId: true,
              clan: {
                select: {
                  tag: true,
                },
              },
            },
          },
        },
        orderBy: { timestampSeconds: 'asc' },
      }),
      prisma.memberThrowableStat.findMany({
        where: { squadMatchId: row.squadMatchId },
        select: {
          memberId: true,
          itemId: true,
          count: true,
          member: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: { count: 'desc' },
      }),
    ])

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
                tag: true,
              },
            },
          },
        },
      },
    })

    const memberIdentityMap: Record<string, { name: string; clanTag?: string; clanId?: number }> = {}

    // First populate from EncounteredPlayer
    const encounteredPlayers = await prisma.encounteredPlayer.findMany({
      where: { clanId: parsedClanId },
      select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
    })

    for (const p of encounteredPlayers) {
      if (p.pubgAccountId) {
        memberIdentityMap[p.pubgAccountId] = {
          name: p.pubgPlayerName,
          clanTag: p.pubgClanTag ?? undefined,
        }
      }
    }

    // Then overwrite with actual tracked ClanMember (which has clanId)
    for (const sm of allTrackedSquadMembers) {
      if (sm.member.pubgAccountId) {
        memberIdentityMap[sm.member.pubgAccountId] = {
          name: sm.member.displayName,
          clanTag: sm.member.clan?.tag ?? undefined,
          clanId: sm.member.clanId ?? undefined,
        }
      }
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { tag: true },
    })
    const clanTag = clan?.tag ?? 'Clan'

    const clanAccountIds = new Set(
      allTrackedSquadMembers
        .filter((sm) => sm.member.clanId === parsedClanId)
        .map((sm) => sm.member.pubgAccountId)
        .filter(Boolean) as string[]
    )

    // Discover any other clans tracked on the platform present in this match
    const otherTrackedClansSet = new Set<string>()
    for (const sm of allTrackedSquadMembers) {
      if (sm.member.clanId && sm.member.clanId !== parsedClanId && sm.member.clan?.tag) {
        otherTrackedClansSet.add(sm.member.clan.tag)
      }
    }
    for (const ke of killEvents) {
      if (ke.killerMember?.clanId && ke.killerMember.clanId !== parsedClanId && ke.killerMember.clan?.tag) {
        otherTrackedClansSet.add(ke.killerMember.clan.tag)
      }
      if (ke.victimMember?.clanId && ke.victimMember.clanId !== parsedClanId && ke.victimMember.clan?.tag) {
        otherTrackedClansSet.add(ke.victimMember.clan.tag)
      }
    }
    const otherTrackedClans = Array.from(otherTrackedClansSet)

    const parsedPhases = safeJsonParse(row.phaseSnapshots)
    const parsedKnocks = safeJsonParse(row.knockoutSamples)
    const parsedRevives = safeJsonParse(row.reviveSamples)

    const combatEvents = buildMatchCombatEvents({
      matchStartEpoch: Math.floor(row.createdAt.getTime() / 1000),
      clanTag,
      clanId: parsedClanId,
      clanAccountIds,
      memberIdentityMap,
      phaseSnapshots: Array.isArray(parsedPhases) ? parsedPhases : [],
      killEvents,
      knockoutSamples: Array.isArray(parsedKnocks) ? parsedKnocks : [],
      reviveSamples: Array.isArray(parsedRevives) ? parsedRevives : [],
    })

    const flightPath = computeFlightPath(row.landingSamples, row.mapName)

    const payload = {
      match: {
        id: row.squadMatchId,
        pubgMatchId: row.pubgMatchId,
        gameMode: row.gameMode,
        mapName: row.mapName,
        clanTag,
        otherTrackedClans,
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
        knockoutSamples: row.knockoutSamples,
        reviveSamples: row.reviveSamples,
        landingSamples: row.landingSamples,
        flightPath,
        combatEvents,
        createdAt: row.telemetryCreatedAt.toISOString(),
        updatedAt: row.telemetryUpdatedAt.toISOString(),
      },
      killEvents: killEvents.map((ke) => {
        const isClanKill = Boolean(ke.killerMemberId || (ke.killerAccountId && clanAccountIds.has(ke.killerAccountId)))
        const isClanVictim = Boolean(ke.victimMemberId || (ke.victimAccountId && clanAccountIds.has(ke.victimAccountId)))
        return {
          id: ke.id,
          killerAccountId: ke.killerAccountId,
          killerRawKey: ke.killerRawKey,
          killerMemberId: ke.killerMemberId,
          killerName: ke.killerMember?.displayName ?? (ke.killerAccountId ? memberIdentityMap[ke.killerAccountId]?.name : null) ?? ke.killerAccountId,
          killerClanTag: ke.killerMember ? (isClanKill ? clanTag : null) : (ke.killerAccountId ? memberIdentityMap[ke.killerAccountId]?.clanTag : null),
          victimAccountId: ke.victimAccountId,
          victimRawKey: ke.victimRawKey,
          victimMemberId: ke.victimMemberId,
          victimName: ke.victimMember?.displayName ?? (ke.victimAccountId ? memberIdentityMap[ke.victimAccountId]?.name : null) ?? ke.victimAccountId,
          victimClanTag: ke.victimMember ? (isClanVictim ? clanTag : null) : (ke.victimAccountId ? memberIdentityMap[ke.victimAccountId]?.clanTag : null),
          weaponName: ke.weaponName,
          damageCauser: ke.weaponName,
          distance: Math.round((ke.distance || 0) / 100),
          headshot: ke.headshot,
          timestampSeconds: ke.timestampSeconds,
          isClanKill,
          isClanVictim,
        }
      }),
      throwableStats: throwableStats.map((ts) => ({
        memberId: ts.memberId,
        displayName: ts.member.displayName,
        itemId: ts.itemId,
        count: ts.count,
      })),
      flightPath,
      combatEvents,
      weaponLabels,
      phaseLabels,
      memberIdentityMap,
    }

    return Response.json(
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
      return Response.json(buildTelemetryErrorResponse(error.message), { status: 400 })
    }

    console.error('Telemetry match detail failed:', error)
    return Response.json(buildTelemetryErrorResponse('Failed to load match telemetry detail'), {
      status: 500,
    })
  }
}
