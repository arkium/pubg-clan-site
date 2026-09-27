import {
  getDropPressureDashboardStats,
  getDropPressureMemberRanking,
  getDropPressureTimeline,
} from '@/lib/drop-pressure-stats'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Pression au drop d'un joueur (`/members/[id]/drop-zones`) : indicateurs de la période, classement du clan et
 * évolution sur 8 semaines. Servis jusqu'au 2026-09-27 par la route du tableau de bord, qu'ils ont quittée avec le
 * panneau (docs/features/membres.md).
 */

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const value = new URL(request.url).searchParams.get('period')
    const period = value === 'month' || value === 'all' ? value : 'week'

    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { clanId: true } })
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const [stats, ranking, timeline] = await Promise.all([
      getDropPressureDashboardStats({ memberId, period }),
      member.clanId ? getDropPressureMemberRanking({ clanId: member.clanId, period }) : Promise.resolve([]),
      getDropPressureTimeline({ memberId }),
    ])

    return Response.json({ period, stats, ranking, timeline })
  } catch (error) {
    console.error('Error fetching member drop pressure:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
