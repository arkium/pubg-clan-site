import { prisma } from '@/lib/prisma'
import { updateClanQuickStats, type ClanQuickStats } from '@/lib/clan-stats-cache'

/** Un clan de l'annuaire et ses statistiques précalculées (`clanStats.quickStats`). */
export type ClanListItem = {
  id: number
  name: string
  tag: string
  platformShard: string | null
  membersCount: number
  matchesCount: number
  killsCount: number
  winsCount: number
  lastMatchAt: string | null
  timePlayedSeconds: number
  activeDays: number
  imageUrl: string | null
  isActive: boolean
  isSystem: boolean
  archivedAt: string | null
}

const EMPTY_QUICK_STATS = (): ClanQuickStats => ({
  matchesCount: 0,
  killsCount: 0,
  winsCount: 0,
  timePlayedSeconds: 0,
  activeDays: 0,
  lastMatchAt: null,
  computedAt: new Date().toISOString(),
})

/**
 * Clans actifs avec leurs statistiques précalculées — `GET /api/clans` et le bloc « En bref » de l'annuaire
 * (docs/TODO/geo-seo-propositions.md, lot 2) : une seule définition des totaux affichés par `/clans`.
 * `includeInactive` (SuperUser) ajoute les clans en attente de validation et archivés (docs/TODO/clan-archive.md).
 * Des statistiques absentes sont calculées à la volée et enregistrées.
 */
export async function listClansWithQuickStats(options: { includeInactive?: boolean; ids?: number[] } = {}): Promise<ClanListItem[]> {
  const clans = await prisma.clan.findMany({
    where: {
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(options.ids ? { id: { in: options.ids } } : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { members: { where: { isActive: true } } } },
      clanConfigs: { where: { key: 'login_welcome_image_url' }, select: { value: true } },
    },
  })

  return Promise.all(
    clans.map(async (clan) => {
      const clanStatsObj = clan.clanStats && typeof clan.clanStats === 'object' ? (clan.clanStats as Record<string, unknown>) : null
      let quickStats = clanStatsObj?.quickStats as ClanQuickStats | undefined

      // Si absent ou non calculé, calculer à la volée et persister en DB
      if (!quickStats) {
        try {
          quickStats = await updateClanQuickStats(clan.id)
        } catch (err) {
          console.error(`[api/clans] Erreur calcul à la volée pour clan ${clan.id}:`, err)
          quickStats = EMPTY_QUICK_STATS()
        }
      }

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
        imageUrl: clan.clanConfigs[0]?.value || null,
        isActive: clan.isActive,
        isSystem: clan.isSystem,
        archivedAt: clan.archivedAt?.toISOString() ?? null,
      }
    })
  )
}
