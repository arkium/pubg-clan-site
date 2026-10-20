import { requireClanAccess } from '@/lib/auth/admin-guards'
import { loadClanEncounteredPlayers, type EncounterPeriod } from '@/lib/clan-encountered-players-service'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): EncounterPeriod {
  return value === 'week' || value === 'month' ? value : 'all'
}

/** Adversaires croisés par un clan (page /clans/[clanId]/stats/opponents) : src/lib/clan-encountered-players-service.ts. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  // Noms de joueurs extérieurs au site (Q5) : membres connectés du clan et SuperUser, jamais les visiteurs
  const roleError = await requireClanAccess(request, parsedClanId, 'member')

  if (roleError) {
    return roleError
  }

  try {
    const period = parsePeriod(new URL(request.url).searchParams.get('period'))
    return Response.json({ data: await loadClanEncounteredPlayers(parsedClanId, period) })
  } catch (error) {
    console.error('Error fetching encountered players:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
