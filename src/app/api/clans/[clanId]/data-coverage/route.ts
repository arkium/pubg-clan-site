import { getClanPageCoverage } from '@/lib/data-coverage-service'
import { prisma } from '@/lib/prisma'
import { requireNavPermission } from '@/middleware/auth-permission'

/**
 * Barre « D'où viennent ces chiffres ? » des pages d'un clan (docs/TODO/aide-des-pages.md, lot 2) : depuis quand le
 * site a les données de ses membres actifs, famille par famille, et les analyses encore en file. Même lecture que
 * l'outil `getDataCoverage` du Coach IA (src/lib/data-coverage-service.ts), en cache 5 minutes. Garde de la vue
 * d'ensemble (`clan.overview`), ouverte en mode visiteur comme les pages : des dates et des volumes, aucun pseudo.
 */

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: rawClanId } = await params
  const clanId = parseClanId(rawClanId)
  if (!clanId) {
    return Response.json({ error: 'Clan invalide' }, { status: 400 })
  }

  const permissionError = await requireNavPermission('clan.overview')(request, { clanId })
  if (permissionError) return permissionError

  try {
    const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { id: true } })
    if (!clan) {
      return Response.json({ error: 'Clan introuvable' }, { status: 404 })
    }
    return Response.json(await getClanPageCoverage(clanId))
  } catch (error) {
    console.error('[Données du clan] Lecture impossible', error)
    return Response.json({ error: 'Lecture des dates de données impossible' }, { status: 500 })
  }
}
