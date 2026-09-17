import { getItemUsePeriodBounds, loadItemUseStats, type ItemUsePeriod } from '@/lib/item-use-stats'
import { requireNavPermission } from '@/middleware/auth-permission'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): ItemUsePeriod {
  if (value === 'week' || value === 'month') return value
  return 'all'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)
    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requireNavPermission('clan.items')(request, { clanId: parsedClanId })
    if (permissionError) return permissionError

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const stats = await loadItemUseStats({
      clanId: parsedClanId,
      period,
      bounds: getItemUsePeriodBounds(period),
    })

    return Response.json({ data: stats })
  } catch (error) {
    console.error('Error fetching clan item use:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
