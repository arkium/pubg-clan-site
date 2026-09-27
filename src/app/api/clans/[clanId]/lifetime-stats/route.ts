import { requireNavPermission } from '@/middleware/auth-permission'
import type { CareerLifetimeStats } from '@/lib/clan-career'
import { getCronRunsPerDay } from '@/lib/cron-frequency'
import { prisma } from '@/lib/prisma'

/**
 * Carrière PUBG du clan (`/clans/[clanId]/stats/career`) : statistiques cumulées depuis la création des comptes, lues
 * dans `MemberLifetimeStats` (API PUBG `/seasons/lifetime`). **Aucune période** depuis le 2026-09-27 : l'ancien
 * paramètre `period` ne changeait que « Engagement », qui venait des matchs suivis par le site (`PlayerStats`) et non
 * de la carrière. L'engagement de carrière (temps de survie, parties, jours) est désormais synchronisé depuis PUBG.
 */

/** Synchro de la carrière (src/lib/cron-jobs.ts) : réglage en base, sinon variable d'environnement, sinon défaut. */
const LIFETIME_SYNC_KEY = 'daily_lifetime_stats_sync'
const LIFETIME_SYNC_DEFAULT = '0 4 * * *'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.stats')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true, name: true, tag: true },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const [rows, activeMembers, syncSchedule] = await Promise.all([
      prisma.memberLifetimeStats.findMany({
        where: { member: { clanId: parsedClanId, isActive: true } },
        select: {
          lastRefreshedAt: true,
          combat: true,
          victory: true,
          support: true,
          vehicle: true,
          movement: true,
          other: true,
          member: { select: { id: true, displayName: true } },
        },
      }),
      prisma.clanMember.count({ where: { clanId: parsedClanId, isActive: true } }),
      prisma.cronSchedule.findUnique({ where: { key: LIFETIME_SYNC_KEY }, select: { expression: true, timezone: true } }),
    ])

    const expression = syncSchedule?.expression ?? process.env.CLAN_LIFETIME_STATS_SYNC_CRON ?? LIFETIME_SYNC_DEFAULT

    return Response.json({
      clan,
      members: rows.map((row) => ({
        memberId: row.member.id,
        displayName: row.member.displayName,
        lastRefreshedAt: row.lastRefreshedAt.toISOString(),
        stats: {
          combat: row.combat,
          victory: row.victory,
          support: row.support,
          vehicle: row.vehicle,
          movement: row.movement,
          other: row.other,
        } as CareerLifetimeStats,
      })),
      /** Membres actifs du clan, pour signaler ceux sans carrière synchronisée (compte PUBG introuvable…). */
      activeMemberCount: activeMembers,
      lifetimeSync: {
        expression,
        timezone: syncSchedule?.timezone ?? process.env.CLAN_MATCH_SYNC_TIMEZONE ?? 'UTC',
        runsPerDay: getCronRunsPerDay(expression),
      },
    })
  } catch (error) {
    console.error('Error fetching clan lifetime stats:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
