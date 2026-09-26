import { z } from 'zod'

import {
  ClanSubdomainError,
  getClanSubdomainSummary,
  setClanSubdomain,
} from '@/lib/clan-subdomain-service'
import { requireSuperUser } from '@/middleware/auth-permission'

/** Sous-domaine d'un clan, réservé au SuperUser — docs/TODO/chickendinnerfr.md §4.B. */

const UpdateSubdomainSchema = z.object({ subdomain: z.string().max(100) })

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) return permissionError

  const clanId = parseClanId((await params).id)
  if (!clanId) return Response.json({ error: 'ID de clan invalide' }, { status: 400 })

  try {
    const summary = await getClanSubdomainSummary(clanId)
    if (!summary) return Response.json({ error: 'Clan introuvable.' }, { status: 404 })
    return Response.json({ clan: summary, root: process.env.CLAN_SUBDOMAIN_ROOT?.trim() || null })
  } catch (error) {
    console.error('[settings/clans/subdomain] Lecture impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) return permissionError

  const clanId = parseClanId((await params).id)
  if (!clanId) return Response.json({ error: 'ID de clan invalide' }, { status: 400 })

  const parsed = UpdateSubdomainSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Requête invalide' }, { status: 400 })

  try {
    const subdomain = await setClanSubdomain(clanId, parsed.data.subdomain)
    return Response.json({ subdomain })
  } catch (error) {
    if (error instanceof ClanSubdomainError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[settings/clans/subdomain] Modification impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
