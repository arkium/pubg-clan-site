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
    trackedElsewhere: { memberId: number; clanId: number | null; clanTag: string | null } | null
  }> = []

  if (clan.pubgClanId) {
    // `trackedElsewhere` : le candidat est déjà membre actif d'un AUTRE clan suivi.
    // Sans cette jointure, la page proposait « Ajouter à l'effectif » sur un joueur
    // déjà rattaché ailleurs, et le bouton le déplaçait silencieusement (incident
    // WESTEN88 du 2026-09-22, voir docs/features/cycle-de-vie-clan.md §11).
    const rows = await prisma.$queryRaw<
      Array<{
        playerId: string
        pubgPlayerName: string
        pubgAccountId: string
        lastSeenAt: Date
        trackedMemberId: number | null
        trackedClanId: number | null
        trackedClanTag: string | null
      }>
    >(
      Prisma.sql`
        SELECT p.id as playerId, p.pubgPlayerName as pubgPlayerName, p.pubgAccountId as pubgAccountId, p.lastSeenAt as lastSeenAt,
               cm.id as trackedMemberId, cm.clanId as trackedClanId, c.tag as trackedClanTag
        FROM Player p
        INNER JOIN OpponentClan oc ON oc.id = p.opponentClanId
        LEFT JOIN ClanMember cm
          ON cm.pubgAccountId = p.pubgAccountId
         AND cm.isActive = true
         AND cm.joinStatus = 'active'
         AND cm.clanId <> ${clanId}
        LEFT JOIN Clan c ON c.id = cm.clanId
        WHERE oc.pubgClanId = ${clan.pubgClanId} AND oc.platformShard = ${clan.platformShard}
          AND NOT EXISTS (
            SELECT 1 FROM ClanMember cm2 WHERE cm2.clanId = ${clanId} AND cm2.pubgAccountId = p.pubgAccountId
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
      trackedElsewhere:
        row.trackedMemberId != null
          ? { memberId: row.trackedMemberId, clanId: row.trackedClanId, clanTag: row.trackedClanTag }
          : null,
    }))
  }

  return Response.json({ members, missingCandidates, missingCandidatesLimit: CANDIDATES_LIMIT })
}
