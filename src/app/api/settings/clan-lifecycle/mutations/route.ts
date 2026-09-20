import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { acknowledgePlayerClanChange, revertPlayerClanChange } from '@/lib/clan-lifecycle/revert'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Onglet « Mutations » — journal SuperUser du chantier 5.
 *
 * Contrairement à la page membre `/clans/mutations`, ce journal expose **tous** les
 * statuts, y compris les `observed` (écarts en cours de confirmation) et les
 * `pending` (créations de clan à valider) : c'est ici qu'on comprend pourquoi un
 * mouvement n'a pas encore eu lieu.
 */

const PAGE_SIZE = 30

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revert'), changeId: z.string().min(1) }),
  z.object({ action: z.literal('acknowledge'), changeId: z.string().min(1) }),
])

export async function GET(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const source = searchParams.get('source')
    const pageRaw = Number(searchParams.get('page') ?? '1')
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1

    const where = {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
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
          acknowledgedAt: true,
          runId: true,
          previousPubgClanTag: true,
          newPubgClanTag: true,
          clanMember: { select: { id: true, displayName: true, clanId: true } },
          previousClan: { select: { id: true, tag: true, name: true, isSystem: true } },
          newClan: { select: { id: true, tag: true, name: true, isSystem: true, isActive: true } },
        },
        orderBy: { detectedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])

    return Response.json({
      mutations: rows.map((row) => ({
        ...row,
        detectedAt: row.detectedAt.toISOString(),
        appliedAt: row.appliedAt?.toISOString() ?? null,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (error) {
    console.error('Error loading lifecycle mutations:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const session = await getSessionFromRequest(request)
    const input = ActionSchema.parse(await request.json())

    if (input.action === 'acknowledge') {
      if (!session?.userId) {
        return Response.json({ error: 'Session invalide' }, { status: 401 })
      }
      await acknowledgePlayerClanChange(input.changeId, session.userId)
      return Response.json({ success: true, message: 'Mouvement acquitté.' })
    }

    const outcome = await revertPlayerClanChange(input.changeId, session?.userId ?? null)

    if (!outcome.ok) {
      // 409 plutot que 400 : la demande est bien formee, c'est l'etat qui s'y oppose.
      return Response.json({ error: outcome.detail, reason: outcome.reason }, { status: 409 })
    }

    return Response.json({
      success: true,
      message: `${outcome.memberName} a été replacé dans son clan précédent.`,
      restoredClanId: outcome.restoredClanId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Requête invalide', details: error.issues }, { status: 400 })
    }
    console.error('Error acting on lifecycle mutation:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
