import { getSessionFromRequest } from '@/lib/auth-session'
import {
  ClanFollowActionSchema,
  ClanFollowError,
  archiveClan,
  getClanFollowSummary,
  reactivateClan,
} from '@/lib/clan-archive'
import { formatClanLabel } from '@/lib/clan-archive-state'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Arrêt de suivi et réactivation d'un clan — docs/TODO/clan-archive.md §4.A.
 *
 * `GET` décrit l'état du clan et son nombre de membres actifs (la boîte de dialogue en a
 * besoin pour savoir s'il faut demander le sort des membres). `PATCH` archive ou réactive.
 */

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function errorResponse(error: unknown, context: string) {
  if (error instanceof ClanFollowError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error(`[settings/clans] ${context}:`, error)
  return Response.json({ error: 'Internal Server Error' }, { status: 500 })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) return permissionError

  const clanId = parseClanId((await params).id)
  if (!clanId) return Response.json({ error: 'ID de clan invalide' }, { status: 400 })

  try {
    const summary = await getClanFollowSummary(clanId)
    if (!summary) return Response.json({ error: 'Clan introuvable.' }, { status: 404 })
    return Response.json(summary)
  } catch (error) {
    return errorResponse(error, 'Lecture du suivi impossible')
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) return permissionError

  const clanId = parseClanId((await params).id)
  if (!clanId) return Response.json({ error: 'ID de clan invalide' }, { status: 400 })

  const parsed = ClanFollowActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Requête invalide', details: parsed.error.issues }, { status: 400 })
  }

  try {
    if (parsed.data.action === 'reactivate') {
      const result = await reactivateClan(clanId)
      const label = formatClanLabel(result.clan)
      return Response.json({
        ...result,
        message:
          result.outcome === 'already_active'
            ? `Le clan ${label} est déjà suivi.`
            : `Le clan ${label} est de nouveau suivi. Ses anciens membres ne sont pas réintégrés automatiquement.`,
      })
    }

    const session = await getSessionFromRequest(request)
    const result = await archiveClan(clanId, parsed.data.membersDisposition, {
      triggeredByUserId: session?.userId ?? null,
    })
    const label = formatClanLabel(result.clan)
    const membersSuffix =
      result.membersMoved > 0
        ? ` ${result.membersMoved} membre(s) déplacé(s) vers le parking Ungrouped.`
        : result.membersDeactivated > 0
          ? ` ${result.membersDeactivated} membre(s) désactivé(s).`
          : ''

    return Response.json({
      ...result,
      message:
        result.outcome === 'already_archived'
          ? `Le clan ${label} n’était déjà plus suivi.`
          : `Le clan ${label} n’est plus suivi.${membersSuffix}`,
    })
  } catch (error) {
    return errorResponse(error, 'Changement de suivi impossible')
  }
}
