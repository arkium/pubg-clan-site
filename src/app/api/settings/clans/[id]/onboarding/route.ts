import { requirePlatformAdmin } from '@/lib/auth/admin-guards'
import { getClanOnboarding } from '@/lib/clan-onboarding/service'

/**
 * Mise en route d'un clan (page `/settings/clans/[clanId]/mise-en-route`, SuperUser) : les sept étapes, de la
 * validation à la ligue, avec leur état et leur action (`src/lib/clan-onboarding/`). Lecture seule ; les boutons de la
 * page appellent les routes existantes (`cron-control`, `telemetry/recoveries`).
 */

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

  const clanId = parseClanId((await params).id)
  if (!clanId) return Response.json({ error: 'ID de clan invalide' }, { status: 400 })

  try {
    const onboarding = await getClanOnboarding(clanId)
    if (!onboarding) return Response.json({ error: 'Clan introuvable.' }, { status: 404 })
    return Response.json(onboarding)
  } catch (error) {
    console.error(`[api/settings/clans/${clanId}/onboarding] Lecture impossible`, error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
