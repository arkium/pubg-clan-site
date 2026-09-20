import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { PLAYER_CLAN_CHANGE_STATUSES } from '@/lib/player-clan-change'

/**
 * Historique des mutations de clan — chantier 1.
 *
 * Rend visibles les mouvements décidés automatiquement par le cron, pour qu'aucun
 * changement ne soit silencieux. Visible par **tout membre connecté** : c'est de la
 * transparence interne, pas une page anonyme — `/clans` exige déjà une session.
 *
 * Seuls les mouvements réellement survenus sont exposés (`applied`, `reverted`).
 * Les lignes `observed` et `ignored` sont du bruit de détection et restent réservées
 * au journal SuperUser du chantier 5.
 */

const PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

const VISIBLE_STATUSES = [
  PLAYER_CLAN_CHANGE_STATUSES.applied,
  PLAYER_CLAN_CHANGE_STATUSES.reverted,
]

function parsePositiveInt(raw: string | null, fallback: number, max: number) {
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parsePositiveInt(searchParams.get('page'), 1, 10_000)
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), PAGE_SIZE, MAX_PAGE_SIZE)
    const clanIdRaw = searchParams.get('clanId')
    const clanId = clanIdRaw ? Number(clanIdRaw) : null

    const where = {
      status: { in: VISIBLE_STATUSES },
      // Un clan filtre attrape les deux sens : arrivees et departs.
      ...(clanId && Number.isInteger(clanId)
        ? { OR: [{ previousClanId: clanId }, { newClanId: clanId }] }
        : {}),
    }

    const [total, rows] = await Promise.all([
      prisma.playerClanChange.count({ where }),
      prisma.playerClanChange.findMany({
        where,
        select: {
          id: true,
          source: true,
          status: true,
          detectedAt: true,
          appliedAt: true,
          clanMember: { select: { id: true, displayName: true } },
          previousClan: { select: { id: true, tag: true, name: true, isSystem: true } },
          newClan: { select: { id: true, tag: true, name: true, isSystem: true } },
        },
        orderBy: { detectedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return Response.json({
      mutations: rows.map((row) => ({
        id: row.id,
        source: row.source,
        status: row.status,
        at: (row.appliedAt ?? row.detectedAt).toISOString(),
        member: row.clanMember
          ? { id: row.clanMember.id, name: row.clanMember.displayName }
          : null,
        from: row.previousClan,
        to: row.newClan,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    console.error('Error fetching clan mutations:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
