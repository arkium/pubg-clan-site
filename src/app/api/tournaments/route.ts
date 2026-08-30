import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      include: {
        organizerClan: { select: { id: true, name: true } },
      },
      orderBy: [
        { status: 'asc' },
        { startDate: 'desc' },
      ],
    })
    return Response.json({ tournaments })
  } catch (error) {
    console.error('Error fetching tournaments:', error)
    return Response.json(
      { error: 'Failed to fetch tournaments' },
      { status: 500 }
    )
  }
}
