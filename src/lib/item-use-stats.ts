/**
 * Lecture des objets consommés (`MemberItemUseStat`) pour les pages « Objets consommés » membre et clan.
 *
 * Deux vues sur les mêmes lignes : la répartition par famille (Heal, Boost, Fuel, Gadget…) et le détail par objet.
 * La vue clan ajoute le classement des membres.
 */
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type ItemUsePeriod = 'week' | 'month' | 'all'

export type ItemUseItemStat = {
  itemId: string
  subCategory: string
  count: number
  share: number
}

export type ItemUseFamilyStat = {
  subCategory: string
  count: number
  share: number
}

export type ItemUseMemberStat = {
  memberId: number
  displayName: string
  count: number
  perMatch: number
}

export type ItemUseStats = {
  period: ItemUsePeriod
  totalCount: number
  matchCount: number
  families: ItemUseFamilyStat[]
  items: ItemUseItemStat[]
  members: ItemUseMemberStat[]
  dataStart: string | null
}

export function getItemUsePeriodBounds(period: ItemUsePeriod, now = new Date()) {
  if (period === 'all') return null
  if (period === 'month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }
  const start = new Date(now)
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

type LoadInput = {
  clanId?: number
  memberId?: number
  period: ItemUsePeriod
  bounds: { startDate: Date; endDate: Date } | null
}

function scope(input: LoadInput) {
  const parts: Prisma.Sql[] = []
  if (input.memberId) parts.push(Prisma.sql`i.memberId = ${input.memberId}`)
  if (input.clanId) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM ClanMember cm WHERE cm.id = i.memberId AND cm.clanId = ${input.clanId})`)
  }
  if (input.bounds) {
    parts.push(Prisma.sql`i.matchDate >= ${input.bounds.startDate} AND i.matchDate <= ${input.bounds.endDate}`)
  }
  return parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`1 = 1`
}

export async function loadItemUseStats(input: LoadInput): Promise<ItemUseStats> {
  const where = scope(input)

  const [itemRows, memberRows, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ itemId: string; subCategory: string; count: bigint }>>(Prisma.sql`
      SELECT i.itemId, i.subCategory, SUM(i.count) AS count
      FROM MemberItemUseStat i
      WHERE ${where}
      GROUP BY i.itemId, i.subCategory
      ORDER BY count DESC
    `),
    prisma.$queryRaw<Array<{ memberId: number; displayName: string; count: bigint; matches: bigint }>>(Prisma.sql`
      SELECT i.memberId, cm.displayName, SUM(i.count) AS count, COUNT(DISTINCT i.squadMatchId) AS matches
      FROM MemberItemUseStat i
      INNER JOIN ClanMember cm ON cm.id = i.memberId
      WHERE ${where}
      GROUP BY i.memberId, cm.displayName
      ORDER BY count DESC
    `),
    prisma.$queryRaw<Array<{ total: bigint | null; matches: bigint; dataStart: Date | null }>>(Prisma.sql`
      SELECT SUM(i.count) AS total, COUNT(DISTINCT i.squadMatchId) AS matches, MIN(i.matchDate) AS dataStart
      FROM MemberItemUseStat i
      WHERE ${where}
    `),
  ])

  const totalCount = Number(totals[0]?.total ?? 0)
  const familyCounts = new Map<string, number>()
  for (const row of itemRows) {
    familyCounts.set(row.subCategory, (familyCounts.get(row.subCategory) ?? 0) + Number(row.count))
  }

  const matchCount = Number(totals[0]?.matches ?? 0)
  return {
    period: input.period,
    totalCount,
    matchCount,
    families: [...familyCounts.entries()]
      .map(([subCategory, count]) => ({
        subCategory,
        count,
        share: totalCount > 0 ? (count / totalCount) * 100 : 0,
      }))
      .sort((left, right) => right.count - left.count),
    items: itemRows.map((row) => ({
      itemId: row.itemId,
      subCategory: row.subCategory,
      count: Number(row.count),
      share: totalCount > 0 ? (Number(row.count) / totalCount) * 100 : 0,
    })),
    members: memberRows.map((row) => ({
      memberId: row.memberId,
      displayName: row.displayName,
      count: Number(row.count),
      perMatch: Number(row.matches) > 0 ? Number(row.count) / Number(row.matches) : 0,
    })),
    dataStart: totals[0]?.dataStart ? new Date(totals[0].dataStart).toISOString() : null,
  }
}
