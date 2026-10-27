import { getMemberPageCoverage } from '@/lib/data-coverage-service'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Barre « D'où viennent ces chiffres ? » des pages d'un joueur (docs/TODO/aide-des-pages.md, lot 2) : depuis quand le
 * site a ses données, famille par famille, et les analyses encore en file pour son clan. Même lecture que l'outil
 * `getDataCoverage` du Coach IA (src/lib/data-coverage-service.ts), en cache 5 minutes. Lecture seule, mêmes droits
 * que ses statistiques ; des dates et des volumes, aucun compte.
 */

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const memberId = parseMemberId(id)
  if (!memberId) {
    return Response.json({ error: 'Invalid member id' }, { status: 400 })
  }

  const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
  if (authError) return authError

  try {
    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { clanId: true } })
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }
    return Response.json(await getMemberPageCoverage(memberId, member.clanId))
  } catch (error) {
    console.error('[Données du joueur] Lecture impossible', error)
    return Response.json({ error: 'Lecture des dates de données impossible' }, { status: 500 })
  }
}
