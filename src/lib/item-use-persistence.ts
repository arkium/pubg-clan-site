/**
 * Objets consommés par match (`LogItemUse`) : soins, boosts, carburant, gadgets.
 *
 * Le parser capture tous les `LogItemUse` sans filtre — `clanMemberKeys` est vide sur le chemin de synchronisation
 * principal, donc la résolution contre le roster du clan se fait ici. Seule la catégorie `Use` est conservée : le
 * même événement sert aussi aux munitions et aux accessoires, qui ne sont pas des objets consommés.
 *
 * Le détail par objet vient de `LogItemUse` et jamais de `LogHeal`, dont l'`itemId` est vide en production.
 */
import type { PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export const ITEM_USE_CATEGORY = 'Use'

export type ItemUseSample = {
  actorKey: string | null
  itemId: string | null
  category: string | null
  subCategory: string | null
}

type ItemUseMatch = {
  id: string
  createdAt: Date
}

type ItemUseClanMember = {
  id: number
  pubgAccountId: string | null
  pubgPlayerName: string
}

export type MemberItemUseStatRow = {
  squadMatchId: string
  memberId: number
  itemId: string
  category: string
  subCategory: string
  count: number
  matchDate: Date
}

function normalizeKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function parseItemUseSamples(raw: unknown): ItemUseSample[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []

  const samples: ItemUseSample[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const sample = entry as Record<string, unknown>
    const actorKey = typeof sample.actorKey === 'string' ? sample.actorKey : null
    const itemId = typeof sample.itemId === 'string' ? sample.itemId : null
    if (!actorKey || !itemId) continue
    samples.push({
      actorKey,
      itemId,
      category: typeof sample.category === 'string' ? sample.category : null,
      subCategory: typeof sample.subCategory === 'string' ? sample.subCategory : null,
    })
  }
  return samples
}

export function buildMemberItemUseStatRows(
  match: ItemUseMatch,
  clanMembers: ItemUseClanMember[],
  rawItemUseSamples: unknown
): MemberItemUseStatRow[] {
  const memberByKey = new Map<string, number>()
  for (const member of clanMembers) {
    const accountKey = normalizeKey(member.pubgAccountId)
    if (accountKey) memberByKey.set(accountKey, member.id)
    const nameKey = normalizeKey(member.pubgPlayerName)
    if (nameKey) memberByKey.set(nameKey, member.id)
  }

  const rows = new Map<string, MemberItemUseStatRow>()
  for (const sample of parseItemUseSamples(rawItemUseSamples)) {
    if (sample.category !== ITEM_USE_CATEGORY) continue
    const memberId = memberByKey.get(normalizeKey(sample.actorKey) ?? '')
    if (!memberId || !sample.itemId) continue

    const key = `${memberId}:${sample.itemId}`
    const existing = rows.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    rows.set(key, {
      squadMatchId: match.id,
      memberId,
      itemId: sample.itemId,
      category: sample.category,
      // Objet sans sous-catégorie déclarée : rangé à part plutôt que rattaché arbitrairement à une famille.
      subCategory: sample.subCategory ?? 'Unknown',
      count: 1,
      matchDate: match.createdAt,
    })
  }

  return Array.from(rows.values())
}

export async function persistItemUseStatsForMatch(
  squadMatchId: string,
  rawItemUseSamples: unknown,
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
  if (!match) return 0

  const clanId = match.members.find((entry) => entry.member.clanId !== null)?.member.clanId
  if (!clanId) return 0

  const clanMembers = await client.clanMember.findMany({
    where: { clanId },
    select: { id: true, pubgAccountId: true, pubgPlayerName: true },
  })

  const rows = buildMemberItemUseStatRows(match, clanMembers, rawItemUseSamples)

  await client.$transaction(async (transaction) => {
    await transaction.memberItemUseStat.deleteMany({ where: { squadMatchId } })
    if (rows.length > 0) await transaction.memberItemUseStat.createMany({ data: rows })
  })

  return rows.length
}
