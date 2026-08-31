import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { upsertTrackedClanFromPubg } from '@/lib/clan-service'
import { fetchPubgClanById } from '@/lib/pubg'

import { prisma } from '@/lib/prisma'

const CreateTrackedClanSchema = z.object({
  pubgClanId: z.string().optional(),
  opponentClanId: z.string().optional(),
  platformShard: z.string().default('steam'),
}).refine(data => data.pubgClanId || data.opponentClanId, {
  message: "Soit pubgClanId soit opponentClanId doit être fourni"
})

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = CreateTrackedClanSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 })
    }

    let { pubgClanId, platformShard } = parsed.data
    const { opponentClanId } = parsed.data

    if (opponentClanId && !pubgClanId) {
      const opponentClan = await prisma.opponentClan.findUnique({
        where: { id: opponentClanId }
      })
      if (!opponentClan) {
        return Response.json({ error: 'OpponentClan introuvable' }, { status: 404 })
      }
      pubgClanId = opponentClan.pubgClanId
      platformShard = opponentClan.platformShard
    }

    if (!pubgClanId) {
      return Response.json({ error: 'pubgClanId manquant' }, { status: 400 })
    }

    // 1. Fetch from PUBG API
    const pubgClan = await fetchPubgClanById(pubgClanId, platformShard)
    if (!pubgClan) {
      return Response.json(
        { error: `Clan PUBG introuvable (ID: ${pubgClanId})` },
        { status: 404 }
      )
    }

    // 2. Upsert in database
    const trackedClan = await upsertTrackedClanFromPubg(pubgClan, platformShard)

    // Note: Default roles and telemetry stats will be handled automatically by crons.
    
    return Response.json({
      success: true,
      clan: {
        id: trackedClan.id,
        name: trackedClan.name,
        tag: trackedClan.tag,
      },
    })
  } catch (error) {
    console.error('Failed to track clan:', error)
    return Response.json(
      { error: 'Erreur inattendue lors du suivi du clan' },
      { status: 500 }
    )
  }
}
