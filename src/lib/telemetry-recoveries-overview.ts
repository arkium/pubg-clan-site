import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'

export type TelemetryRecoveriesWindow = '24h' | '7d' | '30d' | 'all'

export type ClanTelemetryRecoveriesStat = {
  clanId: number
  clanName: string
  clanTag: string
  total: number
  success: number
  failed: number
  expired: number
  pending: number
  withParsedPayload: number
  successRate: number | null
}

function resolveWindowStart(window: TelemetryRecoveriesWindow): Date | null {
  const now = Date.now()

  if (window === '24h') return new Date(now - 24 * 60 * 60 * 1000)
  if (window === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000)
  if (window === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000)
  return null
}

export async function getTelemetryRecoveriesOverview(
  window: TelemetryRecoveriesWindow
): Promise<{ window: TelemetryRecoveriesWindow; clans: ClanTelemetryRecoveriesStat[] }> {
  const windowStart = resolveWindowStart(window)

  // Un match peut compter plusieurs membres du meme clan dans la meme squad : on deduplique
  // (clanId, squadMatchId) avant de joindre la telemetrie, pour ne jamais compter deux fois
  // la meme ligne SquadMatchTelemetry pour un clan donne.
  const rows = await prisma.$queryRaw<
    Array<{
      clanId: number
      status: string
      errorCode: string | null
      errorMessage: string | null
      hasParsedPayload: number
    }>
  >(Prisma.sql`
    SELECT
      pairs.clanId AS clanId,
      t.status,
      t.errorCode,
      t.errorMessage,
      CASE
        WHEN t.summary IS NOT NULL OR t.weaponStats IS NOT NULL OR t.memberStats IS NOT NULL THEN 1
        ELSE 0
      END AS hasParsedPayload
    FROM (
      SELECT DISTINCT cm.clanId AS clanId, sdm.squadMatchId AS squadMatchId
      FROM SquadMember sdm
      INNER JOIN ClanMember cm ON cm.id = sdm.memberId
      WHERE cm.clanId IS NOT NULL
    ) pairs
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = pairs.squadMatchId
    ${windowStart ? Prisma.sql`WHERE t.updatedAt >= ${windowStart}` : Prisma.empty}
  `)

  const statsByClan = new Map<
    number,
    { total: number; success: number; failed: number; expired: number; pending: number; withParsedPayload: number }
  >()

  for (const row of rows) {
    const stat = statsByClan.get(row.clanId) ?? {
      total: 0,
      success: 0,
      failed: 0,
      expired: 0,
      pending: 0,
      withParsedPayload: 0,
    }

    stat.total += 1

    if (row.status === 'success') {
      stat.success += 1
    } else if (row.status === 'failed') {
      if (isTelemetryDataExpiredError(row.errorCode, row.errorMessage)) {
        stat.expired += 1
      } else {
        stat.failed += 1
      }
    } else {
      stat.pending += 1
    }

    if (row.hasParsedPayload === 1) {
      stat.withParsedPayload += 1
    }

    statsByClan.set(row.clanId, stat)
  }

  const clanIds = Array.from(statsByClan.keys())
  const clans =
    clanIds.length > 0
      ? await prisma.clan.findMany({
          where: { id: { in: clanIds } },
          select: { id: true, name: true, tag: true },
        })
      : []
  const clanMap = new Map(clans.map((clan) => [clan.id, clan]))

  const result = clanIds
    .map((clanId) => {
      const stat = statsByClan.get(clanId)!
      const clan = clanMap.get(clanId)
      // Denominateur coherent avec les KPIs de la page clan-scopee : seuls les echecs
      // "expires PUBG" sont retires, car ce n'est pas un probleme de pipeline a corriger.
      const successRateDenominator = stat.total - stat.expired
      const successRate =
        successRateDenominator > 0 ? (stat.success / successRateDenominator) * 100 : null

      return {
        clanId,
        clanName: clan?.name ?? `Clan #${clanId}`,
        clanTag: clan?.tag ?? '',
        total: stat.total,
        success: stat.success,
        failed: stat.failed,
        expired: stat.expired,
        pending: stat.pending,
        withParsedPayload: stat.withParsedPayload,
        successRate,
      }
    })
    .sort((a, b) => b.total - a.total)

  return { window, clans: result }
}
