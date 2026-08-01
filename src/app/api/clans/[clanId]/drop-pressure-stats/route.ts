import {
  getDropPressureDashboardStats,
  getDropPressureMemberRanking,
} from '@/lib/drop-pressure-stats'
import { requirePermission } from '@/middleware/auth-permission'
import type { DropPressurePeriod } from '@/types/drop-pressure'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): DropPressurePeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_members')(request, {
    clanId: parsedClanId,
    allowMissingActor: true,
  })
  if (permissionError) return permissionError

  const period = parsePeriod(new URL(request.url).searchParams.get('period'))
  const [stats, ranking] = await Promise.all([
    getDropPressureDashboardStats({ clanId: parsedClanId, period }),
    getDropPressureMemberRanking({ clanId: parsedClanId, period }),
  ])
  return Response.json({ stats, ranking, period })
}