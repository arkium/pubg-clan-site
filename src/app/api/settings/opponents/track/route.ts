import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

export async function POST(req: NextRequest) {
  try {
    const permissionError = await requireSuperUser(req)
    if (permissionError) return permissionError

    const body = await req.json()
    let { playerId, targetClanId } = body

    if (!playerId) {
      return Response.json({ error: 'playerId is required' }, { status: 400 })
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId }
    })

    if (!player) {
      return Response.json({ error: 'Player not found' }, { status: 404 })
    }

    if (!targetClanId) {
      const { ensureTrackedClanForPlayer, getOrCreateUngroupedClan } = await import('@/lib/clan-service')
      const detectedClan = await ensureTrackedClanForPlayer(player.pubgAccountId, player.platformShard)
      targetClanId = detectedClan?.clan.id ?? (await getOrCreateUngroupedClan(player.platformShard)).id
    }

    // Check if player is already in the clan
    const existingMember = await prisma.clanMember.findFirst({
      where: {
        clanId: targetClanId,
        pubgAccountId: player.pubgAccountId
      }
    })

    if (existingMember) {
      if (existingMember.joinStatus === 'active') {
        return Response.json({ error: 'Ce joueur est déjà un membre actif de ce clan.' }, { status: 400 })
      }
      
      // A SuperUser explicitly confirming this player's clan membership is
      // equivalent to an approved join — no separate approval step exists
      // for scouted players (they have no site account to click "join").
      const updated = await prisma.clanMember.update({
        where: { id: existingMember.id },
        data: {
          isActive: true,
          joinStatus: 'active',
          playerId: player.id
        }
      })
      return Response.json(updated)
    }

    // Create new member — see note above on joinStatus: 'active'
    const newMember = await prisma.clanMember.create({
      data: {
        displayName: player.pubgPlayerName,
        pubgPlayerName: player.pubgPlayerName,
        pubgAccountId: player.pubgAccountId,
        platformShard: player.platformShard,
        isActive: true,
        joinStatus: 'active',
        clanId: targetClanId,
        playerId: player.id
      }
    })

    return Response.json(newMember)
  } catch (error: any) {
    console.error('Failed to track player:', error)
    if (error.message === 'Forbidden') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
