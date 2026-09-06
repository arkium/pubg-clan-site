import { prisma } from '@/lib/prisma'
import { updateClanQuickStats, type ClanQuickStats } from '@/lib/clan-stats-cache'
import { isSuperUserSession } from '@/middleware/auth-permission'

/**
 * GET /api/clans
 * Récupère tous les clans actifs avec leurs statistiques précalculées depuis la DB.
 * Pour les SuperUsers, permet d'afficher également les clans en attente de validation via ?all=true.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wantsAll = searchParams.get('all') === 'true' || searchParams.get('status') === 'all'
    const isSU = wantsAll ? await isSuperUserSession(request) : false

    const clans = await prisma.clan.findMany({
      where: isSU ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            members: {
              where: { isActive: true },
            },
          },
        },
        clanConfigs: {
          where: { key: 'login_welcome_image_url' },
          select: { value: true },
        },
      },
    })

    const clansWithStats = await Promise.all(
      clans.map(async (clan) => {
        const clanStatsObj =
          clan.clanStats && typeof clan.clanStats === 'object'
            ? (clan.clanStats as Record<string, unknown>)
            : null

        let quickStats = clanStatsObj?.quickStats as ClanQuickStats | undefined

        // Si absent ou non calculé, calculer à la volée et persister en DB
        if (!quickStats) {
          try {
            quickStats = await updateClanQuickStats(clan.id)
          } catch (err) {
            console.error(`[api/clans] Erreur calcul à la volée pour clan ${clan.id}:`, err)
            quickStats = {
              matchesCount: 0,
              killsCount: 0,
              winsCount: 0,
              timePlayedSeconds: 0,
              activeDays: 0,
              lastMatchAt: null,
              computedAt: new Date().toISOString(),
            }
          }
        }

        const imageUrl = clan.clanConfigs[0]?.value || null

        return {
          id: clan.id,
          name: clan.name,
          tag: clan.tag,
          platformShard: clan.platformShard,
          membersCount: clan._count.members,
          matchesCount: quickStats.matchesCount ?? 0,
          killsCount: quickStats.killsCount ?? 0,
          winsCount: quickStats.winsCount ?? 0,
          lastMatchAt: quickStats.lastMatchAt ?? null,
          timePlayedSeconds: quickStats.timePlayedSeconds ?? 0,
          activeDays: quickStats.activeDays ?? 0,
          imageUrl,
          isActive: clan.isActive,
        }
      })
    )

    return Response.json(clansWithStats)
  } catch (error) {
    console.error('Error fetching clans:', error)
    return Response.json({ error: 'Failed to fetch clans' }, { status: 500 })
  }
}
