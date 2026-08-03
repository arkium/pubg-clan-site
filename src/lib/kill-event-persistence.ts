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
 * usually empty on the main sync path). Relevance to this clan is decided
 * here instead, by resolving killer/victim keys against the full clan roster
 * — a row is only kept if at least one side is one of our tracked members.
 */
export function buildKillEventRows(
  match: KillEventMatch,
  clanMembers: KillEventClanMember[],
  rawKillFeedSamples: unknown
): KillEventRow[] {
  const clanId = match.members.find((entry) => entry.member.clanId !== null)?.member.clanId
  if (!clanId) {
    return []
  }

  const memberByKey = new Map<string, number>()
  for (const member of clanMembers) {
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

    rows.push({
      squadMatchId: match.id,
      clanId,
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

  const clanId = match.members.find((entry) => entry.member.clanId !== null)?.member.clanId
  if (!clanId) {
    return 0
  }

  const clanMembers = await client.clanMember.findMany({
    where: { clanId },
    select: { id: true, pubgAccountId: true, pubgPlayerName: true },
  })

  const rows = buildKillEventRows(match, clanMembers, rawKillFeedSamples)

  await client.$transaction(async (transaction) => {
    await transaction.killEvent.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) {
      await transaction.killEvent.createMany({ data: rows })
    }
  })

  return rows.length
}
