import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const rows = await prisma.memberThrowableStat.groupBy({
      by: ['itemId'],
      where: { memberId },
      _sum: { count: true },
    })

    const items = rows
      .map((row) => ({ itemId: row.itemId, count: row._sum.count ?? 0 }))
      .sort((left, right) => right.count - left.count)

    return Response.json({
      data: {
        totalThrows: items.reduce((sum, item) => sum + item.count, 0),
        items,
      },
    })
  } catch (error) {
    console.error('Error fetching member throwables:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
