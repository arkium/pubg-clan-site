import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  archiveMembers,
  listUngroupedMembers,
  reactivateArchivedMember,
  selectArchiveCandidates,
} from '@/lib/clan-lifecycle/ungrouped-archive'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

/** Onglet « Ungrouped » de la page du chantier 5 : effectif du parking et purge. */

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('archive'), memberIds: z.array(z.number().int().positive()).min(1) }),
  z.object({ action: z.literal('reactivate'), memberId: z.number().int().positive() }),
])

export async function GET(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const { searchParams } = new URL(request.url)
    const rawThreshold = searchParams.get('thresholdDays')
    const thresholdOverride = rawThreshold ? Number(rawThreshold) : undefined

    const { thresholdDays, members } = await listUngroupedMembers({
      // Permet a l'UI de simuler un autre seuil avant de l'enregistrer.
      thresholdDays:
        Number.isInteger(thresholdOverride) && thresholdOverride! > 0 ? thresholdOverride : undefined,
    })

    const candidateIds = new Set(
      selectArchiveCandidates(members, thresholdDays).map((c) => c.memberId)
    )

    const archived = await prisma.clanMember.findMany({
      where: { archivedReason: { not: null }, isActive: false },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        lastMatchAt: true,
        archivedAt: true,
        archivedReason: true,
      },
      orderBy: { archivedAt: 'desc' },
      take: 100,
    })

    return Response.json({
      thresholdDays,
      members: members.map((member) => ({
        ...member,
        lastMatchAt: member.lastMatchAt?.toISOString() ?? null,
        eligibleAt: member.eligibleAt?.toISOString() ?? null,
        isCandidate: candidateIds.has(member.memberId),
      })),
      candidateCount: candidateIds.size,
      archived: archived.map((row) => ({
        ...row,
        lastMatchAt: row.lastMatchAt?.toISOString() ?? null,
        archivedAt: row.archivedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    console.error('Error loading ungrouped members:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const session = await getSessionFromRequest(request)
    const input = ActionSchema.parse(await request.json())

    if (input.action === 'archive') {
      const result = await archiveMembers(input.memberIds, session?.userId ?? null)
      return Response.json({
        success: true,
        archived: result.archived,
        message: `${result.archived} membre(s) archivé(s). Leur synchronisation PUBG est arrêtée.`,
      })
    }

    const result = await reactivateArchivedMember(input.memberId)
    return Response.json({
      success: result.reactivated,
      message: result.reactivated
        ? 'Membre réactivé dans le clan technique, son suivi reprend.'
        : "Ce membre n'a pas été archivé par la purge — rien à réactiver.",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Requête invalide', details: error.issues }, { status: 400 })
    }
    console.error('Error acting on ungrouped members:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
