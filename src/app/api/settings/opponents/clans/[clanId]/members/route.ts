import { Prisma } from '@prisma/client'

import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

const CANDIDATES_LIMIT = 50

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const { clanId: clanIdParam } = await params
  const clanId = Number(clanIdParam)
  if (!Number.isInteger(clanId) || clanId <= 0) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { pubgClanId: true, platformShard: true },
  })
  if (!clan) {
    return Response.json({ error: 'Clan not found' }, { status: 404 })
  }

  const members = await prisma.clanMember.findMany({
    where: { clanId, isActive: true },
    orderBy: { displayName: 'asc' },
    select: { id: true, displayName: true, pubgPlayerName: true, joinStatus: true },
  })

  let missingCandidates: Array<{
    playerId: string
    pubgPlayerName: string
    pubgAccountId: string
    lastSeenAt: string
  }> = []

  if (clan.pubgClanId) {
    const rows = await prisma.$queryRaw<
      Array<{ playerId: string; pubgPlayerName: string; pubgAccountId: string; lastSeenAt: Date }>
    >(
      Prisma.sql`
        SELECT p.id as playerId, p.pubgPlayerName as pubgPlayerName, p.pubgAccountId as pubgAccountId, p.lastSeenAt as lastSeenAt
        FROM Player p
        INNER JOIN OpponentClan oc ON oc.id = p.opponentClanId
        WHERE oc.pubgClanId = ${clan.pubgClanId} AND oc.platformShard = ${clan.platformShard}
          AND NOT EXISTS (
            SELECT 1 FROM ClanMember cm WHERE cm.clanId = ${clanId} AND cm.pubgAccountId = p.pubgAccountId
          )
        ORDER BY p.lastSeenAt DESC
        LIMIT ${CANDIDATES_LIMIT}
      `
    )
    missingCandidates = rows.map((row) => ({
      playerId: row.playerId,
      pubgPlayerName: row.pubgPlayerName,
      pubgAccountId: row.pubgAccountId,
      lastSeenAt: row.lastSeenAt.toISOString(),
    }))
  }

  return Response.json({ members, missingCandidates, missingCandidatesLimit: CANDIDATES_LIMIT })
}
