import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type KillFeedSample = {
  killerKey: string | null
  victimKey: string | null
  weaponName: string | null
  distance: number | null
  headshot: boolean
  timestampSeconds: number | null
}

type KillEventMatch = {
  id: string
  createdAt: Date
  members: Array<{ member: { clanId: number | null } }>
}

type KillEventClanMember = {
  id: number
  clanId: number
  pubgAccountId: string | null
  pubgPlayerName: string
}

export type KillEventRow = {
  squadMatchId: string
  clanId: number
  killerAccountId: string | null
  killerRawKey: string | null
  killerMemberId: number | null
  victimAccountId: string | null
  victimRawKey: string | null
  victimMemberId: number | null
  weaponName: string | null
  distance: number | null
  headshot: boolean
  timestampSeconds: number | null
  matchDate: Date
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function isAccountLikeKey(key: string) {
  return /^(account|ai)\./i.test(key)
}

export function parseKillFeedSamples(raw: unknown): KillFeedSample[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }

  if (!Array.isArray(value)) {
    return []
  }

  const samples: KillFeedSample[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const sample = item as Record<string, unknown>
    const killerKey = typeof sample.killerKey === 'string' ? sample.killerKey : null
    const victimKey = typeof sample.victimKey === 'string' ? sample.victimKey : null
    if (!killerKey && !victimKey) continue

    samples.push({
      killerKey,
      victimKey,
      weaponName: typeof sample.weaponName === 'string' ? sample.weaponName : null,
      distance:
        typeof sample.distance === 'number' && Number.isFinite(sample.distance) ? sample.distance : null,
      headshot: sample.headshot === true,
      timestampSeconds:
        typeof sample.timestampSeconds === 'number' && Number.isFinite(sample.timestampSeconds)
          ? sample.timestampSeconds
          : null,
    })
  }

  return samples
}

/**
 * Kills are captured unfiltered per match by the parser (clanMemberKeys is
 * usually empty on the main sync path). Relevance is decided here instead, by
 * resolving killer/victim keys against the rosters of every clan attached to
 * this match — a row is only kept if at least one side is a tracked member of
 * one of them. `clanMembers` may span several clans when the match is shared
 * (see analyzeMatchForSquads in squad-detector.ts) : a cross-clan kill (killer
 * and victim tracked in different clans) resolves both sides correctly. The
 * row's own `clanId` is set to whichever side resolved (killer's clan takes
 * priority) — it exists for legacy single-clan queries (see
 * encountered-players/route.ts) and doesn't gate the Head-to-Head query in
 * head-to-head-service.ts, which reads killerMember/victimMember directly.
 */
export function buildKillEventRows(
  match: KillEventMatch,
  clanMembers: KillEventClanMember[],
  rawKillFeedSamples: unknown
): KillEventRow[] {
  const fallbackClanId = match.members.find((entry) => entry.member.clanId !== null)?.member.clanId
  if (!fallbackClanId) {
    return []
  }

  const memberByKey = new Map<string, number>()
  const clanByMemberId = new Map<number, number>()
  for (const member of clanMembers) {
    clanByMemberId.set(member.id, member.clanId)
    if (member.pubgAccountId) {
      memberByKey.set(normalizeKey(member.pubgAccountId)!, member.id)
    }
    const nameKey = normalizeKey(member.pubgPlayerName)
    if (nameKey) {
      memberByKey.set(nameKey, member.id)
    }
  }

  const samples = parseKillFeedSamples(rawKillFeedSamples)
  const rows: KillEventRow[] = []

  for (const sample of samples) {
    const killerMemberId = (() => {
      const key = normalizeKey(sample.killerKey)
      return key ? memberByKey.get(key) ?? null : null
    })()
    const victimMemberId = (() => {
      const key = normalizeKey(sample.victimKey)
      return key ? memberByKey.get(key) ?? null : null
    })()

    if (killerMemberId === null && victimMemberId === null) {
      continue
    }

    const rowClanId =
      (killerMemberId !== null ? clanByMemberId.get(killerMemberId) : undefined) ??
      (victimMemberId !== null ? clanByMemberId.get(victimMemberId) : undefined) ??
      fallbackClanId

    rows.push({
      squadMatchId: match.id,
      clanId: rowClanId,
      killerAccountId: sample.killerKey && isAccountLikeKey(sample.killerKey) ? sample.killerKey : null,
      killerRawKey: sample.killerKey,
      killerMemberId,
      victimAccountId: sample.victimKey && isAccountLikeKey(sample.victimKey) ? sample.victimKey : null,
      victimRawKey: sample.victimKey,
      victimMemberId,
      weaponName: sample.weaponName,
      distance: sample.distance,
      headshot: sample.headshot,
      timestampSeconds: sample.timestampSeconds,
      matchDate: match.createdAt,
    })
  }

  return rows
}

export async function persistKillEventsForMatch(
  squadMatchId: string,
  rawKillFeedSamples: unknown,
  client: PrismaClient = prisma
) {
  const match = await client.squadMatch.findUnique({
    where: { id: squadMatchId },
    select: {
      id: true,
      createdAt: true,
      members: { select: { member: { select: { clanId: true } } } },
    },
  })
  if (!match) {
    return 0
  }

  // Un SquadMatch peut être partagé entre plusieurs clans (voir
  // analyzeMatchForSquads dans squad-detector.ts) : on résout les rosters de
  // tous les clans présents sur ce match, pas seulement le premier, sinon un
  // kill entre deux clans suivis ne résoudrait jamais qu'un seul côté.
  const clanIds = Array.from(
    new Set(
      match.members
        .map((entry) => entry.member.clanId)
        .filter((id): id is number => id !== null)
    )
  )
  if (clanIds.length === 0) {
    return 0
  }

  const clanMembersRaw = await client.clanMember.findMany({
    where: { clanId: { in: clanIds } },
    select: { id: true, clanId: true, pubgAccountId: true, pubgPlayerName: true },
  })
  // clanId ne peut pas être null ici : la clause where ci-dessus le garantit.
  const clanMembers = clanMembersRaw.map((member) => ({ ...member, clanId: member.clanId as number }))

  const rows = buildKillEventRows(match, clanMembers, rawKillFeedSamples)

  await client.$transaction(async (transaction) => {
    // 1. Récupérer les anciens kills pour calculer les décréments
    const oldKills = await transaction.killEvent.findMany({ 
      where: { squadMatchId },
      select: { clanId: true, killerMemberId: true, victimMemberId: true, killerAccountId: true, victimAccountId: true }
    })

    const deltas = new Map<number, Map<string, number>>()

    const applyDeltas = (kills: typeof oldKills | typeof rows, multiplier: number) => {
      for (const kill of kills) {
        if (kill.killerMemberId !== null && kill.victimAccountId && !kill.victimAccountId.startsWith('ai.')) {
          const clanMap = deltas.get(kill.clanId) ?? new Map()
          clanMap.set(kill.victimAccountId, (clanMap.get(kill.victimAccountId) ?? 0) + multiplier)
          deltas.set(kill.clanId, clanMap)
        }
        if (kill.victimMemberId !== null && kill.killerAccountId && !kill.killerAccountId.startsWith('ai.')) {
          const clanMap = deltas.get(kill.clanId) ?? new Map()
          clanMap.set(kill.killerAccountId, (clanMap.get(kill.killerAccountId) ?? 0) + multiplier)
          deltas.set(kill.clanId, clanMap)
        }
      }
    }

    // -1 pour les anciens kills, +1 pour les nouveaux
    applyDeltas(oldKills, -1)
    applyDeltas(rows, 1)

    await transaction.killEvent.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) {
      await transaction.killEvent.createMany({ data: rows })
    }

    // Appliquer les deltas à EncounteredPlayer
    for (const [clanId, clanDeltas] of deltas.entries()) {
      for (const [pubgAccountId, delta] of clanDeltas.entries()) {
        if (delta !== 0) {
          await transaction.encounteredPlayer.updateMany({
            where: { clanId, pubgAccountId },
            data: { combatInteractionsCount: { increment: delta } }
          })
        }
      }
    }
  })

  return rows.length
}
