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
import {
  collectLobbyAccountIds,
  extractRespawnEvents,
  mergeKillFeedWithKillEvents,
} from '@/lib/pubg-telemetry/match-replay'
import {
  mergeBodyZoneBreakdowns,
  type BodyZoneBreakdown,
} from '@/lib/pubg-telemetry/body-zones'
import { extractSquadMates } from '@/lib/pubg-telemetry/squad-mates'

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
  vehicleSamples: unknown
  killFeedSamples: unknown
  telemetryCreatedAt: Date
  telemetryUpdatedAt: Date
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
  /** Comptes de l'escouade (clan consulté + coéquipiers), en minuscules. */
  squadAccountIds: Set<string>
  memberIdentityMap: Record<string, { name: string; clanTag?: string; clanId?: number }>
  fallbackName: string
}): {
  name: string
  clanTag: string | null
  affiliation: PlayerAffiliation
  isClan: boolean
  isTrackedClan: boolean
  isSquad: boolean
} {
  const { member, accountId, clanId, clanTag, clanAccountIds, squadAccountIds, memberIdentityMap, fallbackName } = params

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
    isSquad: isCurrentClan || Boolean(accountId && squadAccountIds.has(accountId.toLowerCase())),
  }
}

type CombatKillRecord = {
  id: string
  killerAccountId: string | null
  victimAccountId: string | null
  killerMember?: { displayName?: string | null; clanId?: number | null; clan?: { tag?: string | null } | null } | null
  victimMember?: { displayName?: string | null; clanId?: number | null; clan?: { tag?: string | null } | null } | null
  weaponName: string | null
  distance: number | null
  headshot: boolean
  timestampSeconds: number | null
  /** `sync` : ligne KillEvent ; `telemetry` : frag retrouvé dans le kill-feed complet. */
  source: 'sync' | 'telemetry'
}

function buildMatchCombatEvents(params: {
  matchStartEpoch: number
  clanTag: string
  clanId: number
  clanAccountIds: Set<string>
  squadAccountIds: Set<string>
  memberIdentityMap: Record<string, { name: string; clanTag?: string; clanId?: number }>
  phaseSnapshots: any[]
  killRecords: CombatKillRecord[]
  knockoutSamples: any[]
  reviveSamples: any[]
  respawnEvents: Array<{ key: string; t: number }>
}) {
  const {
    matchStartEpoch,
    clanTag,
    clanId,
    clanAccountIds,
    squadAccountIds,
    memberIdentityMap,
    phaseSnapshots,
    killRecords,
    knockoutSamples,
    reviveSamples,
    respawnEvents,
  } = params

  const resolve = (
    accountId: string | null | undefined,
    fallbackName: string,
    member?: CombatKillRecord['killerMember']
  ) =>
    resolvePlayer({
      member,
      accountId,
      clanId,
      clanTag,
      clanAccountIds,
      squadAccountIds,
      memberIdentityMap,
      fallbackName,
    })

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

  const toElapsed = (ts: number) => Math.max(0, Math.floor(ts > 100000 ? ts - matchStartEpoch : ts))

  const events: any[] = []

  // 1. Kills — KillEvent complétés par le kill-feed de la télémétrie
  for (const k of killRecords) {
    const elapsed = toElapsed(k.timestampSeconds ?? 0)
    const killer = resolve(k.killerAccountId, 'Inconnu', k.killerMember)
    const victim = resolve(k.victimAccountId, 'Inconnu', k.victimMember)

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
      // Seul le headshot est une donnée réelle sur un frag : la localisation
      // précise n'est pas persistée événement par événement.
      damageReason: k.headshot ? 'HeadShot' : null,
      distanceMeters: Math.round((k.distance || 0) / 100),
      isClanActor: killer.isClan,
      isClanTarget: victim.isClan,
      isTrackedClanActor: killer.isTrackedClan,
      isTrackedClanTarget: victim.isTrackedClan,
      isSquadActor: killer.isSquad,
      isSquadTarget: victim.isSquad,
      source: k.source,
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
    const elapsed = toElapsed(ts)
    const knocker = resolve(pair.knocker?.memberKey, 'Adversaire')
    const victim = resolve(pair.victim?.memberKey, 'Cible')

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
      damageReason: pair.knocker?.damageReason ?? null,
      distanceMeters: dist,
      isClanActor: knocker.isClan,
      isClanTarget: victim.isClan,
      isTrackedClanActor: knocker.isTrackedClan,
      isTrackedClanTarget: victim.isTrackedClan,
      isSquadActor: knocker.isSquad,
      isSquadTarget: victim.isSquad,
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
    const elapsed = toElapsed(ts)
    const reviver = resolve(pair.reviver?.memberKey, 'Équipier')
    const revived = resolve(pair.revived?.memberKey, 'Équipier')

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
      isSquadActor: reviver.isSquad,
      isSquadTarget: revived.isSquad,
    })
  }

  // 4. Rappels — retour en jeu par l'avion de rappel (saut postérieur à une mort)
  respawnEvents.forEach((respawn, index) => {
    const player = resolve(respawn.key, 'Joueur')
    events.push({
      id: `recall-${index}`,
      type: 'recall',
      timestamp: respawn.t,
      phaseNumber: getPhase(respawn.t),
      actorName: player.name,
      actorClanTag: player.clanTag,
      actorAffiliation: player.affiliation,
      targetName: '',
      isClanActor: player.isClan,
      isTrackedClanActor: player.isTrackedClan,
      isSquadActor: player.isSquad,
    })
  })

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
        t.vehicleSamples,
        t.killFeedSamples,
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

    const lobbyAccountIds = collectLobbyAccountIds(
      row.memberStats,
      row.positionSamples,
      row.knockoutSamples,
      row.reviveSamples,
      killEvents.flatMap((ke) => [
        { memberKey: ke.killerAccountId },
        { memberKey: ke.victimAccountId },
      ])
    )

    // Cascade de résolution : joueur croisé par un clan < identité globale < membre d'un clan suivi.
    // Le filtre sur les comptes réellement présents évite de charger tout l'historique
    // d'EncounteredPlayer du clan (plusieurs dizaines de milliers de lignes) à chaque appel.
    const [encounteredPlayers, globalPlayers] = await Promise.all([
      lobbyAccountIds.length > 0
        ? prisma.encounteredPlayer.findMany({
            where: { pubgAccountId: { in: lobbyAccountIds } },
            select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
          })
        : Promise.resolve([]),
      lobbyAccountIds.length > 0
        ? prisma.player.findMany({
            where: { pubgAccountId: { in: lobbyAccountIds } },
            select: {
              pubgAccountId: true,
              pubgPlayerName: true,
              opponentClan: { select: { tag: true } },
            },
          })
        : Promise.resolve([]),
    ])

    for (const p of encounteredPlayers) {
      if (p.pubgAccountId) {
        memberIdentityMap[p.pubgAccountId] = {
          name: p.pubgPlayerName,
          clanTag: p.pubgClanTag ?? undefined,
        }
      }
    }

    for (const p of globalPlayers) {
      if (p.pubgAccountId) {
        memberIdentityMap[p.pubgAccountId] = {
          name: p.pubgPlayerName,
          clanTag: p.opponentClan?.tag ?? memberIdentityMap[p.pubgAccountId]?.clanTag,
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

    const parsedMemberStats: unknown = safeJsonParse(row.memberStats)

    // Coéquipiers : même équipe qu'un membre du clan consulté, mais sans ligne SquadMember
    // pour ce clan. Leurs statistiques viennent de memberStats.
    const { mates: rawSquadMates, mateStatsRows } = extractSquadMates({
      memberStats: parsedMemberStats,
      positionSamples: row.positionSamples,
      clanAccountIds,
      identities: memberIdentityMap,
    })

    // Un coéquipier peut être suivi dans un AUTRE clan du site (ex. un membre SMK invité par
    // BOFS) alors que ce clan n'a pas encore synchronisé le match : il n'a donc pas de ligne
    // SquadMember ici. Seule l'absence de toute fiche ClanMember en fait un joueur « non suivi ».
    const mateAccountIds = rawSquadMates.map((mate) => mate.accountId)
    const [mateClanMembers, matePlayers] =
      mateAccountIds.length > 0
        ? await Promise.all([
            prisma.clanMember.findMany({
              where: { pubgAccountId: { in: mateAccountIds } },
              select: {
                pubgAccountId: true,
                displayName: true,
                clanId: true,
                clan: { select: { tag: true, name: true } },
              },
            }),
            prisma.player.findMany({
              where: { pubgAccountId: { in: mateAccountIds } },
              select: { pubgAccountId: true, clanResolvedAt: true },
            }),
          ])
        : [[], []]

    const squadMates = rawSquadMates.map((mate) => {
      const key = mate.accountId.toLowerCase()
      const clanMember = mateClanMembers.find(
        (member) => member.pubgAccountId?.toLowerCase() === key && member.clanId !== null
      )
      const player = matePlayers.find((entry) => entry.pubgAccountId.toLowerCase() === key)

      if (clanMember?.clanId) {
        memberIdentityMap[mate.accountId] = {
          name: clanMember.displayName,
          clanTag: clanMember.clan?.tag ?? undefined,
          clanId: clanMember.clanId,
        }
      }

      return {
        ...mate,
        name: clanMember?.displayName ?? mate.name,
        clanTag: clanMember?.clan?.tag ?? mate.clanTag,
        trackedClan: clanMember?.clanId
          ? { id: clanMember.clanId, tag: clanMember.clan?.tag ?? null, name: clanMember.clan?.name ?? null }
          : null,
        /** Date de la dernière résolution du clan PUBG — le tag peut être périmé. */
        pubgClanCheckedAt: player?.clanResolvedAt?.toISOString() ?? null,
      }
    })

    const squadAccountIds = new Set(
      [...clanAccountIds, ...squadMates.map((mate) => mate.accountId)].map((id) => id.toLowerCase())
    )

    // Discover any other clans tracked on the platform present in this match
    const otherTrackedClansSet = new Set<string>()
    for (const mate of squadMates) {
      if (mate.trackedClan?.tag) otherTrackedClansSet.add(mate.trackedClan.tag)
    }
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
    const matchStartEpochSeconds = row.createdAt.getTime() / 1000

    // Frags : les KillEvent ne couvrent que les clans ayant synchronisé ce match. Le kill-feed
    // complet de la télémétrie (colonne killFeedSamples, 2026-09-14) comble les autres.
    const killEventById = new Map(killEvents.map((ke) => [ke.id, ke]))
    const killRecords: CombatKillRecord[] = mergeKillFeedWithKillEvents(
      killEvents.map((ke) => ({
        id: ke.id,
        killerAccountId: ke.killerAccountId,
        killerRawKey: ke.killerRawKey,
        victimAccountId: ke.victimAccountId,
        victimRawKey: ke.victimRawKey,
        weaponName: ke.weaponName,
        distance: ke.distance,
        headshot: ke.headshot,
        timestampSeconds: ke.timestampSeconds,
      })),
      row.killFeedSamples,
      matchStartEpochSeconds
    )
      .map((kill) => {
        const stored = killEventById.get(kill.id)
        return {
          id: kill.id,
          killerAccountId: kill.killerAccountId,
          victimAccountId: kill.victimAccountId,
          killerMember: stored?.killerMember ?? null,
          victimMember: stored?.victimMember ?? null,
          weaponName: kill.weaponName,
          distance: kill.distance,
          headshot: kill.headshot,
          timestampSeconds: kill.timestampSeconds,
          source: stored ? ('sync' as const) : ('telemetry' as const),
        }
      })
      .sort((left, right) => (left.timestampSeconds ?? 0) - (right.timestampSeconds ?? 0))

    const combatEvents = buildMatchCombatEvents({
      matchStartEpoch: Math.floor(matchStartEpochSeconds),
      clanTag,
      clanId: parsedClanId,
      clanAccountIds,
      squadAccountIds,
      memberIdentityMap,
      phaseSnapshots: Array.isArray(parsedPhases) ? parsedPhases : [],
      killRecords,
      knockoutSamples: Array.isArray(parsedKnocks) ? parsedKnocks : [],
      reviveSamples: Array.isArray(parsedRevives) ? parsedRevives : [],
      respawnEvents: extractRespawnEvents(row.deathSamples, row.vehicleSamples, matchStartEpochSeconds),
    })

    const clanMemberKeysLower = new Set(
      Array.from(clanAccountIds).map((accountId) => accountId.toLowerCase())
    )
    const clanMemberStats = (Array.isArray(parsedMemberStats) ? parsedMemberStats : []).filter(
      (entry): entry is Record<string, unknown> => {
        if (!entry || typeof entry !== 'object') return false
        const key = (entry as Record<string, unknown>).memberKey
        return typeof key === 'string' && clanMemberKeysLower.has(key.toLowerCase())
      }
    )

    const squadMemberStats = [...clanMemberStats, ...mateStatsRows]

    // Les snapshots parsés avant l'ajout des zones anatomiques n'ont pas la clé du tout :
    // on distingue « aucune donnée » (badge UI) de « zéro impact localisé ».
    const bodyZonesAvailable = squadMemberStats.some(
      (entry) => Array.isArray(entry.bodyZonesDealt) || Array.isArray(entry.bodyZonesTaken)
    )

    const squadBodyZones = {
      available: bodyZonesAvailable,
      dealt: mergeBodyZoneBreakdowns(
        squadMemberStats.map((entry) => entry.bodyZonesDealt as BodyZoneBreakdown[] | undefined)
      ),
      taken: mergeBodyZoneBreakdowns(
        squadMemberStats.map((entry) => entry.bodyZonesTaken as BodyZoneBreakdown[] | undefined)
      ),
    }

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
        // Plus de `flightPath` ici : son seul consommateur était l'ancienne carte tactique du
        // débriefing. Le plan de vol exact (depuis les sauts) est servi par la route `/replay`.
        combatEvents,
        squadBodyZones,
        createdAt: row.telemetryCreatedAt.toISOString(),
        updatedAt: row.telemetryUpdatedAt.toISOString(),
      },
      // Frags de l'escouade (clan consulté + coéquipiers) : KillEvent synchronisés, complétés par
      // le kill-feed de la télémétrie. `source` permet à l'interface d'expliquer l'origine.
      killEvents: killRecords.map((kill) => {
        const killer = resolvePlayer({
          member: kill.killerMember,
          accountId: kill.killerAccountId,
          clanId: parsedClanId,
          clanTag,
          clanAccountIds,
          squadAccountIds,
          memberIdentityMap,
          fallbackName: 'Inconnu',
        })
        const victim = resolvePlayer({
          member: kill.victimMember,
          accountId: kill.victimAccountId,
          clanId: parsedClanId,
          clanTag,
          clanAccountIds,
          squadAccountIds,
          memberIdentityMap,
          fallbackName: 'Inconnu',
        })
        return {
          id: kill.id,
          killerAccountId: kill.killerAccountId,
          killerName: killer.name,
          killerClanTag: killer.clanTag,
          victimAccountId: kill.victimAccountId,
          victimName: victim.name,
          victimClanTag: victim.clanTag,
          weaponName: kill.weaponName,
          damageCauser: kill.weaponName,
          distance: Math.round((kill.distance || 0) / 100),
          headshot: kill.headshot,
          timestampSeconds: kill.timestampSeconds,
          isClanKill: killer.isClan,
          isClanVictim: victim.isClan,
          isSquadKill: killer.isSquad,
          isSquadVictim: victim.isSquad,
          source: kill.source,
        }
      }),
      killFeedAvailable: Array.isArray(safeJsonParse(row.killFeedSamples, null)),
      squadMates,
      throwableStats: throwableStats.map((ts) => ({
        memberId: ts.memberId,
        displayName: ts.member.displayName,
        itemId: ts.itemId,
        count: ts.count,
      })),
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
