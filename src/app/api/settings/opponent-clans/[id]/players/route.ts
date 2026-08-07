import { Prisma } from '@prisma/client'

import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

const PLAYERS_LIMIT = 50

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const { id } = await params

  const opponentClan = await prisma.opponentClan.findUnique({ where: { id } })
  if (!opponentClan) {
    return Response.json({ error: 'Opponent clan not found' }, { status: 404 })
  }

  const rows = await prisma.$queryRaw<
    Array<{
      playerId: string
      pubgPlayerName: string
      asOpponentCount: bigint
      asTeammateCount: bigint
      lastSeenAt: Date
      trackedMemberId: number | null
      trackedMemberName: string | null
      trackedClanTag: string | null
    }>
  >(
    Prisma.sql`
      SELECT
        p.id as playerId,
        p.pubgPlayerName as pubgPlayerName,
        COALESCE(SUM(ce.encounterCount - ce.teammateEncounterCount), 0) as asOpponentCount,
        COALESCE(SUM(ce.teammateEncounterCount), 0) as asTeammateCount,
        COALESCE(MAX(ce.lastSeenAt), p.lastSeenAt) as lastSeenAt,
        cm.id as trackedMemberId,
        cm.displayName as trackedMemberName,
        c.tag as trackedClanTag
      FROM Player p
      LEFT JOIN ClanEncounter ce ON ce.playerId = p.id
      LEFT JOIN ClanMember cm ON cm.pubgAccountId = p.pubgAccountId AND cm.isActive = true
      LEFT JOIN Clan c ON c.id = cm.clanId
      WHERE p.opponentClanId = ${id}
      GROUP BY p.id, cm.id, c.tag
      ORDER BY asOpponentCount DESC
      LIMIT ${PLAYERS_LIMIT}
    `
  )

  const players = rows.map((row) => ({
    playerId: row.playerId,
    pubgPlayerName: row.pubgPlayerName,
    asOpponentCount: Number(row.asOpponentCount),
    asTeammateCount: Number(row.asTeammateCount),
    lastSeenAt: row.lastSeenAt.toISOString(),
    trackedMember:
      row.trackedMemberId != null
        ? { id: row.trackedMemberId, displayName: row.trackedMemberName, clanTag: row.trackedClanTag }
        : null,
  }))

  return Response.json({ players, playersLimit: PLAYERS_LIMIT })
}
