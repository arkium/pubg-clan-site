import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

/**
 * GET /api/clans
 * Récupère tous les clans actifs avec agrégats
 */
export async function GET() {
  try {
    const clans = await prisma.clan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            members: {
              where: { isActive: true },
            },
          },
        },
      },
    })

    const clansWithStats = await Promise.all(
      clans.map(async (clan) => {
        const matchesCount = await prisma.match.count({
          where: {
            member: {
              clanId: clan.id,
              isActive: true,
            },
          },
        })

        return {
          id: clan.id,
          name: clan.name,
          tag: clan.tag,
          platformShard: clan.platformShard,
          membersCount: clan._count.members,
          matchesCount,
        }
      })
    )

    return NextResponse.json(clansWithStats)
  } catch (error) {
    console.error('Error fetching clans:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clans' },
      { status: 500 }
    )
  }
}
