import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getClanDataHealth } from '@/lib/clan-data-health'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Santé des données du clan, en lecture seule (docs/TODO/administration.md Q17). */
export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)
  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  try {
    return Response.json(await getClanDataHealth(parsedClanId))
  } catch (error) {
    console.error('[data-health] Read failed:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
