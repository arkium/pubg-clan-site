import { getItemUsePeriodBounds, loadItemUseStats, type ItemUsePeriod } from '@/lib/item-use-stats'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): ItemUsePeriod {
  if (value === 'week' || value === 'month') return value
  return 'all'
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

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const stats = await loadItemUseStats({
      memberId,
      period,
      bounds: getItemUsePeriodBounds(period),
    })

    return Response.json({ data: stats })
  } catch (error) {
    console.error('Error fetching member item use:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
