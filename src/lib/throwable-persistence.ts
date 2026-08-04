import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type ThrowableSample = {
  throwerKey: string | null
  itemId: string | null
}

type ThrowableMatch = {
  id: string
  createdAt: Date
}

type ThrowableClanMember = {
  id: number
  pubgAccountId: string | null
  pubgPlayerName: string
}

export type MemberThrowableStatRow = {
  squadMatchId: string
  memberId: number
  itemId: string
  count: number
  matchDate: Date
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function parseThrowableSamples(raw: unknown): ThrowableSample[] {
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

  const samples: ThrowableSample[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const sample = item as Record<string, unknown>
    const throwerKey = typeof sample.throwerKey === 'string' ? sample.throwerKey : null
    const itemId = typeof sample.itemId === 'string' ? sample.itemId : null
    if (!throwerKey || !itemId) continue

    samples.push({ throwerKey, itemId })
  }

  return samples
}

/**
 * Throws are captured unfiltered per match by the parser (same rationale as
 * kill-event-persistence: clanMemberKeys is usually empty on the main sync
 * path). Only throws attributable to a tracked clan member are kept here.
 */
export function buildMemberThrowableStatRows(
  match: ThrowableMatch,
  clanMembers: ThrowableClanMember[],
  rawThrowableSamples: unknown
): MemberThrowableStatRow[] {
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

  const samples = parseThrowableSamples(rawThrowableSamples)
  const counts = new Map<string, number>()

  for (const sample of samples) {
    const key = normalizeKey(sample.throwerKey)
    const memberId = key ? memberByKey.get(key) : undefined
    if (!memberId || !sample.itemId) {
      continue
    }

    const groupKey = `${memberId}:${sample.itemId}`
    counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1)
  }

  return Array.from(counts.entries()).map(([groupKey, count]) => {
    const [memberIdStr, itemId] = groupKey.split(':')
    return {
      squadMatchId: match.id,
      memberId: Number(memberIdStr),
      itemId,
      count,
      matchDate: match.createdAt,
    }
  })
}

export async function persistThrowableStatsForMatch(
  squadMatchId: string,
  rawThrowableSamples: unknown,
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

  const rows = buildMemberThrowableStatRows(match, clanMembers, rawThrowableSamples)

  await client.$transaction(async (transaction) => {
    await transaction.memberThrowableStat.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) {
      await transaction.memberThrowableStat.createMany({ data: rows })
    }
  })

  return rows.length
}
