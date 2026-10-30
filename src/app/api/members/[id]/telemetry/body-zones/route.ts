import { getMemberBodyZones } from '@/lib/body-zone-service'
import { prisma } from '@/lib/prisma'
import { buildTelemetryErrorResponse, buildTelemetrySuccessResponse } from '@/lib/pubg-telemetry/api-contract'
import type { StatsPeriod } from '@/lib/pubg-telemetry/period-keys'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Zones d'impact d'un joueur sur une période (docs/TODO/zones-d-impact.md, lot 2) : tirs infligés et subis par zone,
 * période précédente, 8 dernières semaines, et le taux de tête de son clan en regard. Lu dans `MemberBodyZoneStats`.
 */

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

function parsePeriod(value: string | null): StatsPeriod {
  return value === 'month' || value === 'all' ? value : 'week'
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json(buildTelemetryErrorResponse('Invalid member id', 'INVALID_MEMBER_ID'), { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { id: true, displayName: true, clanId: true } })
    if (!member) {
      return Response.json(buildTelemetryErrorResponse('Member not found', 'MEMBER_NOT_FOUND'), { status: 404 })
    }

    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    const report = await getMemberBodyZones(member, period)

    return Response.json(
      buildTelemetrySuccessResponse(
        { scope: 'member', memberId: member.id, period, periodKey: report.periodKey, count: report.matchesMeasured },
        { member: { id: member.id, displayName: member.displayName }, period, ...report }
      )
    )
  } catch (error) {
    console.error('[telemetry/body-zones] Lecture des zones d’impact du joueur impossible :', error)
    return Response.json(buildTelemetryErrorResponse('Internal Server Error', 'BODY_ZONES_FAILED'), { status: 500 })
  }
}
