import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/clans
 * Récupère tous les clans
 */
export async function GET() {
  try {
    const clans = await prisma.clan.findMany({
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(clans)
  } catch (error) {
    console.error('Error fetching clans:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clans' },
      { status: 500 }
    )
  }
}
